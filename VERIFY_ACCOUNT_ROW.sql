-- AdsPro — verification (v2). Read-only. Safe to run whole.
-- v1 aborted because decrypt_token(text) does not exist. This version never calls it.

-- 1) The accounts row + storage verdict (no function calls).
select
  id, name, status,
  meta_ad_account_id,
  meta_dataset_id,
  meta_token_expires_at,
  (meta_token_expires_at - now()) as token_ttl,
  case
    when meta_access_token_encrypted is null      then 'NULL — no token stored'
    when meta_access_token_encrypted like '\xc30d%' then 'ENCRYPTED (pgcrypto PGP) OK'
    when meta_access_token_encrypted like 'EAA%'  then 'PLAINTEXT !! not encrypted'
    else 'OTHER format, first 8 chars: ' || left(meta_access_token_encrypted, 8)
  end as token_storage_verdict,
  length(meta_access_token_encrypted) as token_len,
  webhook_api_key,
  created_at
from accounts
order by created_at desc;

-- 2) What crypto functions ACTUALLY exist, and with what argument signatures?
--    This is the query that answers the 42883 error.
select
  n.nspname   as schema,
  p.proname   as fn,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname ilike '%crypt%' or p.proname ilike '%token%'
order by 1,2;

-- 3) Is pgcrypto even installed, and in which schema?
select extname, extnamespace::regnamespace as schema, extversion
from pg_extension where extname = 'pgcrypto';

-- 4) Pipeline state.
select 'leads' t, count(*) from leads
union all select 'status_events', count(*) from status_events
union all select 'capi_delivery_logs', count(*) from capi_delivery_logs;
