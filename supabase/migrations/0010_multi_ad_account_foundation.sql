-- 0010_multi_ad_account_foundation.sql
-- Makes the warehouse honest about WHICH Meta ad account a number came from, and closes the
-- one real correctness hole that only bites once a customer has more than one account.
--
-- Applied while ad_entities and ad_insights_daily are still EMPTY. Every part of this gets
-- materially more expensive once they are not: a column addition becomes a backfill, and a
-- unique index becomes a data-cleanup exercise.
--
-- Deliberately does NOT build agency/multi-account UI. It makes the data model able to
-- express it, so the UI can be added later with no migration of live data.

-- ---------------------------------------------------------------------------
-- 1. The ad account's NAME
-- ---------------------------------------------------------------------------
-- "act_2447097022359700" is not something a human can recognise. The name is already
-- fetched during connection validation and by the insights fetcher; it was simply thrown
-- away. Storing it means every screen can show it without another Meta call.
alter table public.accounts
  add column if not exists meta_ad_account_name text;

comment on column public.accounts.meta_ad_account_name is
  'Human-readable Meta ad account name (e.g. "SAGAR ADS 1"). Display only; meta_ad_account_id remains the identifier. Populated by the insights fetcher and by the in-app ad-account picker.';

-- ---------------------------------------------------------------------------
-- 2. Provenance on every warehouse row
-- ---------------------------------------------------------------------------
-- Both tables are keyed by (account_id, entity_id) where account_id is the ADSPRO account.
-- Nothing recorded which META ad account the numbers came from. Consequences, both real:
--   * change a customer's ad account and yesterday's rows sit beside tomorrow's with
--     nothing to tell them apart
--   * per-ad-account reporting is impossible without it
alter table public.ad_entities      add column if not exists meta_ad_account_id text;
alter table public.ad_insights_daily add column if not exists meta_ad_account_id text;

create index if not exists ad_entities_meta_acct_idx
  on public.ad_entities (account_id, meta_ad_account_id);
create index if not exists ad_insights_daily_meta_acct_idx
  on public.ad_insights_daily (account_id, meta_ad_account_id, stat_date);

-- Stamped by trigger rather than by changing upsert_ad_entities / upsert_ad_insights.
-- Both RPCs already receive p_account_id, so the ad account is derivable inside the
-- database. A trigger keeps two large, already-tested functions untouched and means the
-- Edge Function needs no new argument -- fewer moving parts to get wrong.
create or replace function public.stamp_meta_ad_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.meta_ad_account_id is null then
    select a.meta_ad_account_id into new.meta_ad_account_id
      from public.accounts a where a.id = new.account_id;
  end if;
  return new;
end;
$$;

comment on function public.stamp_meta_ad_account() is
  'Fills meta_ad_account_id on warehouse rows from the owning account. Only when NULL, so a historical row keeps the ad account it was actually collected from even after the account is repointed.';

drop trigger if exists stamp_meta_ad_account_entities on public.ad_entities;
create trigger stamp_meta_ad_account_entities
  before insert or update on public.ad_entities
  for each row execute function public.stamp_meta_ad_account();

drop trigger if exists stamp_meta_ad_account_insights on public.ad_insights_daily;
create trigger stamp_meta_ad_account_insights
  before insert or update on public.ad_insights_daily
  for each row execute function public.stamp_meta_ad_account();

-- ---------------------------------------------------------------------------
-- 3. *** One Facebook Page may belong to only ONE AdsPro account ***
-- ---------------------------------------------------------------------------
-- This is a correctness bug, not a UI gap. meta-leadgen.ts builds a page_id -> account map
-- and looks each incoming lead up in it. With two accounts claiming the same Page, whichever
-- row is built last silently wins and leads are delivered to the WRONG customer. Nothing
-- errors, nothing logs, and the loss is invisible from both sides. Harmless with one account
-- per user; a data-leak the day agency mode ships.
create unique index if not exists accounts_meta_page_id_unique
  on public.accounts (meta_page_id)
  where meta_page_id is not null;

comment on index public.accounts_meta_page_id_unique is
  'A Facebook Page routes leads to exactly one AdsPro account. Without this, two accounts claiming one Page silently misroute leads to the wrong tenant.';

-- ---------------------------------------------------------------------------
-- 4. Views re-expose the new dimension
-- ---------------------------------------------------------------------------
-- ad_insights_current is "select distinct on (...) *": the star was expanded at creation, so
-- it does NOT pick up the new column on its own. Replacing it re-expands the star, appending
-- meta_ad_account_id at the end -- permitted by create or replace view, and safe for the
-- dependent view below.
create or replace view public.ad_insights_current
  with (security_invoker = true)
as
select distinct on (account_id, entity_id, stat_date) *
from public.ad_insights_daily
order by account_id, entity_id, stat_date, snapshot_at desc;

-- *** ad_performance_daily goes from 36 to 38 columns (meta_ad_account_id,
-- meta_ad_account_name added after account_id). The "36 columns" tripwire used in earlier
-- sessions to detect unrequested Lovable DDL is now a 38-COLUMN tripwire. ***
drop view if exists public.ad_performance_daily;
create view public.ad_performance_daily
  with (security_invoker = true)
as
with lead_facts as (
  -- One row per lead, with its funnel outcomes flattened.
  -- "Ever reached" semantics: a lead that went contacted -> qualified -> purchased counts
  -- in all three. That is what a funnel means. Using only the LATEST status would erase
  -- every intermediate step and make qualification rate meaningless.
  select
    l.account_id,
    l.id                       as lead_id,
    l.ad_id,
    -- The lead's own value wins; ad_entities is only consulted where Meta left a gap.
    coalesce(l.adset_id,    ade.parent_id)  as adset_id,
    coalesce(l.campaign_id, adse.parent_id) as campaign_id,
    (l.created_at at time zone coalesce(acc.meta_ad_account_timezone, 'UTC'))::date as lead_date,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'contacted')     as is_contacted,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'qualified')     as is_qualified,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'not_qualified') as is_disqualified,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'booked')        as is_booked,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'no_show')       as is_no_show,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'purchased')     as is_purchased
  from public.leads l
  join public.accounts acc on acc.id = l.account_id
  -- ad -> its adset. Scoped by account_id: entity ids are unique only within Meta, and two
  -- AdsPro accounts currently point at the SAME Meta ad account.
  left join public.ad_entities ade
         on ade.account_id = l.account_id
        and ade.entity_id  = l.ad_id
        and ade.level      = 'ad'
  -- adset -> its campaign. Chains off the derived adset when the lead had none of its own.
  left join public.ad_entities adse
         on adse.account_id = l.account_id
        and adse.entity_id  = coalesce(l.adset_id, ade.parent_id)
        and adse.level      = 'adset'
),
lead_rollup as (
  -- Same aggregation at each level of the hierarchy. A lead counts once per level —
  -- never summed across levels.
  select account_id, 'campaign'::text as level, campaign_id as entity_id, lead_date,
         count(*) as leads,
         count(*) filter (where is_contacted)    as contacted,
         count(*) filter (where is_qualified)    as qualified,
         count(*) filter (where is_disqualified) as disqualified,
         count(*) filter (where is_booked)       as booked,
         count(*) filter (where is_no_show)      as no_show,
         count(*) filter (where is_purchased)    as purchased
    from lead_facts where campaign_id is not null
   group by account_id, campaign_id, lead_date
  union all
  select account_id, 'adset', adset_id, lead_date,
         count(*), count(*) filter (where is_contacted), count(*) filter (where is_qualified),
         count(*) filter (where is_disqualified), count(*) filter (where is_booked),
         count(*) filter (where is_no_show), count(*) filter (where is_purchased)
    from lead_facts where adset_id is not null
   group by account_id, adset_id, lead_date
  union all
  select account_id, 'ad', ad_id, lead_date,
         count(*), count(*) filter (where is_contacted), count(*) filter (where is_qualified),
         count(*) filter (where is_disqualified), count(*) filter (where is_booked),
         count(*) filter (where is_no_show), count(*) filter (where is_purchased)
    from lead_facts where ad_id is not null
   group by account_id, ad_id, lead_date
)
select
  i.account_id,
  i.meta_ad_account_id,
  acc2.meta_ad_account_name,
  i.level,
  i.entity_id,
  e.name              as entity_name,
  e.parent_id,
  e.effective_status,
  e.creative_thumbnail_url,
  i.stat_date,

  -- spend side (Meta)
  i.spend, i.impressions, i.clicks, i.ctr, i.cpc, i.cpm, i.reach, i.frequency,
  i.currency,
  i.meta_leads,

  -- outcome side (AdsPro) — these ARE the sample size, and are never optional
  coalesce(r.leads, 0)        as adspro_leads,
  coalesce(r.contacted, 0)    as contacted,
  coalesce(r.qualified, 0)    as qualified,
  coalesce(r.disqualified, 0) as disqualified,
  coalesce(r.booked, 0)       as booked,
  coalesce(r.no_show, 0)      as no_show,
  coalesce(r.purchased, 0)    as purchased,

  -- the four numbers nobody else can compute
  round(i.spend / nullif(r.leads, 0), 2)     as cost_per_lead,
  round(i.spend / nullif(r.qualified, 0), 2) as cost_per_qualified_lead,
  round(i.spend / nullif(r.booked, 0), 2)    as cost_per_booked,
  round(i.spend / nullif(r.purchased, 0), 2) as cost_per_purchase,
  round(r.qualified::numeric / nullif(r.leads, 0), 4) as qualification_rate,
  round(r.purchased::numeric / nullif(r.leads, 0), 4) as close_rate,

  -- Ranking guard. 30 is a convention, not a significance test — but a creative with 3
  -- leads must never be presented as beating one with 40, so the flag travels WITH the
  -- numbers rather than being left to the UI to remember.
  (coalesce(r.leads, 0) < 30) as low_sample,

  -- Diagnostic: Meta's own lead count vs what actually reached AdsPro. A persistent gap
  -- means leads are being lost between Meta and the webhook.
  coalesce(r.leads, 0) - coalesce(i.meta_leads, 0) as lead_delivery_gap,

  -- provenance, always visible — two rows under different windows are not comparable
  i.attribution_window,
  i.snapshot_at,
  i.last_seen_at
from public.ad_insights_current i
left join public.accounts acc2
       on acc2.id = i.account_id
left join public.ad_entities e
       on e.account_id = i.account_id and e.entity_id = i.entity_id
left join lead_rollup r
       on r.account_id = i.account_id
      and r.level      = i.level
      and r.entity_id  = i.entity_id
      and r.lead_date  = i.stat_date;

comment on view public.ad_performance_daily is
  'PHASE B. Meta spend joined to AdsPro lead outcomes per entity per day, carrying the Meta ad account it came from so reporting can be segregated when a customer runs more than one. A lead carrying only ad_id is resolved up to its adset and campaign through ad_entities.parent_id. Resolution happens at query time: attribution appears retroactively once the hourly sync has seen the ad.';
