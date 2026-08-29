# Lovable Prompt 10 — Real leads flowing IN from Meta Lead Ads

Paste everything below the line into Lovable.

---

The outbound half of AdsPro (status → Meta via CAPI) is proven working end to end,
unattended, on schedule. The INBOUND half has never run: no real lead has ever entered
the system. Every lead in the DB is one manual test lead with no campaign or ad attached.
Fix that.

## Critical constraint — read before designing

The app's current Meta scope is `ads_management,business_management`.
**`leads_retrieval` was deliberately removed and is NOT granted.**

That matters because Meta's leadgen webhook does NOT deliver the lead's field data. It
delivers only identifiers — `leadgen_id`, `page_id`, `form_id`, `ad_id`, `adgroup_id`,
`created_time`. Fetching the actual name/email/phone requires `GET /{leadgen_id}` with
`leads_retrieval`, which we do not have and which needs its own lead-ads use case plus
App Review.

**Do not block on that.** Build the degraded-but-correct path now:

- Meta's Conversions API for lead ads accepts `user_data.lead_id` (the numeric
  `leadgen_id`) as a first-class match key — for lead-ads conversions it is the
  PREFERRED identifier, better than hashed PII. So CAPI delivery works fully without
  `leads_retrieval`.
- Store `leadgen_id`, `ad_id`, `campaign_id`, `form_id` on the lead. Leave `phone_hash`
  / `email_hash` null for now.
- Design the ingestion so that when `leads_retrieval` is later approved, enriching the
  row with hashed PII is an additive step, not a rewrite.

## 1. Webhook ingestion

`GET/POST /api/public/webhooks/meta-leadgen` already exists and is verified live
(correct `META_VERIFY_TOKEN` → 200 + echoes `hub.challenge`; wrong token → 403).
Now implement the POST side properly:

- Verify the `X-Hub-Signature-256` header against `META_APP_SECRET` (HMAC SHA-256 of the
  raw body). Reject mismatches with 401. Do NOT skip this — the endpoint is public and
  anyone can POST to it.
- Parse the leadgen payload. Meta can batch multiple entries/changes per request —
  handle arrays, not just a single lead.
- Resolve which `accounts` row this belongs to. The webhook is app-level, not
  account-level, so you must map `page_id` (or `ad_id` → ad account) to an account.
  Add `meta_page_id` to `accounts` and record it. If no account matches, log loudly and
  return 200 (never 500 — Meta retries and will eventually disable the subscription).
- Insert the lead: `meta_leadgen_id`, `ad_id`, `campaign_id`, `form_id`, fresh
  `event_id`, `is_test = false`. Deduplicate on `meta_leadgen_id` — Meta re-delivers.
- Always return 200 quickly. Do the work idempotently; a retried delivery must not create
  a duplicate lead.

## 2. CAPI must use lead_id

Confirm the dispatcher sends `user_data.lead_id = <meta_leadgen_id>` for leads that have
one. This is what makes Conversion Leads optimization work for lead ads and it is
required for the whole product to function without `leads_retrieval`. Report whether
this was already correct or you had to change it.

## 3. Status matching without PII

`POST /api/public/webhooks/status` currently matches `lead_reference` against
`meta_leadgen_id`, `phone_hash`, or `email_hash`. With no PII stored, only `leadgen_id`
will match. Update the Integration page docs to say so plainly: until PII enrichment is
available, CRMs must send the Meta `leadgen_id` as `lead_reference`. Do not leave users
guessing why phone-number matching returns 404.

## 4. Make inbound leads visible

The Leads page must show real leads with their `campaign_id` / `ad_id` (the Campaign
column already exists and currently renders "—"). Add an empty state that distinguishes
"no leads yet — connect your Page" from "no leads matched".

## 5. Report back

- Confirm signature verification is implemented and tested with a bad signature.
- State what you added to map `page_id` → account.
- Confirm dedupe on `meta_leadgen_id` works on repeated delivery.

## Acceptance

- A real Lead Ads test submission creates exactly one lead row with campaign/ad IDs.
- Re-delivery of the same lead creates no duplicate.
- A forged POST with a bad signature is rejected 401.
