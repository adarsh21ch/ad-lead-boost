# PROMPT 15 — Token health alerts (detect code 190, say it loudly)

Paste everything below the line into Lovable.

---

On 2026-08-28 the Meta token was invalidated and **nothing in AdsPro knew for over a day**.
`meta_token_expires_at` said 2026-10-25 — a healthy future date the whole time.
`accounts.status` said `active`. The dashboard was all green. It only surfaced because a
human ran a Graph call by hand.

If that happens to a paying customer, their leads stop syncing and the app tells them
everything is fine. Fix that.

**The expiry date is NOT the detector.** It would not have caught this. The detector is
what Meta actually says when we call it.

## *** DO NOT CREATE MIGRATIONS — ALL OF THIS ALREADY EXISTS ***

Claude applied `0005_token_health.sql` to the live database. Read and use it.

```
public.accounts   -- NEW COLUMNS
  token_status         text not null default 'unknown'
                       check in ('unknown','healthy','invalid','expiring_soon')
  token_last_ok_at     timestamptz
  token_last_error     text
  token_last_error_at  timestamptz
  token_invalid_since  timestamptz   -- FIRST failure, preserved across repeats

public.token_health_events            -- append-only evidence trail, service-role writes
  account_id, event ('ok'|'invalid'|'reconnected'|'expiring_soon'),
  source, meta_code, meta_subcode, meta_message, created_at

public.record_token_health(p_account_id uuid, p_event text, p_source text,
                           p_code int, p_subcode int, p_message text) -> void
```

`record_token_health` does ALL the state logic — inserting the event, flipping
`token_status`, preserving `token_invalid_since`, clearing errors on recovery. Your side is
one call per Meta response. Do not reimplement any of it in TypeScript.

A daily cron (`adspro-token-expiry-check`, 03:00 UTC) already sets `expiring_soon` seven
days out. That is Claude's, leave it alone.

`accounts.status` is deliberately NOT reused — it describes the account lifecycle, not the
token. Do not write token state into it.

## TASK 1 — One helper, called at EVERY Meta call site

`reportTokenHealth(accountId, 'ok' | 'invalid', source, metaError?)` — a thin wrapper that
calls the `record_token_health` RPC with service-role. Nothing more.

Call it at every place the app talks to Meta. Miss one and the blind spot comes back:

| Call site | `source` |
|---|---|
| CAPI dispatcher (`/api/public/cron/capi-dispatcher`) | `dispatcher` |
| `/api/public/pages/refresh` and `/pages/connect` | `pages` |
| lead enrichment (`enrichLead`) | `enrichment` |
| ad account / dataset listing | `adaccounts` |
| OAuth callback | `oauth` |

- Meta responded normally -> `'ok'`
- Meta returned a token error -> `'invalid'`, passing `code`, `subcode` and the **verbatim**
  message

Never let a health report throw into the caller's path. Wrap it; a failed report must not
break a dispatch or a webhook.

## TASK 2 — Classify correctly. This is the part that must not be sloppy.

**Token invalid** — report `'invalid'`:
- `code 190` (any subcode — 458, 459, 460, 463, 464, 467 all mean reconnect)
- `code 102`

**NOT token invalid** — report nothing, leave `token_status` untouched:
- `code 200` and `code 10` — permission/scope problems. A missing scope is not a dead token.
- `code 4`, `17`, `80004` — rate limits. **Marking the token dead on a rate limit would be
  a false alarm that tells the customer to reconnect a perfectly good connection.**
- HTTP 500/503 or a network timeout — Meta being flaky, not our token.

When in doubt, do NOT mark invalid. A false green is bad; a false red that makes a customer
reconnect for no reason is also bad, and it trains them to ignore the warning.

## TASK 3 — Say it loudly on the Dashboard

`token_status = 'invalid'`: a **red, non-dismissible** banner at the top of the Dashboard,
above the connection card:

> **Lead syncing has stopped.** Your Meta connection is no longer valid, so lead outcomes
> are not reaching Meta. Reconnect to resume.
> Broken since {token_invalid_since, as a human phrase — "2 days ago"}.
> [ Reconnect Meta ]

Show `token_last_error` verbatim underneath, in small text. Do not hide it behind a tooltip.

`token_status = 'expiring_soon'`: amber, dismissible, "Your Meta connection expires on
{date}. Reconnect to avoid interruption." with the same button.

`token_status = 'healthy'`: nothing. No badge, no clutter.

Also replace the current dashboard line "Token expiry unknown — reconnect Meta if lead-sync
stops." When `token_last_ok_at` is set, say "Connection verified {relative time}" instead.
That line is the honest one: it reports what we actually know, not a date we are guessing at.

## TASK 4 — Fix the missing-expiry bug in the OAuth callback

The 2026-08-28 reconnect stored **no expiry at all** — `meta_token_expires_at` is NULL.

- Parse `expires_in` from the token exchange response and store the resulting timestamp.
- If Meta genuinely returns no `expires_in` (it does for some long-lived tokens), leave it
  NULL — do not invent a date. NULL means "unknown", and the UI already handles that.
- On a successful callback, call `reportTokenHealth(accountId, 'ok', 'oauth')` so a
  reconnect immediately clears a red banner. (Pass `'reconnected'` through if you prefer —
  the function treats both as recovery.)
- Report what Meta actually returned for `expires_in` on this account.

## Explicitly OUT of scope

- **Email/WhatsApp alerting.** There is no transactional email provider wired up. In-app
  only for now. Do not add a vendor.
- Do not touch `record_token_health`, `check_token_expiry`, the cron jobs, or the retention
  purge. Claude owns those.
- Do not change dispatcher retry/backoff logic. Only ADD the health report to it.
- Do not touch `LEAD_ENRICHMENT_ENABLED` or anything in prompt 14. It stays `"false"`.

## Definition of done — answer each separately

1. List every Meta call site you added `reportTokenHealth` to, with its `source` value.
   State explicitly whether any Meta call in the codebase does NOT report.
2. Force a token error and show `accounts.token_status` flipping to `invalid` with
   `token_invalid_since` set and Meta's verbatim message in `token_last_error`.
   (Easiest: temporarily corrupt the token in a local copy, or mock a 190 response.)
3. Prove a **rate-limit** error (code 4 / 17 / 80004) does NOT mark the token invalid.
   This is the false-alarm case and it matters more than the happy path.
4. Show the red banner rendering, including the "broken since" phrase and the verbatim error.
5. Show a successful Meta call flipping `token_status` back to `healthy` and clearing
   `token_invalid_since`.
6. State what `expires_in` Meta returned on the current connection and what you stored.
7. State whether this is deployed to PRODUCTION or preview. **Do not publish without being
   asked** — a previous prompt published unrequested. Report and wait.
