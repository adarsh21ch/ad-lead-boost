-- 0002 — (a) point the cron at production, (b) schema for automatic Page connection
-- Applied 2026-08-27 via `supabase db query --linked` (not `db push`, because Lovable
-- applied its own equivalent of 0001 and the CLI migration ledger is not authoritative here).

-- ---------------------------------------------------------------------------
-- (a) CRON URL FIX — was pointing at a Lovable PREVIEW domain in production.
--     Verified 2026-08-27 07:16:32Z: adsproindia.com accepts the same
--     CAPI_CRON_SECRET and returns {"processed":0,"abandoned":0,"results":[]}.
-- ---------------------------------------------------------------------------
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
    url := 'https://adsproindia.com/api/public/cron/capi-dispatcher',
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

-- ---------------------------------------------------------------------------
-- (b) PAGE AUTO-CONNECT SCHEMA
--     Cache of Pages discovered from GET /me/accounts, plus the outcome of
--     POST /{page-id}/subscribed_apps. Failure must be VISIBLE, never silent —
--     that is the failure pattern that has cost this project the most time.
-- ---------------------------------------------------------------------------
create table if not exists public.meta_pages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  page_id text not null,
  page_name text,
  subscribe_status text not null default 'not_attempted'
    check (subscribe_status in ('not_attempted','subscribed','failed')),
  subscribe_error text,
  subscribed_at timestamptz,
  discovered_at timestamptz not null default now(),
  unique (account_id, page_id)
);

create index if not exists meta_pages_account_idx on public.meta_pages (account_id);

alter table public.meta_pages enable row level security;

drop policy if exists meta_pages_owner_select on public.meta_pages;
create policy meta_pages_owner_select on public.meta_pages
  for select using (
    exists (select 1 from public.accounts a
            where a.id = meta_pages.account_id and a.owner_user_id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policy on purpose: writes go through service-role
-- server routes only, after the route has verified ownership. Same shape as
-- status_events. Nothing writes from the browser.

-- Outcome of the CURRENTLY SELECTED page (accounts.meta_page_id), surfaced so the
-- dashboard can show a real state instead of an empty box.
alter table public.accounts
  add column if not exists page_subscribe_status text
    check (page_subscribe_status in ('not_attempted','subscribed','failed')),
  add column if not exists page_subscribe_error text,
  add column if not exists page_subscribed_at timestamptz;

comment on table public.meta_pages is
  'Pages discovered from Meta GET /me/accounts per account, with the result of subscribing each to the leadgen webhook. Written only by service-role server routes.';
comment on column public.accounts.page_subscribe_status is
  'Result of POST /{page-id}/subscribed_apps for accounts.meta_page_id. failed => leads will NOT arrive; surface this loudly in the UI.';
