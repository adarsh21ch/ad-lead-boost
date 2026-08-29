# Prompt 17 — Connection settings: the user manages their own Meta wiring

## Why this exists
Today a customer's Meta connection is configured ONCE, during first connect, and after that
there is no way to change any of it from the product. Changing an ad account currently
requires someone with database access. **That is not a feature gap, it is a bottleneck** —
every customer would have to ask us. Everything below must be doable by a signed-in user with
no help.

## Ground rules — read before writing code
The database, tables, views, RPCs, cron jobs and the insights fetcher already exist and are
correct. **ZERO migrations. ZERO DDL.** Do not create, alter or drop any table, view, column,
policy or function. Everything you need already exists and is listed below. If you think you
need a new database object, stop and say so instead of creating it.

Do not touch `LEAD_ENRICHMENT_ENABLED`. It stays `"false"`.

An account's Meta wiring is three INDEPENDENT fields on `public.accounts`:
| Field | Decides |
|---|---|
| `meta_page_id` | which AdsPro account an incoming lead belongs to — leads route by Page, nothing else |
| `meta_ad_account_id` | which ad account spend/insights are read from |
| `meta_dataset_id` | where Conversions API events are delivered |

Changing one must never disturb the other two. They are currently saved together by the
first-connect picker, which is exactly how they get clobbered.

## Task A — Connection settings section on the Integration page
Show all three, each with its own "Change" control, in the visual style of the existing
"Facebook Page" card so they read as one family.

1. **Facebook Page** — already built. Leave the behaviour alone; just bring it into the group.
2. **Ad account** — show the current id (e.g. `act_2447097022359700`). "Change ad account"
   opens the EXISTING picker at `/dashboard/select-ad-account`. **Reuse that route. Do not
   build a second picker and do not duplicate its Meta API calls.**
3. **Dataset (Pixel)** — show the current id. "Change dataset" lists the datasets available on
   the connected ad account and saves the chosen one.

## Task B — Validate BEFORE saving (the most important part of this prompt)
When a user picks an ad account or dataset, **prove the connection works before you persist
it.** Decrypt the account's token with the existing server-side helper (`getOwnedAccountToken`
— it already verifies `owner_user_id`; do not write a new decryption path) and make one real
Meta call against the chosen ad account.

- Call succeeds -> save, and show what was saved.
- Call fails -> **do not save.** Show the actual reason, mapped to something a human can act on:
  | Meta code | Message to show |
  |---|---|
  | 190 | "Your Meta connection has expired. Reconnect to continue." |
  | 200 or 10 | "Your Meta login doesn't have permission for this ad account." |
  | 17 or 4 | "Meta is rate limiting us right now. Try again in a few minutes." |
  | anything else | show Meta's own message, plus the code |

A saved-but-broken ad account is the worst outcome here: the dashboard just goes quiet and the
customer has no idea why. Saving only what you have proven is the whole point.

## Task C — Sync health, with a working "Sync now"
Customers cannot currently tell whether data collection is alive. Give them a small card:

- **Read `public.insights_sync_status`** — one row per account, already carries `status`,
  `started_at`, `finished_at`, `rows_written`, `meta_code` and a plain-language `verdict`
  ("Collecting normally", "Meta connection expired — reconnect required", "Missing permission
  on this ad account", "Meta rate limit reached — will retry automatically", "Last sync
  failed"). It is `security_invoker`, so RLS already scopes it to the owner. **Use the
  `verdict` column — do not re-implement what a `meta_code` means in the client.**
- Show last sync as relative time ("4 minutes ago"), plus the verdict.
- **"Sync now" button -> call the RPC `public.request_insights_sync(p_account_id, p_days)`.**
  It is already granted to `authenticated`, checks that `auth.uid()` owns the account, and
  enforces a 60-second cooldown. It returns jsonb:
  - `{"ok": true, "queued": true}` -> show "Sync started", then poll `insights_sync_status`
    for a few seconds and show the real outcome
  - `{"ok": false, "reason": "cooldown", "retry_after_seconds": N}` -> "Just synced, try again
    in N seconds"
  - `{"ok": false, "reason": "forbidden" | "not_found" | "not_configured"}` -> generic error
  **It returns "queued", NOT "synced".** Never render "Sync complete" off that response — the
  real outcome arrives in `insights_sync_status` seconds later. Reporting success before it is
  known is how a screen ends up lying to the person reading it.

## Task D — Token health and reconnect
`accounts.token_status` is already maintained (`healthy` / `invalid`). When it is `invalid`,
show a clear banner on Dashboard AND Integration with a **Reconnect Meta** button that runs
the existing OAuth connect flow. When healthy, show nothing — a permanent green badge trains
people to ignore it.

## Three requirements that are easy to get wrong
1. **Never clobber `meta_dataset_id`.** The first-connect picker writes ad account AND dataset
   together. Changing the ad account from Integration must preserve the existing dataset
   unless the user explicitly changes it. A blanked dataset silently kills Conversions API
   delivery and nothing on screen would reveal it.

2. **Set `meta_ad_account_timezone` to NULL whenever `meta_ad_account_id` changes.** Not
   optional. Meta reports insights in the AD ACCOUNT's timezone, and the fetcher SKIPS its
   timezone lookup when that column is already populated. Leaving the old value silently
   carries an unverified timezone onto a different ad account and misfiles every lead near the
   day boundary. Nulling it forces a genuine re-fetch on the next sync.

3. **Read and write through the logged-in user's session, not the service role.** These tables
   are RLS-scoped to the owner and that is the real security boundary — the same pattern the
   `/performance` screen already uses. Keep it.

## Copy to show when the ad account changes
Short, in the confirm step:
> Spend and performance data will now come from the new ad account. Your leads are unaffected —
> those arrive from your connected Facebook Page.

Accurate, and it heads off the obvious support question.

## Definition of done — answer every item explicitly in your reply
1. Confirm **zero** migrations and **zero** schema changes.
2. Name every file you changed, and state whether you reused `/dashboard/select-ad-account` or
   wrote new picker code.
3. List exactly which columns each save path writes.
4. Confirm `meta_dataset_id` is preserved when only the ad account changes, and say how you
   verified it.
5. Confirm `meta_ad_account_timezone` is set to NULL when `meta_ad_account_id` changes.
6. Confirm nothing is saved unless the validating Meta call succeeded, and list the error
   codes you map.
7. Confirm "Sync now" calls `request_insights_sync` and that the UI reports the outcome from
   `insights_sync_status`, not from the RPC's queued response.
8. Confirm reads/writes use the logged-in user's session, not the service role.
9. State whether it is published to adsproindia.com.
