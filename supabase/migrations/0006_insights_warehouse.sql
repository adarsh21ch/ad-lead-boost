-- 0006_insights_warehouse.sql
-- PHASE A of ANALYTICS_ROADMAP.md — the metrics warehouse.
-- Build-order item 4. Pure SQL, applied via `supabase db query --linked -f`.
--
-- What this is: local storage for Meta Ads Insights, pulled on a schedule. AdsPro must
-- NEVER query Meta live per page view — rate limits, latency, and it makes historical
-- comparison impossible because Meta only serves "now".
--
-- What this is NOT: the fetcher. Postgres cannot call Meta by itself here, because
-- decrypt_token(p_encrypted, p_key) takes the encryption key as an ARGUMENT and that key
-- is deliberately not in the database (it lives in the app's env, so that stealing the
-- DB does not hand over every customer's Meta token). The fetcher is a separate worker
-- that holds the key, calls Meta, and writes back through the RPCs below. Everything
-- else — schema, dedup, snapshot discipline, scheduling, evidence — is here.
--
-- ---------------------------------------------------------------------------
-- THREE DESIGN RULES, each one paid for by an earlier incident in this project
-- ---------------------------------------------------------------------------
-- 1. EVERY key is scoped by account_id. Meta's ids are globally unique but AdsPro is
--    multi-tenant, and RIGHT NOW both accounts (Xento 1d87b0f7… and the reviewer account
--    Acme Solar 823cf5ba…) point at the SAME ad account act_863995570089897. A primary
--    key of (entity_id, date) — as the roadmap sketch had it — would have collided
--    across tenants on day one. Session 7's lesson, in schema form: always join on
--    account_id before concluding anything.
--
-- 2. Meta REVISES the past. Spend and conversions change for days afterwards as late
--    attributions land, so the same query next week returns different numbers. Rows are
--    therefore append-only snapshots keyed by snapshot_at, never updates in place. That
--    is what makes "our numbers are accurate" defensible instead of a support argument.
--    Unchanged re-syncs do not write a new row; they bump last_seen_at, so the history
--    stays small and every row means "this number actually changed".
--
-- 3. Failure must be VISIBLE. insights_sync_runs records every run, including the runs
--    that never got off the ground. The 2026-08-28 dead-token incident stayed hidden for
--    a day precisely because a broken thing looked like a quiet thing.
--
-- RETENTION NOTE: run_retention_purge() deletes from public.leads only, and nothing here
-- cascades from leads, so insights survive the 90-day purge — deliberately. These are
-- aggregate ad metrics (spend, impressions, clicks), not personal data, and historical
-- comparison is the entire point of Phase A. The published /privacy 90-day promise is
-- about LEAD data; confirm the wording covers that distinction before the dashboard ships.

-- ===========================================================================
-- 1. THE HIERARCHY — campaign > adset > ad > creative, mirrored from Meta
-- ===========================================================================
create table if not exists public.ad_entities (
  account_id   uuid not null references public.accounts(id) on delete cascade,
  entity_id    text not null,                       -- Meta's id, unique only within Meta
  level        text not null check (level in ('campaign','adset','ad','creative')),
  parent_id    text,                                -- adset's campaign, ad's adset, etc.
  name         text,
  status       text,                                -- ACTIVE / PAUSED / ARCHIVED / DELETED
  effective_status text,                            -- what Meta ACTUALLY serves on; differs
                                                    -- from status when a parent is paused
  objective        text,                            -- campaigns
  optimization_goal text,                           -- adsets
  daily_budget      numeric,                        -- minor units as Meta returns them
  lifetime_budget   numeric,
  creative_id       text,                           -- ads
  creative_thumbnail_url text,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  primary key (account_id, entity_id)
);

create index if not exists ad_entities_account_level_idx
  on public.ad_entities (account_id, level);
create index if not exists ad_entities_parent_idx
  on public.ad_entities (account_id, parent_id);

comment on table public.ad_entities is
  'Campaign/adset/ad/creative hierarchy mirrored from Meta. Keyed by (account_id, entity_id) because two AdsPro accounts may legitimately point at the same Meta ad account.';
comment on column public.ad_entities.effective_status is
  'Meta''s effective_status, not status. An ad can be ACTIVE while its adset is paused; only effective_status says whether it is actually spending.';

-- ===========================================================================
-- 2. DAILY METRICS — append-only snapshots
-- ===========================================================================
create table if not exists public.ad_insights_daily (
  account_id   uuid not null references public.accounts(id) on delete cascade,
  entity_id    text not null,
  level        text not null check (level in ('campaign','adset','ad','creative')),
  stat_date    date not null,                       -- Meta's date_start. Named stat_date,
                                                    -- not "date", to keep queries unambiguous.
  spend        numeric,
  impressions  bigint,
  clicks       bigint,
  cpc          numeric,
  cpm          numeric,
  ctr          numeric,
  reach        bigint,
  frequency    numeric,
  meta_leads   integer,                             -- Meta's OWN lead count, for cross-check
  actions      jsonb,                               -- the raw actions array, kept verbatim so
                                                    -- meta_leads can be recomputed without
                                                    -- re-fetching if the mapping is wrong
  currency     text,                                -- spend is meaningless without it; the
                                                    -- roadmap sketch omitted this
  attribution_window text not null,                 -- e.g. '7d_click,1d_view'
  -- clock_timestamp(), NOT now(): now() is the TRANSACTION timestamp and is constant for
  -- the whole transaction, so two snapshots of the same entity/day written in one
  -- transaction collided on this primary key. Caught by the self-test on first run.
  snapshot_at  timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),  -- last re-sync that confirmed
                                                    -- this row unchanged; "how fresh is this?"
  sync_run_id  uuid,                                -- which run wrote it
  primary key (account_id, entity_id, stat_date, snapshot_at)
);

create index if not exists ad_insights_daily_lookup_idx
  on public.ad_insights_daily (account_id, level, stat_date);
create index if not exists ad_insights_daily_entity_idx
  on public.ad_insights_daily (account_id, entity_id, stat_date, snapshot_at desc);

-- Idempotent repair for a database that already has the now() default from the first
-- application of this migration.
alter table public.ad_insights_daily
  alter column snapshot_at  set default clock_timestamp(),
  alter column last_seen_at set default clock_timestamp();

comment on table public.ad_insights_daily is
  'Append-only daily Meta Insights snapshots. A new row means the number CHANGED; an unchanged re-sync only bumps last_seen_at. Query ad_insights_current unless you specifically want revision history.';
comment on column public.ad_insights_daily.attribution_window is
  'The action_attribution_windows this row was fetched under. Two rows with different windows are NOT comparable. Display it in the UI.';
comment on column public.ad_insights_daily.snapshot_at is
  'When Meta told us this. Meta revises spend and conversions for days; without this column "our numbers changed" is unanswerable.';

-- Latest snapshot per (account, entity, day). This is what the dashboard reads.
-- security_invoker so the view enforces the CALLER's RLS, not the owner's. Without it a
-- view over an RLS table is a cross-tenant leak.
drop view if exists public.ad_insights_current;
create view public.ad_insights_current
  with (security_invoker = true)
as
select distinct on (account_id, entity_id, stat_date) *
from public.ad_insights_daily
order by account_id, entity_id, stat_date, snapshot_at desc;

comment on view public.ad_insights_current is
  'Most recent snapshot per account/entity/day. Default read surface. Read ad_insights_daily directly only to show how a number was revised.';

-- ===========================================================================
-- 3. RUN EVIDENCE — every sync, especially the ones that failed
-- ===========================================================================
create table if not exists public.insights_sync_runs (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid references public.accounts(id) on delete cascade,  -- NULL = the run
                                                    -- never reached an account (bad config)
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running'
                 check (status in ('running','ok','partial','failed')),
  days_requested integer,
  date_from      date,
  date_to        date,
  levels         text[],
  meta_calls     integer not null default 0,
  entities_upserted   integer not null default 0,
  rows_written        integer not null default 0,
  rows_unchanged      integer not null default 0,
  error          text,                              -- Meta's message VERBATIM, never a rewrite
  meta_code      integer,
  meta_subcode   integer
);

create index if not exists insights_sync_runs_account_idx
  on public.insights_sync_runs (account_id, started_at desc);

comment on table public.insights_sync_runs is
  'One row per Insights sync attempt. status=failed with account_id NULL means the scheduler could not even start — check vault for INSIGHTS_SYNC_URL.';

-- ===========================================================================
-- 4. RLS
-- ===========================================================================
-- Warehouse rows are customer-facing (the dashboard reads them), so owners get SELECT.
-- No INSERT/UPDATE/DELETE policy anywhere: writes go through the service-role fetcher
-- and the security-definer RPCs below. Same shape as meta_pages and status_events.
alter table public.ad_entities       enable row level security;
alter table public.ad_insights_daily enable row level security;
alter table public.insights_sync_runs enable row level security;

drop policy if exists ad_entities_owner_select on public.ad_entities;
create policy ad_entities_owner_select on public.ad_entities
  for select using (
    exists (select 1 from public.accounts a
            where a.id = ad_entities.account_id and a.owner_user_id = auth.uid())
  );

drop policy if exists ad_insights_daily_owner_select on public.ad_insights_daily;
create policy ad_insights_daily_owner_select on public.ad_insights_daily
  for select using (
    exists (select 1 from public.accounts a
            where a.id = ad_insights_daily.account_id and a.owner_user_id = auth.uid())
  );

drop policy if exists insights_sync_runs_owner_select on public.insights_sync_runs;
create policy insights_sync_runs_owner_select on public.insights_sync_runs
  for select using (
    exists (select 1 from public.accounts a
            where a.id = insights_sync_runs.account_id and a.owner_user_id = auth.uid())
  );

-- ===========================================================================
-- 5. WRITE PATH — the fetcher's only entry points
-- ===========================================================================
-- All the logic lives here so the fetcher stays a dumb HTTP client. Same principle as
-- record_token_health(): one RPC per concern, state machine in SQL.

create or replace function public.upsert_ad_entities(
  p_account_id uuid,
  p_rows       jsonb   -- [{entity_id, level, parent_id, name, status, effective_status,
                       --   objective, optimization_goal, daily_budget, lifetime_budget,
                       --   creative_id, creative_thumbnail_url}, ...]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_count integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    continue when coalesce(r->>'entity_id','') = '' or coalesce(r->>'level','') = '';

    insert into public.ad_entities as e (
      account_id, entity_id, level, parent_id, name, status, effective_status,
      objective, optimization_goal, daily_budget, lifetime_budget,
      creative_id, creative_thumbnail_url, last_synced_at
    ) values (
      p_account_id, r->>'entity_id', r->>'level', nullif(r->>'parent_id',''),
      nullif(r->>'name',''), nullif(r->>'status',''), nullif(r->>'effective_status',''),
      nullif(r->>'objective',''), nullif(r->>'optimization_goal',''),
      nullif(r->>'daily_budget','')::numeric, nullif(r->>'lifetime_budget','')::numeric,
      nullif(r->>'creative_id',''), nullif(r->>'creative_thumbnail_url',''), now()
    )
    on conflict (account_id, entity_id) do update set
      level                  = excluded.level,
      -- coalesce: a partial sync (e.g. insights-only) must never blank a known name
      parent_id              = coalesce(excluded.parent_id, e.parent_id),
      name                   = coalesce(excluded.name, e.name),
      status                 = coalesce(excluded.status, e.status),
      effective_status       = coalesce(excluded.effective_status, e.effective_status),
      objective              = coalesce(excluded.objective, e.objective),
      optimization_goal      = coalesce(excluded.optimization_goal, e.optimization_goal),
      daily_budget           = coalesce(excluded.daily_budget, e.daily_budget),
      lifetime_budget        = coalesce(excluded.lifetime_budget, e.lifetime_budget),
      creative_id            = coalesce(excluded.creative_id, e.creative_id),
      creative_thumbnail_url = coalesce(excluded.creative_thumbnail_url, e.creative_thumbnail_url),
      last_synced_at         = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.upsert_ad_entities(uuid, jsonb) is
  'Mirrors a batch of Meta campaign/adset/ad/creative rows. Missing fields never overwrite known values with NULL, so a partial sync cannot erase names.';

create or replace function public.upsert_ad_insights(
  p_account_id  uuid,
  p_sync_run_id uuid,
  p_level       text,
  p_attribution_window text,
  p_currency    text,
  p_rows        jsonb  -- [{entity_id, stat_date, spend, impressions, clicks, cpc, cpm,
                       --   ctr, reach, frequency, actions}, ...]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_written    integer := 0;
  v_unchanged  integer := 0;
  v_skipped    integer := 0;
  v_latest     public.ad_insights_daily%rowtype;
  v_entity     text;
  v_date       date;
  v_spend      numeric;
  v_impr       bigint;
  v_clicks     bigint;
  v_cpc        numeric;
  v_cpm        numeric;
  v_ctr        numeric;
  v_reach      bigint;
  v_freq       numeric;
  v_actions    jsonb;
  v_leads      integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('written',0,'unchanged',0,'skipped',0);
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_entity := nullif(r->>'entity_id','');
    v_date   := nullif(r->>'stat_date','')::date;

    if v_entity is null or v_date is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_spend   := nullif(r->>'spend','')::numeric;
    v_impr    := nullif(r->>'impressions','')::bigint;
    v_clicks  := nullif(r->>'clicks','')::bigint;
    v_cpc     := nullif(r->>'cpc','')::numeric;
    v_cpm     := nullif(r->>'cpm','')::numeric;
    v_ctr     := nullif(r->>'ctr','')::numeric;
    v_reach   := nullif(r->>'reach','')::bigint;
    v_freq    := nullif(r->>'frequency','')::numeric;
    v_actions := case when jsonb_typeof(r->'actions') = 'array' then r->'actions' else null end;

    -- Meta reports lead conversions under several action_type labels depending on the ad
    -- and API version. Take the FIRST match in priority order, never the sum — summing
    -- would double-count one conversion reported under two labels.
    select (a->>'value')::numeric::integer
      into v_leads
      from jsonb_array_elements(coalesce(v_actions, '[]'::jsonb)) a
     where a->>'action_type' in ('leadgen.other','onsite_conversion.lead_grouped',
                                 'lead','offsite_conversion.fb_pixel_lead')
     order by case a->>'action_type'
                when 'leadgen.other' then 1
                when 'onsite_conversion.lead_grouped' then 2
                when 'lead' then 3
                else 4
              end
     limit 1;

    select * into v_latest
      from public.ad_insights_daily
     where account_id = p_account_id and entity_id = v_entity and stat_date = v_date
     order by snapshot_at desc
     limit 1;

    -- Unchanged? Then this re-sync is evidence of stability, not a new fact.
    if found
       and v_latest.spend       is not distinct from v_spend
       and v_latest.impressions is not distinct from v_impr
       and v_latest.clicks      is not distinct from v_clicks
       and v_latest.reach       is not distinct from v_reach
       and v_latest.meta_leads  is not distinct from v_leads
       and v_latest.attribution_window is not distinct from p_attribution_window
       and v_latest.currency    is not distinct from p_currency
    then
      update public.ad_insights_daily
         set last_seen_at = clock_timestamp()
       where account_id = p_account_id
         and entity_id  = v_entity
         and stat_date  = v_date
         and snapshot_at = v_latest.snapshot_at;
      v_unchanged := v_unchanged + 1;
    else
      insert into public.ad_insights_daily (
        account_id, entity_id, level, stat_date,
        spend, impressions, clicks, cpc, cpm, ctr, reach, frequency,
        meta_leads, actions, currency, attribution_window, sync_run_id
      ) values (
        p_account_id, v_entity, p_level, v_date,
        v_spend, v_impr, v_clicks, v_cpc, v_cpm, v_ctr, v_reach, v_freq,
        v_leads, v_actions, p_currency, p_attribution_window, p_sync_run_id
      );
      v_written := v_written + 1;
    end if;
  end loop;

  return jsonb_build_object('written', v_written, 'unchanged', v_unchanged, 'skipped', v_skipped);
end;
$$;

comment on function public.upsert_ad_insights(uuid, uuid, text, text, text, jsonb) is
  'Writes a batch of daily Insights as append-only snapshots. Identical re-syncs bump last_seen_at instead of inserting, so row count tracks REVISIONS, not sync frequency.';

-- Run bookkeeping ------------------------------------------------------------
create or replace function public.start_insights_sync_run(
  p_account_id uuid,
  p_days       integer,
  p_date_from  date,
  p_date_to    date,
  p_levels     text[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.insights_sync_runs (account_id, days_requested, date_from, date_to, levels)
  values (p_account_id, p_days, p_date_from, p_date_to, p_levels)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finish_insights_sync_run(
  p_run_id     uuid,
  p_status     text,
  p_meta_calls integer default 0,
  p_entities   integer default 0,
  p_written    integer default 0,
  p_unchanged  integer default 0,
  p_error      text    default null,
  p_code       integer default null,
  p_subcode    integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.insights_sync_runs
     set finished_at       = now(),
         status            = p_status,
         meta_calls        = coalesce(p_meta_calls, 0),
         entities_upserted = coalesce(p_entities, 0),
         rows_written      = coalesce(p_written, 0),
         rows_unchanged    = coalesce(p_unchanged, 0),
         error             = left(p_error, 2000),
         meta_code         = p_code,
         meta_subcode      = p_subcode
   where id = p_run_id;
end;
$$;

revoke all on function public.upsert_ad_entities(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_ad_insights(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.start_insights_sync_run(uuid, integer, date, date, text[]) from public, anon, authenticated;
revoke all on function public.finish_insights_sync_run(uuid, text, integer, integer, integer, integer, text, integer, integer) from public, anon, authenticated;

-- ===========================================================================
-- 6. SCHEDULING — same shape as run_capi_dispatcher()
-- ===========================================================================
-- Reads the target URL from vault so the fetcher can move (Edge Function today, an app
-- route tomorrow) without a migration. If it is not configured the job does NOT fail
-- silently: it records a visible failed run, rate-limited to one every 6 hours so the
-- alarm does not become its own noise problem.
create or replace function public.run_insights_sync(p_days integer default 3)
returns void
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $function$
declare
  v_secret     text;
  v_url        text;
  v_step       text := 'init';
  v_request_id bigint;
  v_last_gripe timestamptz;
begin
  v_step := 'vault_read';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'CAPI_CRON_SECRET' limit 1;
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'INSIGHTS_SYNC_URL' limit 1;

  if v_secret is null or v_url is null then
    select max(started_at) into v_last_gripe
      from public.insights_sync_runs
     where account_id is null and status = 'failed';

    if v_last_gripe is null or v_last_gripe < now() - interval '6 hours' then
      insert into public.insights_sync_runs (account_id, status, days_requested, finished_at, error)
      values (null, 'failed', p_days, now(),
              case when v_url is null
                   then 'INSIGHTS_SYNC_URL missing from vault — Insights sync has never run'
                   else 'CAPI_CRON_SECRET missing from vault' end);
    end if;

    raise log '[insights-sync] step=vault_read not configured (url_present=%, secret_present=%); skipping tick',
              (v_url is not null), (v_secret is not null);
    return;
  end if;

  v_step := 'http_post';
  select net.http_post(
    url     := v_url,
    body    := jsonb_build_object('days', p_days),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 55000     -- Insights + pagination is slower than a CAPI post
  ) into v_request_id;

  raise log '[insights-sync] step=http_post queued request_id=% days=%', v_request_id, p_days;
exception when others then
  raise log '[insights-sync] tick failed at step=% sqlstate=% message=%', v_step, sqlstate, sqlerrm;
end;
$function$;

comment on function public.run_insights_sync(integer) is
  'pg_cron entry point. Posts to the fetcher named by vault secret INSIGHTS_SYNC_URL. Does not talk to Meta itself — the token encryption key is deliberately not in this database.';

revoke all on function public.run_insights_sync(integer) from public, anon, authenticated;

-- Two cadences, on purpose:
--   hourly  — last 3 days, so today's spend is never more than an hour stale
--   daily   — last 28 days, because that is when Meta's retroactive revisions land
-- Times chosen to avoid jobid 2 (retention, 20:30 UTC) and jobid 3 (token expiry, 03:00).
select cron.unschedule(jobid) from cron.job where jobname = 'adspro-insights-sync-recent';
select cron.schedule('adspro-insights-sync-recent', '7 * * * *',
                     $$select public.run_insights_sync(3);$$);

select cron.unschedule(jobid) from cron.job where jobname = 'adspro-insights-sync-backfill';
select cron.schedule('adspro-insights-sync-backfill', '15 21 * * *',
                     $$select public.run_insights_sync(28);$$);
