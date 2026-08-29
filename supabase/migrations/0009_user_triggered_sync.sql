-- 0009_user_triggered_sync.sql
-- A "Sync now" the APPLICATION can call. Everything AdsPro does must be reachable from the
-- product by the customer; a step that needs an operator with database access is not a
-- feature, it is a bottleneck.
--
-- run_insights_sync(days) is the CRON entry point: it syncs EVERY account and is revoked
-- from `authenticated` on purpose. Exposing it to users would let one customer trigger work
-- on every other tenant and burn the shared Meta rate-limit ceiling.
--
-- This is the per-account equivalent, and it authorises the caller BEFORE posting:
--   * ownership is checked against auth.uid(), so a user can only sync their own account
--   * a 60-second cooldown per account stops a button from being leaned on
--   * it returns a jsonb verdict instead of raising, so the UI can show a real message

create or replace function public.request_insights_sync(
  p_account_id uuid,
  p_days       integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $function$
declare
  v_secret  text;
  v_url     text;
  v_owner   uuid;
  v_recent  timestamptz;
  v_days    integer := least(greatest(coalesce(p_days, 3), 1), 90);
begin
  -- 1. Authorise. auth.uid() is the caller's real identity; the account row is the boundary.
  select owner_user_id into v_owner
    from public.accounts where id = p_account_id;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_owner is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  -- 2. Cooldown. Meta's hourly ceiling is shared, and a stuck button is a real thing.
  select max(started_at) into v_recent
    from public.insights_sync_runs
   where account_id = p_account_id
     and started_at > now() - interval '60 seconds';

  if v_recent is not null then
    return jsonb_build_object(
      'ok', false, 'reason', 'cooldown',
      'retry_after_seconds', ceil(extract(epoch from (v_recent + interval '60 seconds' - now())))::int);
  end if;

  -- 3. Configuration. Same vault secrets as the cron path — one source of truth.
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'CAPI_CRON_SECRET' limit 1;
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'INSIGHTS_SYNC_URL' limit 1;

  if v_secret is null or v_url is null then
    return jsonb_build_object('ok', false, 'reason', 'not_configured');
  end if;

  -- 4. Fire. Scoped to ONE account: the fetcher filters on accountId.
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('days', v_days, 'accountId', p_account_id::text),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 55000
  );

  -- Deliberately does NOT report success of the SYNC — only that it was queued. The run's
  -- real outcome lands in insights_sync_runs a few seconds later, and that is what the UI
  -- must display. Saying "synced" here would be a lie the user could not check.
  return jsonb_build_object('ok', true, 'queued', true, 'days', v_days);
end;
$function$;

comment on function public.request_insights_sync(uuid, integer) is
  'In-app "Sync now" for ONE account. Checks auth.uid() owns the account, enforces a 60s cooldown, then posts a scoped run to the fetcher. Returns queued status only — the outcome belongs to insights_sync_runs.';

revoke all on function public.request_insights_sync(uuid, integer) from public, anon;
grant execute on function public.request_insights_sync(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Sync health, readable by the owner
-- ---------------------------------------------------------------------------
-- insights_sync_runs is RLS-scoped, but the UI needs the LATEST run per account plus a
-- plain-language verdict. Doing that in the client means every screen re-implements it.
create or replace view public.insights_sync_status
  with (security_invoker = true)
as
select distinct on (r.account_id)
  r.account_id,
  r.status,
  r.started_at,
  r.finished_at,
  r.rows_written,
  r.entities_upserted,
  r.meta_code,
  r.meta_subcode,
  r.error,
  (now() - r.started_at) as age,
  case
    when r.status = 'ok'                      then 'Collecting normally'
    when r.meta_code = 190                    then 'Meta connection expired — reconnect required'
    when r.meta_code = 200 or r.meta_code = 10 then 'Missing permission on this ad account'
    when r.meta_code = 17 or r.meta_code = 4  then 'Meta rate limit reached — will retry automatically'
    when r.status = 'failed'                  then 'Last sync failed'
    else 'Unknown'
  end as verdict
from public.insights_sync_runs r
where r.account_id is not null
order by r.account_id, r.started_at desc nulls last;

comment on view public.insights_sync_status is
  'Latest insights sync per account with a plain-language verdict. security_invoker, so RLS on insights_sync_runs scopes it to the owner. Built for the UI so no screen re-derives what a meta_code means.';
