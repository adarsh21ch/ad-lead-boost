# Lovable Prompt 5 — Integration page + Send test event

Paste everything below the line into Lovable.

---

Build an **Integration page** at `/dashboard/integration`, linked from the dashboard nav
as "Integration". It is the page a user opens after connecting Meta, to wire their CRM
into AdsPro and prove the pipe works. Do not change the OAuth flow, the auth/session
code, or the legal pages.

## 0. Prerequisite migration

Add to `leads`:

```sql
alter table leads add column if not exists is_test boolean not null default false;
```

Add to `capi_delivery_logs`:

```sql
alter table capi_delivery_logs add column if not exists is_test boolean not null default false;
```

Test events must never be counted in any future funnel/analytics view — always filter
`is_test = false` in reporting queries.

## 1. Page data

Server-side load the current user's account row (RLS-scoped by `owner_user_id`):
`id, status, meta_ad_account_id, meta_dataset_id, meta_token_expires_at, webhook_api_key`.

If `status !== 'active'` or `meta_dataset_id` is null, render the page in a disabled state
with a clear callout: "Connect your Meta ad account and choose a dataset first" plus a
button to `/dashboard/select-ad-account`. Do not show the API key in that state.

## 2. Section — "Your webhook endpoint"

- Read-only field, copy button: `https://adsproindia.com/api/public/webhooks/status`
- Read-only field, copy button, **masked by default** with a "Reveal" toggle:
  the account's `webhook_api_key`.
- Warning line under the key: "Treat this like a password. Anyone with it can write lead
  statuses to your account."
- A **"Regenerate key"** button behind a confirm dialog. It calls a server function that
  updates `accounts.webhook_api_key = encode(gen_random_bytes(24),'hex')` for the
  owner's account only (verify `owner_user_id = auth.uid()` server-side, then write with
  service role). Confirm dialog must say: "Your existing Zapier/CRM integrations will
  stop working until you paste the new key."

## 3. Section — "Send status updates"

Show the exact contract, as a copyable code block:

```
POST https://adsproindia.com/api/public/webhooks/status
Authorization: Bearer <webhook_api_key>
Content-Type: application/json

{
  "lead_reference": "<meta_leadgen_id, or the lead's phone, or email>",
  "status": "qualified"
}
```

Below it, a table of the six allowed statuses and the Meta event each becomes:

| status | Meta event |
|---|---|
| `contacted` | `Lead_Contacted` |
| `qualified` | `Lead_Qualified` |
| `not_qualified` | `Lead_Disqualified` |
| `booked` | `Schedule` |
| `no_show` | `Lead_NoShow` |
| `purchased` | `Purchase` |

And a short response-code list: `202` accepted, `401` bad/missing key, `404` no matching
lead, `409` account not active, `400` bad status value.

## 4. Section — "Set up with Zapier" (numbered, copy-paste literal)

1. In Zapier, create a Zap. Trigger = your CRM (e.g. "Deal stage changed" in HubSpot /
   Pipedrive / Google Sheets row updated).
2. Action = **Webhooks by Zapier → POST**.
3. **URL**: `https://adsproindia.com/api/public/webhooks/status`
4. **Payload Type**: `json`
5. **Data**: `lead_reference` = the lead's phone or email field from your CRM;
   `status` = one of the six values above.
6. **Headers**: `Authorization` = `Bearer YOUR_KEY_HERE` (render the user's real key
   inline here when revealed, so it is one copy), and `Content-Type` = `application/json`.
7. Test the step. A `202` means AdsPro accepted it.

Add a collapsed "Using a different tool?" block with a ready-to-run `curl` example using
the same values.

## 5. Section — "Send test event" (the important one)

A button: **Send test event**. Optional input above it labelled
"Meta test event code (optional)" with helper text: "Find this in Events Manager → your
dataset → Test Events. With a code set, the event shows up there instead of affecting
optimization."

Clicking it calls a new server route `POST /api/public/test-event` (session-authenticated,
NOT api-key authenticated) which does the **real** path, synchronously, and returns every
step so the UI can show it:

1. Verify the caller owns an `active` account with a `meta_dataset_id`.
2. Upsert a single reusable test lead for that account: `is_test = true`,
   `meta_leadgen_id = 'adspro_test_lead'`, `email_hash` = SHA-256 of
   `test@adsproindia.com` (lowercased, trimmed — Meta's normalization rules), stable
   `event_id`.
3. Insert a `status_events` row: `status = 'qualified'`, `source = 'manual'`.
4. Decrypt the Meta token via the existing `decrypt_token` path and POST to
   `https://graph.facebook.com/v21.0/{meta_dataset_id}/events` with the same payload
   shape the dispatcher uses (`event_name: 'Lead_Qualified'`,
   `action_source: 'system_generated'`, `event_id`, hashed `user_data`), adding
   `test_event_code` to the body when the user supplied one.
5. Insert the `capi_delivery_logs` row with `is_test = true`, the real `http_status` and
   the full `meta_response`.
6. Return `{ ok, http_status, meta_response, status_event_id }`.

The UI must render **Meta's actual response**, not a generic toast — show
`events_received`, `fbtrace_id`, and any `messages`/`error` verbatim in a mono block.
On failure, show the error body as-is; that is the whole point of the button.

Never send the access token to the browser. Never log the decrypted token.

## 6. Section — "Recent deliveries"

A table of the 20 most recent `capi_delivery_logs` for this account (join through
`status_events`), newest first: time, event name, HTTP status, a green/red badge, a
"test" chip when `is_test`, and an expandable row showing `meta_response`. Empty state:
"No events delivered yet — send a test event above."

## 7. Bug to check while you are in here

`capi-dispatcher` is documented as picking up *undelivered* status events, but the query
selects from `status_events` with only `.limit(50)` and no filter excluding events that
already have a `capi_delivery_logs` row. If the deployed route has that shape, it will
re-send the same events on every run and duplicate-spam Meta. Fix it to select only
status events with no matching delivery log, oldest first. Report what you found.

## Acceptance

- `/dashboard/integration` loads for an active account and shows a masked API key.
- "Send test event" returns Meta's real JSON response in the UI.
- The test event appears in "Recent deliveries" with a `test` chip.
- Regenerating the key changes it and old key returns 401 on the status webhook.
