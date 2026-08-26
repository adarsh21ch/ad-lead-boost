create schema if not exists extensions;
drop extension if exists pg_net;
create extension pg_net with schema extensions;

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

  perform extensions.http_post(
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