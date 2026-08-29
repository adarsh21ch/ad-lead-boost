-- 0005_token_health.sql
-- Token health detection, built RESPONSE-FIRST after the 2026-08-28 incident.
--
-- What went wrong: the Meta token was invalidated (code 190 / subcode 460) roughly two
-- MONTHS before its recorded expiry. meta_token_expires_at said 2026-10-25 and was a
-- perfectly healthy future date the whole time. accounts.status still read 'active'.
-- Nothing in the system knew. It only surfaced because a human ran a Graph call by hand.
--
-- Therefore: the expiry DATE is a secondary hint, never the detector. The detector is what
-- Meta actually says when we call it. Every Meta call site reports its outcome here.
--
-- accounts.status is deliberately NOT reused. It describes the ACCOUNT lifecycle
-- (pending_meta_connect / active / token_expired / disabled); an account can be perfectly
-- active while its token is dead. Conflating the two is what hid this for a day.

alter table public.accounts
  add column if not exists token_status text not null default 'unknown',
  add column if not exists token_last_ok_at     timestamptz,
  add column if not exists token_last_error     text,
  add column if not exists token_last_error_at  timestamptz,
  add column if not exists token_invalid_since  timestamptz;

do $$
begin
  alter table public.accounts
    add constraint accounts_token_status_check
    check (token_status in ('unknown','healthy','invalid','expiring_soon'));
exception when duplicate_object then null;
end $$;

comment on column public.accounts.token_status is
  'Token health from ACTUAL Meta responses, not from the expiry date. invalid => every Meta call is failing; the customer must reconnect and the UI must say so loudly.';
comment on column public.accounts.token_invalid_since is
  'First moment a 190 was seen. Answers "how long were we silently broken?" — the question nobody could answer on 2026-08-28.';

-- ---------------------------------------------------------------- evidence trail
create table if not exists public.token_health_events (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  event        text not null check (event in ('ok','invalid','reconnected','expiring_soon')),
  source       text,          -- which call site: dispatcher | pages | enrichment | insights | oauth
  meta_code    integer,
  meta_subcode integer,
  meta_message text,          -- Meta's message VERBATIM. Never a friendly rewrite.
  created_at   timestamptz not null default now()
);

create index if not exists token_health_events_account_idx
  on public.token_health_events (account_id, created_at desc);

alter table public.token_health_events enable row level security;
-- Service-role writes only, same shape as status_events and meta_pages.

comment on table public.token_health_events is
  'Every Meta call outcome that says something about token health. The audit trail for how long a token was dead before anyone noticed.';

-- ------------------------------------------------- the one call the app routes make
-- Keeps the state machine in SQL so the app side stays a single line per call site.
create or replace function public.record_token_health(
  p_account_id uuid,
  p_event      text,
  p_source     text default null,
  p_code       integer default null,
  p_subcode    integer default null,
  p_message    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.token_health_events
    (account_id, event, source, meta_code, meta_subcode, meta_message)
  values (p_account_id, p_event, p_source, p_code, p_subcode, left(p_message, 2000));

  if p_event = 'ok' then
    update public.accounts
       set token_status        = 'healthy',
           token_last_ok_at    = now(),
           token_last_error    = null,
           token_last_error_at = null,
           token_invalid_since = null
     where id = p_account_id;

  elsif p_event = 'invalid' then
    update public.accounts
       set token_status        = 'invalid',
           token_last_error    = left(p_message, 2000),
           token_last_error_at = now(),
           -- preserve the FIRST failure time across repeated failures
           token_invalid_since = coalesce(token_invalid_since, now())
     where id = p_account_id;

  elsif p_event = 'reconnected' then
    update public.accounts
       set token_status        = 'healthy',
           token_last_ok_at    = now(),
           token_last_error    = null,
           token_last_error_at = null,
           token_invalid_since = null
     where id = p_account_id;

  elsif p_event = 'expiring_soon' then
    -- never downgrade a known-invalid token to a mere warning
    update public.accounts
       set token_status = 'expiring_soon'
     where id = p_account_id
       and token_status <> 'invalid';
  end if;
end;
$$;

comment on function public.record_token_health(uuid, text, text, integer, integer, text) is
  'Single entry point for token health. App routes call this once per Meta response: ok on success, invalid on code 190. Everything else is handled here.';

revoke all on function public.record_token_health(uuid, text, text, integer, integer, text)
  from public, anon, authenticated;

-- --------------------------------------------- SECONDARY check: the expiry date
-- Advance warning only. It would NOT have caught the 2026-08-28 incident and must never
-- be mistaken for the detector.
create or replace function public.check_token_expiry(p_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_flagged integer;
begin
  with due as (
    select id from public.accounts
     where meta_token_expires_at is not null
       and meta_token_expires_at < now() + make_interval(days => p_days)
       and token_status not in ('invalid','expiring_soon')
  )
  update public.accounts a
     set token_status = 'expiring_soon'
    from due where a.id = due.id;

  get diagnostics v_flagged = row_count;

  insert into public.token_health_events (account_id, event, source, meta_message)
  select id, 'expiring_soon', 'expiry_cron',
         format('expires %s, within %s days', meta_token_expires_at, p_days)
  from public.accounts
  where token_status = 'expiring_soon' and meta_token_expires_at is not null
    and meta_token_expires_at < now() + make_interval(days => p_days);

  return v_flagged;
end;
$$;

revoke all on function public.check_token_expiry(integer) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'adspro-token-expiry-check';
select cron.schedule('adspro-token-expiry-check', '0 3 * * *',
                     $$select public.check_token_expiry(7);$$);

-- ------------------------------------------------------------------- backfill
-- Xento's token demonstrably worked at 2026-08-28T17:46:08Z (lead enrichment, HTTP 200).
update public.accounts
   set token_status = 'healthy', token_last_ok_at = timestamptz '2026-08-28 17:46:08+00'
 where meta_access_token_encrypted is not null and token_status = 'unknown';
