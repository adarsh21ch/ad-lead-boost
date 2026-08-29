# PROMPT 12 — Facebook Page card: state-driven UI + switch/disconnect

UI-only prompt plus one new server route. **No schema changes.** The existing columns are
sufficient — do not create migrations.

## The problem

The Page card currently shows its machinery instead of its state: "Load my Pages", a
dropdown, and "Connect" are all visible permanently, including when the Page is already
connected. A card that says "Connected" while offering a "Connect" button reads as broken.

Also, "Load my Pages" should not be a required first click. Pages should load on their
own; a manual refresh is only meaningful when the user has just created a NEW Page.

## Existing state you read from (already in the DB — do not recreate)

```
accounts.meta_page_id            -- the Page this account listens to
accounts.page_subscribe_status   -- 'not_attempted' | 'subscribed' | 'failed'
accounts.page_subscribe_error
accounts.page_subscribed_at
meta_pages(account_id, page_id, page_name, subscribe_status, subscribe_error, subscribed_at)
```

Existing routes: `POST /api/public/pages/refresh`, `POST /api/public/pages/connect`.

## Required behaviour — FOUR states, only ONE visible at a time

### STATE A — Not connected (`page_subscribe_status` null or 'not_attempted')
- On card mount, **automatically** call `/pages/refresh`. No button press required.
- While loading: a spinner and "Finding your Facebook Pages…"
- Then: dropdown (placeholder "Choose the Page your lead ads run from") + primary button
  **Connect Page**, disabled until a Page is selected
- Small text link underneath: **"Just created a new Page? Refresh list"** -> calls
  `/pages/refresh` again
- If refresh returns `scope_missing`: hide the dropdown entirely, show the
  **Reconnect Meta** button and its existing explanatory copy

### STATE B — Connected (`page_subscribe_status = 'subscribed'`)  ← the important one
Show ONLY:
- Green block: **"Connected — leads from this Page will arrive automatically"**
- The Page name and id, e.g. `Nevorai (1126670470531846)`
- `Subscribed <date/time>`
- ONE secondary text button: **Change Page**

**The dropdown, "Load my Pages", and "Connect" must NOT be rendered in this state.**
That is the entire point of this prompt.

### STATE C — Changing (user clicked "Change Page")
- Reveal the dropdown, pages auto-loaded, pre-selected to the currently connected Page
- Buttons: **Switch Page** (disabled until a DIFFERENT Page is chosen) and **Cancel**
- Small text link: "Just created a new Page? Refresh list"
- Amber warning above the buttons:
  "Leads from Nevorai will stop arriving once you switch."
- **Cancel** returns to STATE B unchanged

### STATE D — Failed (`page_subscribe_status = 'failed'`)
- Red block with `page_subscribe_error` shown in FULL, verbatim
- **Retry** button, plus the dropdown so a different Page can be chosen instead
- Keep the existing special-case: `(#200) …permissions is needed` is rewritten to the
  "Reconnect Meta" guidance

## NEW ROUTE — `POST /api/public/pages/disconnect`

Body `{ page_id }`. Cookie-session authed, ownership verified server-side, same pattern as
`/pages/connect`.

1. Confirm `page_id` belongs to a `meta_pages` row for THIS account
2. Decrypt the user token, fetch the PAGE token via `GET /me/accounts` (never accept a
   token from the client, never persist the page token)
3. Call `DELETE /{page_id}/subscribed_apps` with the PAGE access token
4. On success:
   - `meta_pages`: `subscribe_status='not_attempted'`, `subscribed_at=null`, `subscribe_error=null`
   - `accounts`: `meta_page_id=null`, `page_subscribe_status='not_attempted'`,
     `page_subscribed_at=null`, `page_subscribe_error=null`
5. On failure: return Meta's verbatim body; do not change `accounts` state

`'not_attempted'` is the correct reset value — the CHECK constraint allows only
`'not_attempted' | 'subscribed' | 'failed'`. Do not invent a `'disconnected'` value and do
not alter the constraint.

## SWITCHING ORDER — get this right, it matters

When the user confirms **Switch Page** from Page A to Page B:

1. **Subscribe B first.** If that fails, stop, show STATE D, and leave A connected and
   untouched. The user must never end up connected to nothing because of a failed switch.
2. Only after B succeeds, unsubscribe A.
3. If unsubscribing A fails, still treat the switch as successful (B is live) but show a
   small amber note under the green block:
   "Couldn't fully disconnect <A name> — leads from it may still be sent and will be
   ignored." Log Meta's verbatim error server-side.

**Never unsubscribe A before B is confirmed.** Doing it the other way round means a failed
switch leaves the customer receiving no leads at all, silently.

## Out of scope
- No schema changes, no migrations, no new columns
- Do not touch the CAPI dispatcher, cron, `run_capi_dispatcher()`, or the leadgen webhook
- Do not touch `/pages/refresh` or `/pages/connect` behaviour beyond what is described
- No agency / multi-account UI

## Definition of done — report on each
1. When connected, the dropdown / "Load my Pages" / "Connect" are genuinely NOT in the DOM
2. A fresh account auto-loads its Pages with no button press
3. "Change Page" reveals the picker; Cancel restores the connected view unchanged
4. Switching A -> B subscribes B before unsubscribing A (state the code order)
5. A forced failure on B leaves A connected and shows the red state
6. Disconnect clears `meta_page_id` and sets `page_subscribe_status='not_attempted'`
7. **State plainly whether this is deployed to PRODUCTION (adsproindia.com) or preview
   only.** Previous prompts have been reported working against preview.
