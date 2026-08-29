Paste everything below into Lovable to scaffold the AdsPro project (new Lovable project,
connect a fresh Supabase project when it asks — do not connect to the nFlow/Nevorai one).

---

Build "AdsPro" — a multi-tenant tool that lets advertisers running Meta Lead Ads connect
their ad account, then sync lead-status outcomes (Qualified, Booked, Purchased, etc.) back
to Meta via the Conversions API, so Meta's algorithm learns to find people who actually
convert, not just form-fillers.

## Database schema

Create these tables exactly as specified (Postgres/Supabase), with Row Level Security
enabled on all of them:

```sql
create table accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  meta_ad_account_id text,
  meta_dataset_id text,
  meta_access_token_encrypted text,
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
  event_id uuid not null default gen_random_uuid(),
  phone_hash text,
  email_hash text,
  fbc text,
  fbp text,
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
```

## Edge Functions (write these exactly, they call Meta's real APIs)

**`meta-oauth-callback`** — completes the "Connect Meta" OAuth flow:
- Reads `?code=` and `?state=` (state = the account's `id`) from the callback URL
- Exchanges `code` for a short-lived token via `https://graph.facebook.com/v21.0/oauth/access_token`
  using `META_APP_ID` / `META_APP_SECRET` env vars (set as Supabase secrets) + `META_OAUTH_REDIRECT_URI`
- Exchanges that for a long-lived token (`grant_type=fb_exchange_token`)
- Updates the `accounts` row: sets `meta_access_token_encrypted` (store as-is for now — TODO
  encrypt with pgcrypto before production), `meta_token_expires_at`, `status = 'active'`
- Redirects to `/dashboard/select-ad-account?account={state}` on success, or
  `/dashboard?meta_connect=error` on failure

**`status-webhook`** — generic inbound webhook for Zapier/any external CRM:
- `POST`, auth via `Authorization: Bearer <account.webhook_api_key>` header (never a URL param)
- Body: `{ lead_reference: string, status: string }` where `status` is one of: contacted,
  qualified, not_qualified, booked, no_show, purchased
- Looks up the account by `webhook_api_key`, must be `status = 'active'`
- Matches `lead_reference` against `leads.meta_leadgen_id`, `phone_hash`, or `email_hash`
  (in that order) scoped to that account
- Inserts a `status_events` row with `source = 'webhook'`, returns 202 with the event id
- Does NOT call Meta directly — that's the dispatcher's job (keeps this endpoint fast)

**`capi-dispatcher`** — scheduled function (run every 1-2 minutes via Supabase Cron):
- Finds `status_events` rows with no matching `capi_delivery_logs` row yet (undelivered)
- Maps status → Meta event name: contacted→Lead_Contacted, qualified→Lead_Qualified,
  not_qualified→Lead_Disqualified, booked→Schedule, no_show→Lead_NoShow, purchased→Purchase
- For each, POSTs to `https://graph.facebook.com/v21.0/{account.meta_dataset_id}/events`
  with the account's access token, sending `event_name`, `event_time`, `event_id` (the
  lead's shared `event_id`, for Meta-side dedup against any client-side pixel event),
  `action_source: "system_generated"`, and `user_data` containing `ph` (phone_hash), `em`
  (email_hash), `fbc`, `fbp`, `client_ip_address`, `client_user_agent`, `lead_id`
  (meta_leadgen_id) — omit any that are null
- Logs the response into `capi_delivery_logs`

**`meta-leadgen-webhook`** — receives real-time lead notifications from Meta:
- Handles Meta's webhook verification handshake (`GET` with `hub.challenge`)
- `POST`: for each lead in the payload, calls the Graph API to fetch full lead field data
  using the account's access token, extracts phone/email and SHA-256 hashes them
  (lowercase + trim first, per Meta's hashing requirement), captures `ad_id`, `campaign_id`,
  `form_id`, and inserts a row into `leads`
- Also needs to capture `fbc`/`fbp`/IP/user-agent when available — note in code that these
  typically come from a companion pixel event on the same page as the Instant Form, not from
  the leadgen payload itself; leave as null if unavailable

## Frontend

- **Sign up / log in** (Supabase Auth, email + password)
- **Dashboard** — empty state prompting "Connect Meta" if no account connected yet
- **"Connect Meta" button** — redirects to Meta's OAuth dialog:
  `https://www.facebook.com/v21.0/dialog/oauth?client_id={META_APP_ID}&redirect_uri={META_OAUTH_REDIRECT_URI}&state={account_id}&scope=ads_management,leads_retrieval`
- **Select ad account page** (`/dashboard/select-ad-account`) — after OAuth, call
  `GET /me/adaccounts` and `GET /{ad_account_id}/dataset` (or list pixels) using the stored
  token, let the user pick which ad account + dataset this connection uses, save to the
  `accounts` row
- **Integration page** — shows the account's `webhook_api_key` and the exact webhook URL +
  a copy-paste JSON example for Zapier ("Webhooks by Zapier" → POST → this URL → this body
  shape), plus a "Send test event" button that fires a dummy status event through the same
  path so the user can confirm it reaches Meta
- **Manual status dashboard** — table of leads with a status dropdown per row (writes
  directly to `status_events` with `source = 'manual'`) for users with no CRM at all
- **Delivery log view** — shows recent `capi_delivery_logs` entries with success/fail status,
  so users can see events actually reaching Meta

## Secrets to configure (Supabase → Edge Functions → Secrets)

`META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` (use
`http://localhost:3000/auth/meta/callback` for now, update once deployed)

Keep the UI clean and minimal — Tailwind + shadcn/ui, matching a typical modern SaaS
dashboard. No need for elaborate design polish yet, this is the functional MVP.
