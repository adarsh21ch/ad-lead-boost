create or replace function public.run_capi_dispatcher()
returns void
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $function$
declare
  v_secret text;
  v_step text := 'init';
  v_request_id bigint;
begin
  v_step := 'vault_read';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'CAPI_CRON_SECRET'
  limit 1;

  if v_secret is null then
    raise log '[capi-dispatcher] step=vault_read CAPI_CRON_SECRET missing from vault; skipping tick';
    return;
  end if;

  v_step := 'http_post';
  select net.http_post(
    url := 'https://project--b1df633d-19d0-434f-8ae6-a97ea799daff.lovable.app/api/public/cron/capi-dispatcher',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 20000
  ) into v_request_id;

  raise log '[capi-dispatcher] step=http_post queued request_id=%', v_request_id;
exception when others then
  raise log '[capi-dispatcher] tick failed at step=% sqlstate=% message=%', v_step, sqlstate, sqlerrm;
end;
$function$;