# PROMPT 13 — Settings page: Disconnect Meta + Delete account (App Review blocker)

## Why this is urgent

Meta App Review reviewers FOLLOW the steps written on `/data-deletion` literally. If that
page describes a control that does not exist in the app, the submission gets rejected.

Confirmed by walking the live UI on adsproindia.com: the nav has only **Dashboard, Leads,
Deliveries, Integration**. There is **no Settings or profile area at all**, and therefore
no "Disconnect Meta" and no "Delete account" control anywhere. Both must exist.

---

# PART 1 — Report these before building (short, factual)

1. **Quote verbatim** what `/data-deletion` currently instructs a user to do, and what
   `/privacy` promises about deletion, data export, and the 90-day retention period.
2. Does anything in the codebase already implement account deletion or Meta disconnection
   (even unreferenced)? Path if yes, "none" if no.
3. Does `/privacy` promise a **data export / right of access**? Yes/no. Do not build it —
   just report, so we know whether another gap exists.

Do not skip this. The new UI copy has to match the legal pages word for word, and I do not
have the current wording.

---

# PART 2 — Build a Settings page

## 2a. Navigation

Add **Settings** to the left sidebar, below **Integration**. Same styling as the others.
Route: `/dashboard/settings`.

Reason for a dedicated page rather than tacking controls onto Integration: reviewers look
for account controls under Settings, and `/data-deletion` can then give one unambiguous
path — "Dashboard → Settings" — instead of describing a buried section.

## 2b. Page layout — three sections, in this order

### Section 1: "Your account"
- The signed-in email address, read-only
- Account name (`accounts.name`)
- A **Sign out** button (the sidebar one stays where it is; this is an additional,
  expected placement)

### Section 2: "Meta connection"
Neutral styling — this is reversible, not destructive.

When connected, show a compact summary:
- Ad account, Dataset, Page name, and "Token valid until <date>"
- Button: **Disconnect Meta** (secondary/outline style, amber accent — not red)

When not connected: "No Meta account connected." plus a link to Integration.

**Confirmation dialog** — required. Exact copy:

> **Disconnect Meta?**
> New leads will stop arriving and lead outcomes will stop syncing to Meta.
> Your existing lead history stays in AdsPro.
> You can reconnect at any time from the Integration page.
> [Cancel] [Disconnect]

**What Disconnect does, in this order:**
1. If a Page is connected, unsubscribe it — reuse the existing
   `/api/public/pages/disconnect` logic. Log failures, do not block on them.
2. Call `DELETE /me/permissions` on the Graph API with the user token, so access is
   genuinely revoked on Meta's side rather than merely forgotten locally. **Reviewers
   check this.** Log Meta's verbatim response.
3. Clear on `accounts`: `meta_access_token_encrypted`, `meta_token_expires_at`,
   `meta_ad_account_id`, `meta_dataset_id`, `meta_page_id`, `page_subscribe_status`,
   `page_subscribe_error`, `page_subscribed_at`. Set `status` to whatever value the OAuth
   flow uses BEFORE a successful connect — match the existing value, do not invent one.
4. Reset this account's `meta_pages` rows to `subscribe_status='not_attempted'` with null
   `subscribed_at` / `subscribe_error`.
5. **Do NOT delete `leads`, `status_events`, or `capi_delivery_logs`.** Disconnecting is
   not deleting.
6. Redirect to `/dashboard` with a toast: "Meta disconnected."

### Section 3: "Danger zone"
Red border, red heading, visually separated from everything above with clear whitespace.

Heading: **Danger zone**
Body copy:
> Deleting your account permanently removes your AdsPro account, every lead, every status
> event, and every delivery record. This cannot be undone.

- A text input labelled: `Type DELETE to confirm`
- Button **Delete my account and all data** — red, **disabled until the input reads exactly
  `DELETE`** (case-sensitive, trimmed)

**What Delete does, in this order:**
1. Everything Disconnect does (steps 1-4 above), so Meta access is revoked first
2. Permanently delete this owner's `accounts` row — cascades to `leads`, `status_events`,
   `capi_delivery_logs`, `meta_pages`
3. Delete the Supabase auth user
4. Sign out and redirect to the landing page with a toast: "Your account and all data have
   been deleted."

If step 3 fails after step 2 succeeded, still sign the user out and report the failure
server-side. Never leave the user staring at a dashboard for data that no longer exists.

## 2c. Server routes

`POST /api/public/account/disconnect-meta` and `POST /api/public/account/delete`.

Both cookie-session authed, both verify ownership server-side, neither accepts an account
id from the client. Same auth pattern as the existing `/api/public/pages/*` routes.
Return Meta's verbatim body on any Graph failure.

## 2d. Make `/data-deletion` match reality — word for word

After building, rewrite `/data-deletion` so its instructions match exactly what a reviewer
will see. Name the exact nav item, the exact section heading, and the exact button label.

It must describe BOTH paths clearly:
- **Disconnect only** — Dashboard → Settings → Meta connection → Disconnect Meta
- **Delete everything** — Dashboard → Settings → Danger zone → type DELETE → Delete my
  account and all data

If `/privacy` also describes deletion, update it to match. The three surfaces (privacy
page, data-deletion page, actual UI) must not contradict each other.

## 2e. Two small fixes on the Facebook Page card

1. The amber "Leads from X will stop arriving once you switch" warning currently appears
   as soon as the picker opens, while the CURRENT page is still selected. Show it only
   once a DIFFERENT page is chosen, and name both:
   "Leads from Nevorai will stop arriving. Leads from Xento will start."
2. The card subtitle still reads "…pick the Page your lead ads run from" when a Page is
   already connected. In the connected state change it to:
   "AdsPro is listening for new leads from this Page."

---

# Out of scope
- Do not touch the CAPI dispatcher, `run_capi_dispatcher()`, pg_cron, or the leadgen webhook
- **No migrations, no new columns.** The existing schema is sufficient.
- Do not build the 90-day retention purge job — Claude owns scheduled jobs and will do it
  in Postgres
- Do not build data export
- No agency / multi-account UI

# Definition of done — report on each
1. PART 1 answers (verbatim quotes for 1; path-or-none for 2; yes/no for 3)
2. What you BUILT vs what already existed — be explicit, do not imply you built something
   that was already present
3. The exact nav item, section headings, and button labels a reviewer will see
4. Confirm `DELETE /me/permissions` is actually called on disconnect, not just local clearing
5. Confirm the delete button stays disabled until the user types `DELETE`
6. Confirm `/data-deletion` wording now matches the UI word for word
7. **PRODUCTION or preview?** State it plainly and check before answering — reports on the
   last two prompts have been wrong in both directions.
