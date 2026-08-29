# Lovable Prompt — Fix OAuth error surfacing (re-do) + verify ad account picker

## Context
`GET /api/public/auth/meta/callback` currently redirects to
`/dashboard?meta_connect=error` for EVERY failure. I verified this in production:
calling it with no params AND calling it with `?error=access_denied&error_reason=user_denied`
both produce the identical redirect. This makes the OAuth flow impossible to debug.
A previous prompt asked for this and it did not take effect — please re-check that the
change is actually in `src/routes/api/public/auth/meta/callback.ts` and deployed.

## Task 1 — Reason codes on the OAuth callback (required)

In the Meta OAuth callback route, replace the single generic error redirect with a
distinct `reason` code per failure branch. Redirect to:

    /dashboard?meta_connect=error&reason=<CODE>

Use exactly these codes:

| Situation | reason code |
|---|---|
| Meta returned `?error=` in the query (user denied, etc.) | `meta_denied` |
| No `code` param and no `error` param present | `no_code` |
| `state` param missing | `state_missing` |
| `state` present but does not match the stored/expected value | `state_mismatch` |
| No signed-in Supabase user for this request | `not_authenticated` |
| `META_APP_ID` or `META_APP_SECRET` missing from env | `missing_app_config` |
| Token exchange call to `graph.facebook.com/v21.0/oauth/access_token` returned non-200 | `token_exchange_failed` |
| Long-lived token exchange failed | `token_extend_failed` |
| DB insert/update of the account row failed | `db_write_failed` |
| Anything else | `unknown` |

On success keep the existing behavior (`?meta_connect=success` or whatever it currently is).

Also `console.error` the full underlying detail server-side on every failure branch —
including Meta's `error.message`, `error.code`, `error.error_subcode`, and `fbtrace_id`
when a Graph call fails. Never put those details in the redirect URL, only the code.

## Task 2 — Show the reason in the dashboard (required)

On `/dashboard`, when `meta_connect=error` is present, read `reason` and show a toast /
alert with a human message instead of a generic "Connection failed":

- `meta_denied` — "You cancelled the Meta connection. Try again and press Continue."
- `no_code` / `state_missing` / `state_mismatch` — "The connection link expired or was
  tampered with. Please start Connect Meta again."
- `not_authenticated` — "Your session expired. Log in and try again."
- `missing_app_config` — "Server configuration problem — Meta app credentials missing."
- `token_exchange_failed` / `token_extend_failed` — "Meta rejected the connection. This is
  usually a Redirect URI mismatch in the Meta app settings."
- `db_write_failed` — "Connected to Meta but could not save the account. Please retry."
- anything else — "Connection failed (code: <reason>)."

Then clear the query params from the URL so a refresh doesn't re-show the toast.

## Task 3 — Confirm the post-OAuth step exists (report back, build only if missing)

After a successful connect, the user must pick (a) an ad account and (b) a
dataset/pixel to send Conversions API events to. Tell me whether
`/dashboard/select-ad-account` (or equivalent) already exists and works.

If it does NOT exist, build it:
- Server route that calls `GET /v21.0/me/adaccounts?fields=id,name,account_id,account_status`
  using the connected account's token, and
  `GET /v21.0/{ad_account_id}/adspixels?fields=id,name` for datasets.
- UI: a page listing ad accounts (radio select), then datasets for the chosen account.
- Save the chosen `ad_account_id` and `dataset_id`/`pixel_id` onto the `accounts` row.
- Handle the "no ad accounts returned" case with a clear message — with an unreviewed app
  this happens when the logged-in user is not an admin of any ad account.

## Acceptance criteria (I will re-test these with curl)
1. `GET https://adsproindia.com/api/public/auth/meta/callback` (no params)
   → 302 to `...?meta_connect=error&reason=no_code`
2. `GET .../callback?error=access_denied&error_reason=user_denied`
   → 302 to `...?meta_connect=error&reason=meta_denied`
3. Do not change the `/api/public/webhooks/meta-leadgen`, `/api/public/webhooks/status`,
   or `/api/public/cron/capi-dispatcher` routes — they are verified working.
