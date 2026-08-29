-- AdsPro: verify the 3 in-flight items in ONE run.
-- Paste into Supabase SQL Editor (project wxgfaaaboftzsazknbvl) and run.

-- 1. pgcrypto installed?
select 'pgcrypto_installed' as check,
       (exists(select 1 from pg_extension where extname='pgcrypto'))::text as result;

-- 2. Is the stored Meta token actually encrypted, or still plaintext?
--    Meta tokens start with "EAA". If you see EAA... it is PLAINTEXT.
select 'token_storage' as check,
       coalesce(left(meta_access_token_encrypted::text, 12), '(null)') as result
from accounts
limit 5;

-- 3. All policies on status_events (need an INSERT policy for manual entry)
select 'policy' as check,
       tablename || ' | ' || cmd || ' | ' || policyname as result
from pg_policies
where schemaname='public' and tablename in ('status_events','leads','accounts')
order by tablename, cmd;

-- 4. Columns on accounts (confirm token column name + any new encryption cols)
select 'accounts_column' as check, column_name || ' ' || data_type as result
from information_schema.columns
where table_schema='public' and table_name='accounts'
order by ordinal_position;
