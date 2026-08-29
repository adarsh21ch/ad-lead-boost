-- AdsPro — ONE result set. Supabase SQL editor only shows the LAST statement's output,
-- so everything is unioned into a single query. Read-only. Returns no secrets.
select * from (
  select 1 as ord, 'crypto_fn' as section,
         n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as detail,
         'security_definer='||p.prosecdef::text as extra
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname ilike '%crypt%' or p.proname ilike '%token%'

  union all
  select 2, 'pgcrypto_ext',
         extname||' installed in schema '||(extnamespace::regnamespace)::text,
         'version '||extversion
  from pg_extension where extname = 'pgcrypto'

  union all
  select 3, 'account',
         'status='||status
           ||' | ad_acct='||coalesce(meta_ad_account_id,'(NONE)')
           ||' | dataset='||coalesce(meta_dataset_id,'(NONE)'),
         case
           when meta_access_token_encrypted is null        then 'token=NULL'
           when meta_access_token_encrypted like '\xc30d%' then 'token=ENCRYPTED (pgcrypto) OK'
           when meta_access_token_encrypted like 'EAA%'    then 'token=PLAINTEXT !!'
           else 'token=OTHER first8='||left(meta_access_token_encrypted,8)
         end
           ||' | expires='||coalesce(meta_token_expires_at::text,'(none)')
  from accounts

  union all
  select 4, 'search_path', current_setting('search_path'), current_user
) x order by ord, detail;
