# Lovable Prompt 6 — Fix the ad account / dataset picker

Paste everything below the line into Lovable.

---

The **"Choose ad account & dataset"** flow is broken in production on adsproindia.com.
The page at `/dashboard/select-ad-account` loads (the browser tab title reads
"Select Meta Account — AdsPro"), but the user cannot complete the selection —
clicking through does nothing visible and no ad account or dataset ever gets saved.

The Meta OAuth connection itself succeeded: the account row has status `active` and a
stored access token. Scope granted is `ads_management,business_management`
(`leads_retrieval` was deliberately removed).

## Step 1 — Diagnose before changing anything, and tell me what you find

Do not guess. Read the actual code and report back concretely on each of these:

1. What does `/dashboard/select-ad-account` do on mount? Which Meta Graph endpoint does
   it call to list ad accounts, from where (browser or server), and with which token?
2. Is `/dashboard` a parent route in the generated route tree? If `dashboard.tsx` renders
   dashboard UI **without** an `<Outlet />`, child routes render nothing. This was
   identified as a root cause in a previous session — confirm whether that fix is
   actually present in the deployed code or was lost.
3. What happens on click of the final confirm/save control? Trace it to the write that
   sets `accounts.meta_ad_account_id` and `accounts.meta_dataset_id`.
4. Are there any silently swallowed errors on that path — `catch {}`, `.catch(() => null)`,
   optional chaining that turns a failure into an empty list, or a promise with no
   error branch?

Report findings before or alongside the fix. I need to know which of these it was.

## Step 2 — Fix the actual cause

Whatever the diagnosis, the end state must be: a logged-in user with an `active` account
can pick an ad account, then pick a pixel/dataset, and both IDs persist to the `accounts`
row for their account only.

Requirements on the fix:

- **All Meta Graph calls for this page must happen server-side**, never from the browser.
  The access token must never reach client JavaScript. The server route verifies
  `owner_user_id = auth.uid()` before decrypting or using the token.
- Ad accounts come from `GET /me/adaccounts?fields=id,name,account_status,business`.
  Datasets/pixels come from `GET /{ad_account_id}/adspixels?fields=id,name` (and/or the
  business-owned datasets endpoint if the pixel is owned by the business portfolio, which
  is common — handle both, do not assume the pixel hangs off the ad account).
- The write must set BOTH `meta_ad_account_id` (in `act_...` form) and `meta_dataset_id`,
  in one server-side update scoped to the owner's account.

## Step 3 — Stop failing silently. This is the recurring bug in this app.

Every failure mode on this page must be visible in the UI, not just in logs:

- Meta call fails -> render Meta's actual error (`message`, `code`, `error_subcode`,
  `fbtrace_id`) in a dismissible error panel on the page.
- Meta returns an **empty** ad account list -> do not render a blank page. Show:
  "No ad accounts found for this Meta user. Check that this Facebook account has an
  Business role on an ad account." Include the raw response in a collapsed details block.
- Token is expired or invalid (Meta code 190) -> set `accounts.status = 'token_expired'`
  and show a "Reconnect Meta" button.
- The save mutation fails -> show the DB error, do not close the dialog or navigate away.
- Add a loading state so the page cannot look identical to a finished-but-empty state.
  A user must never be unable to distinguish "loading", "empty", and "errored".

Also add a `[select-ad-account]` prefix to every server-side log line on this path so it
can be filtered in the Lovable logs, and log Meta's full response body on any non-2xx.

## Step 4 — Verify before you tell me it is done

Confirm in the deployed app that the list actually populates and the selection persists.
Do not report success based only on the code compiling. If you cannot verify end to end,
say exactly what you could not verify.

## Acceptance

- Clicking "Choose ad account & dataset" lands on a page that shows either a populated
  list, a clear empty-state message, or a concrete Meta error — never a blank/inert page.
- Selecting an ad account then a dataset writes both IDs to the `accounts` row.
- Returning to the dashboard shows the connected ad account and dataset.

---

## HARD EVIDENCE from the production database (2026-08-26) — read this first

Queried directly against Supabase. This narrows the cause considerably:

| Field | Value |
|---|---|
| `accounts.status` | `active` |
| `meta_ad_account_id` | **NULL** |
| `meta_dataset_id` | **NULL** |
| token at rest | validly encrypted (pgp_sym_encrypt), decryptable |
| `meta_token_expires_at` | 2026-10-25 (~60 days out, healthy) |

What this rules OUT:
- It is **not** an auth/session problem — the account row exists and is `active`.
- It is **not** an expired or missing Meta token — the token is present, encrypted
  correctly, and valid for ~60 more days.
- It is **not** a partial write — BOTH columns are NULL, so the save path has never
  once completed for any user.

Therefore the failure is in exactly one of:
1. The Meta Graph call that lists ad accounts returns empty or errors, and the UI renders
   that as a blank/inert page instead of showing why.
2. The final save mutation never fires, or fires and errors silently.
3. The page never reaches the point of calling either, because of the route/`<Outlet />`
   issue described above.

Determine WHICH of these three it is and say so explicitly in your report. Do not
describe the fix without naming the cause.

Note the correct signature for token decryption, since a wrong call here fails at runtime:
`public.decrypt_token(p_encrypted text, p_key text)` — TWO arguments, value then key.
It is `security definer`. Confirm the server route calls it with both args.

While you are in these functions: verify `encrypt_token` and `decrypt_token` each declare
an explicit `SET search_path` (e.g. `SET search_path = ''` with fully-qualified calls into
`extensions.pgp_sym_encrypt` / `extensions.pgp_sym_decrypt`). A SECURITY DEFINER function
with a mutable search_path is a privilege-escalation risk and Supabase's linter flags it.
If the pin is missing, add it — but do NOT change the encryption algorithm, key handling,
or the stored format, because a live encrypted token already exists and must stay readable.
