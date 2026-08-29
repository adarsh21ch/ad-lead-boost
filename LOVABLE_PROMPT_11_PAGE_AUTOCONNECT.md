# PROMPT 11 — Automatic Facebook Page connection (replace the manual Page ID box)

## Why this exists

Today, connecting a client's Facebook Page to the leadgen webhook requires the ADMIN to
run a Graph API Explorer command by hand:
`POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with a PAGE access token.

That is the only remaining per-client manual step and it does not scale past one customer.
AdsPro already holds the user's Meta token, so the app can do this itself. The customer
should just pick their Page from a dropdown.

## *** DO NOT RECREATE — THIS ALREADY EXISTS IN THE DATABASE ***

Claude created these directly via SQL migration `0002_page_autoconnect_and_cron_url.sql`.
READ FROM THEM. Do not generate migrations for them, do not "fix" them.

```
public.meta_pages
  id uuid pk
  account_id uuid -> accounts(id) on delete cascade
  page_id text
  page_name text
  subscribe_status text  -- 'not_attempted' | 'subscribed' | 'failed'
  subscribe_error text
  subscribed_at timestamptz
  discovered_at timestamptz
  unique (account_id, page_id)
  RLS: enabled. SELECT policy = owner of the parent account.
       NO insert/update/delete policy — writes are service-role only,
       exactly like status_events.

public.accounts  -- NEW COLUMNS ONLY, table already existed
  page_subscribe_status text  -- 'not_attempted' | 'subscribed' | 'failed'
  page_subscribe_error text
  page_subscribed_at timestamptz
```

`accounts.meta_page_id` already existed and stays the single source of truth for which
Page this account listens to. The new columns describe whether that Page's subscription
actually SUCCEEDED.

Already-connected data has been backfilled: the existing account has
`meta_page_id = 1126670470531846`, `page_subscribe_status = 'subscribed'`.

## TASK 1 — Widen the Meta OAuth scope

The authorize URL currently requests `ads_management,business_management`.

Change it to request:

```
ads_management,business_management,pages_show_list,pages_manage_metadata,leads_retrieval
```

All five are already enabled on the Meta app (status "Ready for testing"), so no App
Review is needed for the app owner's own assets.

**Migration concern — handle it, do not ignore it:** tokens stored BEFORE this change do
not carry the three new scopes. Task 4 covers the reconnect banner.

## TASK 2 — Server route: list the user's Pages

`POST /api/public/pages/refresh` (cookie-session authed, same auth pattern as the existing
`/api/public/test-event` route).

1. Resolve the caller's account via the existing owner-verified helper
   (`getOwnedAccountToken` or equivalent). Never trust an account id from the client.
2. Decrypt the Meta user token (`decrypt_token(p_encrypted text, p_key text)` — TWO args).
3. Call Graph: `GET /me/accounts?fields=id,name,access_token`
   Use the SAME Graph API version the rest of the codebase already uses. Do not introduce
   a second version.
4. Upsert each returned page into `meta_pages` (service-role) on `(account_id, page_id)`:
   set `page_name`, refresh `discovered_at`. Do NOT clobber an existing
   `subscribe_status` / `subscribed_at`.
5. **Never persist the page access_token.** Use it in-request and discard it.
6. Return the list, plus Meta's verbatim error body on failure.

If the token lacks `pages_show_list`, Meta returns an OAuthException. Detect that and
return a machine-readable `{"error":"scope_missing"}` so the UI can show the reconnect
prompt instead of an empty dropdown.

## TASK 3 — Server route: connect one Page

`POST /api/public/pages/connect` with `{ page_id }`.

1. Verify ownership server-side. Confirm `page_id` belongs to a `meta_pages` row for
   THIS account. Reject anything else.
2. Decrypt the user token, call `GET /me/accounts` again, and pull the PAGE access token
   for that page_id. (Do not accept a token from the client.)
3. Call Graph:
   `POST /{page_id}/subscribed_apps` with `subscribed_fields=leadgen` and
   `access_token={PAGE token}`
4. On `{"success": true}`:
   - `meta_pages`: `subscribe_status='subscribed'`, `subscribed_at=now()`, `subscribe_error=null`
   - `accounts`: `meta_page_id=page_id`, `page_subscribe_status='subscribed'`,
     `page_subscribed_at=now()`, `page_subscribe_error=null`
5. On failure:
   - `subscribe_status='failed'` and store Meta's message verbatim in `subscribe_error`
   - Mirror onto `accounts.page_subscribe_status/page_subscribe_error`
   - **Do NOT set `meta_page_id`** on failure. A saved page id with no working
     subscription is exactly the silent-failure trap that has cost this project the most
     time: it looks connected and delivers nothing.
6. Return Meta's verbatim response either way.

### Known Meta error worth special-casing

```
(#200) To subscribe to the leadgen field, one of these permissions is needed
```
means the token lacks `leads_retrieval`. Show: "Your Meta connection needs to be
refreshed — click Reconnect Meta", not a raw error dump.

## TASK 4 — Integration page UI

On `/dashboard/integration`, **replace** the manual "Facebook Page ID" text input. Do not
leave both. Typing a raw Page ID is the thing we are removing.

New card: **"Facebook Page"**

- Button **"Load my Pages"** → calls Task 2, shows a spinner, then a dropdown of
  `page_name (page_id)`
- Dropdown + **"Connect"** button → calls Task 3
- Below it, the live state of the selected page:
  - `subscribed` → green: "Connected — leads from this Page will arrive automatically",
    plus the connected date
  - `failed` → red, with `subscribe_error` shown in full and a **Retry** button.
    This must be loud. Never a blank box.
  - `not_attempted` / none → neutral: "Choose the Page your lead ads run from"
- If Task 2 returns `scope_missing`, hide the dropdown and show a
  **"Reconnect Meta"** button that restarts the OAuth flow, with the text:
  "Your Meta connection was made before Page support was added. Reconnect once to enable
  automatic Page connection."

## TASK 5 — Dashboard card

On the dashboard's connection card, add one line under Ad account / Dataset:

- `Page — Connected ✓` (green) when `page_subscribe_status='subscribed'`
- `Page — Not connected` (amber) with a link to Integration when null/not_attempted
- `Page — Connection failed` (red) with a link to Integration when 'failed'

A user must never be able to look at the dashboard, see everything green, and be silently
receiving no leads.

## Explicitly OUT of scope

- Do not touch the CAPI dispatcher, cron, or `run_capi_dispatcher()`. Claude owns those.
- Do not create migrations for `meta_pages` or the `accounts.page_subscribe_*` columns.
- Do not build agency / multi-account UI. Still deferred.
- Do not fetch lead PII. Leads stay ID-only until `leads_retrieval` clears App Review.

## Definition of done — report on each

1. OAuth authorize URL requests all five scopes (paste the exact URL string).
2. "Load my Pages" returns the real Page list on a freshly reconnected account.
3. "Connect" on a Page returns `{"success": true}` and flips the UI to green.
4. A deliberately failing connect shows the red state with Meta's verbatim message and
   leaves `accounts.meta_page_id` UNCHANGED.
5. The old manual Page ID text input is gone.
6. Confirm whether this is deployed to PRODUCTION (adsproindia.com) or only to preview.
   State which. Previous prompts have been reported "working" against preview only.
