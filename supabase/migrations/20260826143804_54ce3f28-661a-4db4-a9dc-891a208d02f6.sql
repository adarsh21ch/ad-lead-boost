create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Atomically claim due pending events. FOR UPDATE SKIP LOCKED plus pushing
-- next_attempt_at forward means overlapping dispatcher runs get disjoint
-- batches and can never double-send an event.
create or replace function public.claim_due_status_events(p_limit integer default 50)
returns table (
  id uuid,
  account_id uuid,
  lead_id uuid,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select se.id
    from public.status_events se
    where se.dispatch_status = 'pending'
      and se.next_attempt_at <= now()
    order by se.created_at asc
    limit greatest(coalesce(p_limit, 50), 1)
    for update skip locked
  )
  update public.status_events se
     set next_attempt_at = now() + interval '5 minutes'
   where se.id in (select due.id from due)
  returning se.id, se.account_id, se.lead_id, se.status, se.created_at;
end;
$$;

revoke all on function public.claim_due_status_events(integer) from public, anon, authenticated;
grant execute on function public.claim_due_status_events(integer) to service_role;

-- Scheduled runner: reads the cron credential from Vault, never from this file,
-- and never raises so a failed HTTP call cannot kill the schedule.
create or replace function public.run_capi_dispatcher()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'CAPI_CRON_SECRET'
  limit 1;

  if v_secret is null then
    raise log '[capi-dispatcher] CAPI_CRON_SECRET missing from vault; skipping tick';
    return;
  end if;

  perform net.http_post(
    url := 'https://project--b1df633d-19d0-434f-8ae6-a97ea799daff.lovable.app/api/public/cron/capi-dispatcher',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
exception when others then
  raise log '[capi-dispatcher] tick failed: %', sqlerrm;
end;
$$;

revoke all on function public.run_capi_dispatcher() from public, anon, authenticated;

select cron.unschedule('capi-dispatcher')
where exists (select 1 from cron.job where jobname = 'capi-dispatcher');

select cron.schedule(
  'capi-dispatcher',
  '*/2 * * * *',
  $$select public.run_capi_dispatcher();$$
);