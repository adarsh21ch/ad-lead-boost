# Paste this to start the next AdsPro session

---

Continue building AdsPro. Read these three files first, in order:
- `/Users/apple/adspro/STATUS.md` — full build state, what's done, what's pending
- `/Users/apple/adspro/BUILD_DIVISION.md` — who builds what (you vs Lovable)
- `/Users/apple/adspro/ANALYTICS_ROADMAP.md` — the planned analytics/AI advisor layer

Context: multi-tenant SaaS that syncs Meta lead-status outcomes back to Meta via
Conversions API, so Meta optimizes for leads that actually convert, not just form-fills.
Live at adsproindia.com. Frontend built in Lovable, Supabase project wxgfaaaboftzsazknbvl.

## Where things stand

**OUTBOUND half: fully proven, end to end, unattended.** Meta OAuth, ad account + dataset
picker, encrypted token storage (pgp_sym_encrypt, base64 — check for prefix `ww0E`, NOT
hex `\xc30d`), manual test-event button showing Meta's verbatim response, retry/backoff
with an `abandoned` terminal state, and a pg_cron dispatcher delivering on schedule.
Verified: an unattended cron tick delivered a status event, HTTP 200 from Meta.

**INBOUND half: code complete, never exercised.** Lovable built the leadgen webhook —
HMAC-SHA256 signature verification (timing-safe, hard 401 if the secret is missing),
`page_id`->account mapping via new `accounts.meta_page_id`, race-safe dedupe, batched
payload handling, and Integration/Leads UI updates. All tested by Lovable in isolation.

**But no real lead has ever entered the system.** Every lead in the DB is still one manual
test lead. Finishing this is the last piece of the core product.

Key architectural finding worth keeping: inbound does NOT need the `leads_retrieval`
scope. Meta's leadgen webhook only ever delivers identifiers, and Meta's CAPI accepts
`user_data.lead_id` (the leadgen_id) as the preferred match key for lead-ads conversions.
So leads are stored with IDs and NULL PII, and `leads_retrieval` approval later becomes
pure enrichment on the same row. Consequence: CRMs must send the `leadgen_id` as
`lead_reference` — phone/email matching returns 404 until enrichment lands.

## Immediate next steps

1. **Walk me through the manual Meta setup** (this is all in Meta's UI, not buildable):
   - Save my Facebook Page ID in the new Integration page card
   - Subscribe that Page to the `leadgen` field in Meta App Dashboard -> Webhooks
     (callback `https://adsproindia.com/api/public/webhooks/meta-leadgen`,
     verify token `b862a6dc60f1bf56f76e04cd193e3ae2`)
   - Submit a real lead through Meta's Lead Ads Testing Tool
   - Confirm it lands in the Leads tab WITH ad/campaign IDs populated
2. Once that works, the core product is DONE. Then start Phase A of
   ANALYTICS_ROADMAP.md — the metrics warehouse + Meta Insights sync.

## Working style — important, this saves real money

- I paste Lovable prompts for anything in the React app; I do not edit app files directly.
- BUT the Supabase CLI (v2.101.0) is installed and linked to this project. USE IT. Build
  all schema, SQL views, Postgres functions, pg_cron jobs and Edge Functions YOURSELF via
  migrations. Do not send those to Lovable. **Lovable prompts should be UI-only** — every
  one you send costs me credits. The CAPI dispatcher already proves backend work can live
  entirely in Postgres functions + pg_net + pg_cron with zero Lovable involvement.
- Roughly 60-70% of the remaining roadmap can avoid Lovable entirely. Keep it that way.
- **Batch DB verification into ONE query.** The Supabase SQL editor only displays the LAST
  statement's result, so union everything into a single result set. Query-by-query
  round-tripping burned a lot of money in a previous session.
- Prefer text over screenshots. I am cost-conscious.

## First thing to ask me for

The empty Supabase keys in `/Users/apple/adspro/.env` — `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. With those you can query and verify
the DB directly instead of me pasting results back and forth. Also verify the CLI still
has auth (`supabase projects list`) before relying on it.

## Gotchas already paid for — do not rediscover these

- Meta's App Dashboard **Basic Settings page renders stale values**. Verify app config via
  Graph API instead; the command is in STATUS.md.
- Cloudflare 403s automated fetches of `/assets/*.js`, so deployed frontend changes cannot
  be verified by curl — check in a browser.
- Lovable's **preview build and the published production build differ**. A "it works"
  report from Lovable may be against preview. Confirm what is actually published.
- `decrypt_token` takes TWO args: `decrypt_token(p_encrypted text, p_key text)`.
- pg_net's functions live in schema `net` (`net.http_post`, `net._http_response`) even
  though the extension registers under `extensions`. Calling `extensions.http_post` throws
  42883 — this silently broke the cron for an hour.
- **Meta only sends `campaign_id` on SOME leadgen payloads.** `ad_id` is the reliable one.
  Phase B must derive campaign from `ad_id` via the synced `ad_entities` hierarchy, not
  from `leads.campaign_id`. This makes the Phase A hierarchy table load-bearing.

## Known open items

Supabase leaked-password protection still disabled (dashboard toggle, Auth settings).
`leads_retrieval` needs its own lead-ads use case before App Review. Tech Provider status
not started. Agency/multi-account UI deliberately deferred until core is done — do not
start it unprompted.

## Strategic context

Metrol Media (my employer) is a real requester — their marketer asked me to build this,
and they run Meta ads both for themselves and for their clients. That is the anchor
customer. Don't re-litigate whether the product is worth building; help me finish it.
