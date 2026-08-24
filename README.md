# Lead Quality Sync

Multi-tenant tool that pushes lead-status outcomes (Qualified / Booked / Purchased / etc.)
back to Meta via the Conversions API (Conversion Leads), so ad delivery optimizes toward
leads that actually convert — not just form-fillers.

Full spec: see the shared spec doc (architecture, audit, build plan).

## What's built so far (scaffold)

- `supabase/migrations/0001_init.sql` — schema: `accounts`, `leads`, `status_events`,
  `capi_delivery_logs`, with RLS so each tenant only sees their own data
- `supabase/functions/status-webhook/` — generic inbound webhook (Zapier/any CRM POSTs
  lead status here, authenticated by per-account API key)
- `supabase/functions/capi-dispatcher/` — cron job that sends pending status events to
  Meta's Conversion Leads endpoint and logs delivery
- `package.json` — TanStack Start + Supabase stack, matching the rest of the Nevorai family

## What's NOT built yet

- The frontend (sign up, Meta OAuth connect UI, dashboard, funnel view)
- Meta OAuth flow itself (`/auth/meta/callback` route)
- Lead intake webhook (Meta Lead Ads → capture lead + fbc/fbp/IP/UA)
- Token encryption/decryption (currently a TODO stub in capi-dispatcher)
- Manual status dashboard UI

## Setup steps — things only you can do (need your own logins)

1. **Create a Meta App**
   - Go to developers.facebook.com → My Apps → Create App → type "Business"
   - Add products: **Facebook Login for Business**, **Marketing API**
   - Note the App ID + App Secret → put in `.env` as `META_APP_ID` / `META_APP_SECRET`

2. **Set up test access (works immediately, no review needed)**
   - In the app's Roles settings, add your own Meta account as a Developer/Tester
   - Use your MetaTrader/test ad account for all local testing — this works in dev mode

3. **Submit for App Review (do this in parallel, don't wait for it)**
   - Request `ads_management` + `leads_retrieval` permissions
   - This is required before any *real client's* ad account can connect — Meta's process,
     typically days to ~2 weeks. Tell me when you're at this step and I'll help you write
     the use-case justification they ask for.

4. **Create a new Supabase project** (isolated — not nFlow's)
   - supabase.com → New Project
   - Run `supabase/migrations/0001_init.sql` against it (SQL editor or CLI)
   - Copy the Project URL + anon key + service role key into `.env`

Once you have (1) and (4), send me the values (not pasted in chat if sensitive — use `.env`
directly) and I'll wire up the OAuth flow and continue building the frontend.

## Local dev (once dependencies exist)

```bash
bun install
bun run dev
```
