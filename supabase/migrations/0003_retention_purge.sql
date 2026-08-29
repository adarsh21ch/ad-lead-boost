-- 0003_retention_purge.sql
-- Enforces the 90-day lead retention period promised at /privacy and /data-deletion.
--
-- Deleting a lead cascades: leads -> status_events -> capi_delivery_logs.
-- Accounts, meta_pages and auth users are NEVER touched by this job.
--
-- Runs daily at 20:30 UTC (02:00 IST), a quiet hour well away from the
-- every-2-minute CAPI dispatcher on jobid 1.

-- ---------------------------------------------------------------- audit trail
create table if not exists public.retention_runs (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  cutoff        timestamptz not null,
  leads_deleted integer     not null,
  note          text
);

comment on table public.retention_runs is
  'Evidence that the published 90-day lead retention promise is actually enforced.';

alter table public.retention_runs enable row level security;

-- Service-role only. Same shape as status_events: no write policy, and reads
-- stay closed because this is operator evidence, not customer-facing data.
drop policy if exists retention_runs_no_access on public.retention_runs;

-- --------------------------------------------------------------- purge itself
create or replace function public.run_retention_purge(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff  timestamptz := now() - make_interval(days => p_days);
  v_deleted integer;
begin
  delete from public.leads
  where created_at < v_cutoff;

  get diagnostics v_deleted = row_count;

  insert into public.retention_runs (cutoff, leads_deleted, note)
  values (v_cutoff, v_deleted, format('%s-day retention', p_days));

  return v_deleted;
end;
$$;

comment on function public.run_retention_purge(integer) is
  'Deletes leads older than p_days (default 90). Cascades to status_events and capi_delivery_logs. Logs every run to retention_runs.';

revoke all on function public.run_retention_purge(integer) from public, anon, authenticated;

-- ------------------------------------------------------------------ scheduling
select cron.unschedule(jobid)
from cron.job
where jobname = 'adspro-retention-purge';

select cron.schedule(
  'adspro-retention-purge',
  '30 20 * * *',
  $$select public.run_retention_purge(90);$$
);
