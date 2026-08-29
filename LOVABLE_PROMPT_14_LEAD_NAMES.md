# PROMPT 14 — Lead names on the Leads screen (GET /{leadgen_id} enrichment)

Paste everything below the line into Lovable.

---

Today the Leads screen shows a row per lead with a numeric `leadgen_id` and nothing a
human recognises. Meta's leadgen webhook only ever delivers identifiers. One Graph call
per lead — `GET /{leadgen_id}` — returns the person's name AND the ad hierarchy the
webhook leaves out. Build that enrichment step.

## *** DO NOT CREATE MIGRATIONS — THESE COLUMNS ALREADY EXIST ***

Claude added them via `0004_lead_enrichment.sql`, already applied to the live database.
Read and write them. Do not "fix" them, do not recreate them, do not generate SQL for them.

```
public.leads   -- NEW COLUMNS ONLY, table already existed
  full_name           text          -- the visible win
  ad_name             text
  adset_id            text
  adset_name          text
  campaign_name       text
  enrichment_status   text not null default 'not_attempted'
                      check in ('not_attempted','enriched','failed','unavailable')
  enrichment_error    text          -- Meta's message, verbatim
  enriched_at         timestamptz
  enrichment_attempts integer not null default 0
```

Existing columns you will also write: `ad_id`, `campaign_id`, `form_id`, `phone_hash`,
`email_hash`. All already there.

Current live state, so you know what you are testing against:

| meta_leadgen_id | is_test | enrichment_status |
|---|---|---|
| `1862460961805586` | false | `not_attempted`  <- the ONLY enrichable lead |
| `adspro_test_lead` x2 | true | `unavailable` (not a real Meta id, already marked) |

## *** CRITICAL — SHIP IT BEHIND A FLAG, DEFAULT OFF ***

AdsPro's Meta App Review submission is live right now and its Data Handling answer says,
in writing: *"It does not store lead names, email addresses or phone numbers."* A reviewer
may open the production site during the review window. Production behaviour must keep
matching that sentence until Meta's verdict email arrives.

So: build all of it, gate all of it.

- New env var **`LEAD_ENRICHMENT_ENABLED`**, read server-side, treated as `false` unless
  it is exactly the string `"true"`.
- When **false**: no Graph call is ever made, no `full_name` is ever written, the Name
  column is not rendered, and the backfill button is not shown. Everything else behaves
  exactly as it does today.
- When **true**: the whole feature is live.
- The flag must be read at request time, not baked in at build time — flipping it must
  not need a redeploy.

Do not invent a UI toggle for this. It is an env var on purpose.

## TASK 1 — One shared enrichment function (server-side only)

`enrichLead(leadId)` — used by both Task 2 and Task 3. Never called from the browser.

1. Load the lead and its parent account. Skip immediately (no Graph call) if:
   `LEAD_ENRICHMENT_ENABLED` is not `"true"`, or `enrichment_status` is `'enriched'` or
   `'unavailable'`, or `meta_leadgen_id` does not match `/^[0-9]+$/`, or
   `enrichment_attempts >= 3`.
2. Decrypt the account's Meta token with the existing helper —
   `decrypt_token(p_encrypted text, p_key text)`, TWO args, the same call the
   `/api/public/pages/*` routes already make. Do not write a second decryption path.
3. Increment `enrichment_attempts` BEFORE the call, not after. A crash mid-call must not
   leave a lead retrying forever.
4. Call Graph, same version the rest of the codebase uses (`v21.0`, do not introduce a second):

```
GET https://graph.facebook.com/v21.0/{meta_leadgen_id}
    ?fields=id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform,field_data
    &access_token={decrypted user token}
```

   If Meta rejects the field list with an unknown-field error (code 100), retry ONCE with
   the minimal set `field_data,created_time,ad_id,form_id` and report that it happened.

5. On success, write:
   - `full_name` — from `field_data`. Meta's field names vary by form. Resolve in this
     order: a field named `full_name`; else `first_name` + `" "` + `last_name`; else the
     first field whose name contains `name`. Trim. If none, leave NULL — that is not a
     failure.
   - `ad_id`, `ad_name`, `adset_id`, `adset_name`, `campaign_id`, `campaign_name`, `form_id`
     — **only overwrite a column that is currently NULL.** Never null out a value that is
     already there.
   - `phone_hash` / `email_hash` — SHA-256 hex of the normalised value, per Meta's rules:
     email lowercased and trimmed; phone reduced to digits only, country code kept, `+`
     and leading zeros stripped. Lowercase hex output.
   - `enrichment_status='enriched'`, `enriched_at=now()`, `enrichment_error=null`.
6. On failure: `enrichment_status='failed'` and Meta's response body stored **verbatim**
   in `enrichment_error`. Never swallow it, never replace it with "Something went wrong".
   Silent failure is the single most expensive bug pattern this project has had.
7. Special-case the scope error — code 200, or a message naming `leads_retrieval`. Return
   a machine-readable `{"error":"scope_missing"}` so the UI can say "Reconnect Meta"
   instead of showing a raw OAuth dump.

### PII rules — these are not negotiable

- **Never store the raw phone number or email address anywhere.** Hash in memory, discard
  the raw value in the same request.
- **Never write the enriched `field_data` into `raw_field_data`.** That column holds the
  webhook envelope only. Dumping the Graph response there would silently persist exactly
  the plain-text PII we just promised Meta we do not keep.
- Never log a raw name, email or phone. Log the `leadgen_id` and the status.

## TASK 2 — Enrich on arrival, without ever delaying the webhook

In `POST /api/public/webhooks/meta-leadgen`, after the lead row is inserted, call
`enrichLead`.

- The 200 response to Meta must NOT wait on the Graph call, and an enrichment failure must
  NEVER turn a delivery into a non-200. Meta retries on failure and eventually disables
  the subscription — that risk is worse than a missing name.
- Insert first, respond 200, enrich after (background task / `waitUntil`-style). If the
  runtime genuinely cannot defer work past the response, then wrap the call so that every
  possible throw is caught and the 200 is returned regardless. State which of the two you did.
- A re-delivered duplicate lead must not trigger a second Graph call.

## TASK 3 — Backfill route for leads that arrived before this shipped

`POST /api/public/leads/enrich-missing` — cookie-session authed, same auth pattern as
`/api/public/pages/refresh`. Resolve the account server-side from the session; never accept
an account id from the client.

- Select this account's leads where `enrichment_status in ('not_attempted','failed')` and
  `enrichment_attempts < 3`, oldest first, **max 25 per call**.
- Process sequentially with a ~200ms gap. Not in parallel.
- **Stop the whole batch immediately** on Meta rate-limit error codes `4`, `17` or `80004`
  and return `{"error":"rate_limited", "processed": n}`. The ad account is on Limited
  access with roughly a 60-calls-per-hour ceiling — burning it would also block the
  Marketing API Access Tier round-two work. This cap is deliberate.
- Return `{ processed, enriched, failed, rate_limited }`.

UI: on the Leads page, a **"Fetch missing names"** button, shown only when the flag is on
and at least one lead is `not_attempted` or `failed`. Spinner while running, then a plain
summary — "12 leads updated, 2 failed". If the route returns `scope_missing`, replace the
button with **"Reconnect Meta"** and the line: "Your Meta connection was made before lead
names were supported. Reconnect once to enable them."

## TASK 4 — Leads screen

Columns today: Created / Leadgen ID / Campaign / Ad / Current status / Set status.

- Add **Name** as the second column, right after Created. Value: `full_name`.
- **Campaign** shows `campaign_name`, falling back to `campaign_id`, then "—".
- **Ad** shows `ad_name`, falling back to `ad_id`, then "—".
- Leadgen ID stays — it is what a CRM must send as `lead_reference` — but demote it:
  smaller, muted, after Ad.
- Per-row enrichment state, quiet but never invisible:
  - `enriched`, no name found in the form → "—", no error styling. A form with no name
    field is normal.
  - `failed` → small amber dot next to the row with the verbatim `enrichment_error` on
    hover/tap. Not a red wall, but not hidden either.
  - `unavailable` → nothing. These are manual test rows.
- Sorting and the existing empty states must keep working.
- With the flag off, the Name column is absent entirely and the screen looks exactly as
  it does today.

## TASK 5 — Let CAPI use the hashes (small, do not over-build)

The dispatcher currently sends `user_data.lead_id`. Keep that as the primary key — for
lead ads it is the strongest match signal. Additionally, when `phone_hash` / `email_hash`
are non-null, include them as `user_data.ph` / `user_data.em`. They are already SHA-256
hex, so pass them through unchanged — do not re-hash.

Do not change retry logic, backoff, the cron, or `run_capi_dispatcher()`. Claude owns those.

## Explicitly OUT of scope

- No new migrations. Task 1's columns exist.
- No Insights / campaign-metrics sync. That is the next piece of work and it is Claude's.
- No agency / multi-account UI.
- No billing.
- Do not touch the retention purge. Names are deleted with the row at 90 days already.

## Definition of done — answer each one, separately

1. With `LEAD_ENRICHMENT_ENABLED` unset, the Leads screen is byte-for-byte today's screen
   and no Graph call is made. Say how you verified the "no Graph call" half.
2. With it `"true"`, lead `1862460961805586` enriches: paste the exact Graph URL used
   (token redacted) and the resulting `full_name`, `campaign_name`, `ad_name`.
3. State plainly whether the stored token actually carried `leads_retrieval`, or whether
   the `scope_missing` path fired and a reconnect was needed.
4. Confirm `raw_field_data` still contains ONLY the webhook envelope for that lead — no
   name, no email, no phone anywhere in it.
5. Confirm no raw phone or email string exists in any column, and that `phone_hash` /
   `email_hash` are 64-character lowercase hex.
6. Confirm a webhook delivery still returns 200 within its normal time when the Graph call
   fails. Say how you forced the failure.
7. Confirm the backfill stops and reports `rate_limited` on error code 80004 rather than
   hammering through the batch.
8. State whether this is deployed to PRODUCTION (adsproindia.com) or only to preview.
   Several earlier prompts were reported "working" against preview only.
