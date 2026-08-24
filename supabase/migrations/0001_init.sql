-- Lead Quality Sync — initial schema
-- Multi-tenant: every table scoped by account_id, isolated via RLS.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  meta_ad_account_id text,
  meta_dataset_id text,
  meta_access_token_encrypted text,       -- encrypted via pgcrypto, never stored plain
  meta_token_expires_at timestamptz,
  webhook_api_key text unique not null default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending_meta_connect'
    check (status in ('pending_meta_connect', 'active', 'token_expired', 'disabled')),
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  meta_leadgen_id text,
  event_id uuid not null default gen_random_uuid(), -- shared across all CAPI events for this lead, for dedup
  phone_hash text,
  email_hash text,
  fbc text,               -- Facebook click ID captured at submission time
  fbp text,               -- Facebook browser ID captured at submission time
  client_ip inet,
  client_user_agent text,
  ad_id text,
  campaign_id text,
  form_id text,
  raw_field_data jsonb,
  created_at timestamptz not null default now()
);
create index leads_account_id_idx on leads(account_id);
create index leads_meta_leadgen_id_idx on leads(meta_leadgen_id);

create table status_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null
    check (status in ('contacted', 'qualified', 'not_qualified', 'booked', 'no_show', 'purchased')),
  source text not null check (source in ('webhook', 'ncall', 'manual')),
  raw_payload jsonb,
  created_at timestamptz not null default now()
);
create index status_events_lead_id_idx on status_events(lead_id);

create table capi_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  status_event_id uuid not null references status_events(id) on delete cascade,
  meta_event_name text not null,
  http_status int,
  meta_response jsonb,
  retry_count int not null default 0,
  delivered_at timestamptz
);

-- RLS: an account is only visible/writable by its owning user.
alter table accounts enable row level security;
alter table leads enable row level security;
alter table status_events enable row level security;
alter table capi_delivery_logs enable row level security;

create policy "owner can manage own account" on accounts
  for all using (owner_user_id = auth.uid());

create policy "owner can view own leads" on leads
  for select using (account_id in (select id from accounts where owner_user_id = auth.uid()));

create policy "owner can view own status events" on status_events
  for select using (account_id in (select id from accounts where owner_user_id = auth.uid()));

create policy "owner can view own delivery logs" on capi_delivery_logs
  for select using (
    status_event_id in (
      select id from status_events where account_id in (
        select id from accounts where owner_user_id = auth.uid()
      )
    )
  );

-- Note: the webhook intake / status ingest / CAPI dispatcher run as service-role
-- (Edge Functions), bypassing RLS by design — they authenticate via webhook_api_key,
-- not a logged-in user session.
