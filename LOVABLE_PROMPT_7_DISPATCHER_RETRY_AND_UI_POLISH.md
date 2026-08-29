# Lovable Prompt 7 — Dispatcher retry/backoff + dashboard polish

Paste everything below the line into Lovable. Two parts — do both.

---

## Part 1 — Fix dispatcher retry semantics (do this before the cron is ever scheduled)

Context: the CAPI dispatcher currently has two bugs that are opposite failure modes.
A permanently-failing event gets re-sent on every cron tick forever (no cap on retries).
Separately, a 7-day age floor was added that causes anything undelivered past 7 days to
silently drop out of the scan with no record and no alert. Both are wrong. Fix properly:

### Schema

```sql
alter table status_events
  add column if not exists dispatch_status text not null default 'pending'
    check (dispatch_status in ('pending', 'delivered', 'abandoned')),
  add column if not exists next_attempt_at timestamptz not null default now();
```

`capi_delivery_logs.retry_count` already exists — use it as the attempt counter, one log
row per attempt (do not overwrite, insert a new row per attempt so the history is
auditable in "Recent deliveries").

### Dispatcher logic

Select candidates: `status_events` where `dispatch_status = 'pending'` and
`next_attempt_at <= now()`, oldest first, limit 50 (or your existing batch size).

For each event:
1. Attempt Meta delivery as today.
2. On success (Meta 2xx with no error in body): insert the delivery log row with
   `delivered_at = now()`, set `status_events.dispatch_status = 'delivered'`.
3. On failure: insert the delivery log row with the real `http_status`/`meta_response`,
   `retry_count` = however many attempts have been logged for this event so far.
   Compute backoff from that count with exponential delay, capped:
   `1min, 5min, 30min, 2hr, 6hr, 24hr` — after the 6th attempt, no more retries:
   set `status_events.dispatch_status = 'abandoned'` instead of scheduling another
   attempt. Otherwise set `next_attempt_at = now() + <backoff for this attempt count>`.

Delete the 7-day floor entirely — it's superseded by the explicit `abandoned` state,
which is visible instead of silent.

### Make "abandoned" visible, not silent

On `/dashboard/integration`, "Recent deliveries" must show a distinct badge for
`abandoned` events (separate from the existing pass/fail colors — e.g. grey/amber, label
"Abandoned after N attempts"), so a permanently-failing integration is something the user
can actually see and act on, not something that disappears from history.

---

## Part 2 — Dashboard + UI polish

### 1. Token expiry visibility (highest priority — this has silently killed integrations before)

On `/dashboard`, next to the connection status badge, add:
- If `meta_token_expires_at` is within 14 days: a visible warning banner — "Your Meta
  connection expires in N days. Reconnect now to avoid losing lead-sync." with a
  "Reconnect Meta" button.
- If already expired (`status = 'token_expired'` or `meta_token_expires_at < now()`):
  a non-dismissible red banner, same CTA, and block "Send test event" on the Integration
  page with a message pointing back to reconnect.
- Otherwise (healthy): a quiet muted line under the connection card, "Token valid until
  {date} ({N} days)" — no alarm styling, just visible instead of invisible.

### 2. Dashboard connection card

Add a "Manage integration" link/button on the card that goes straight to
`/dashboard/integration`. Right now a user has to know that page exists via the nav;
the card that shows the live connection should link forward to the page that proves it
works.

### 3. Empty-state audit

Check `/dashboard/leads` and `/dashboard/deliveries` for generic "no data" / blank-table
states. Bring them to the same standard already used on the Integration page's "Recent
deliveries" empty state ("No events delivered yet — send a test event above."): a short
sentence explaining why it's empty and, where applicable, a link to the action that would
populate it. Do not add speculative empty-state copy for tables that already handle this
well — only fix ones that currently render blank/inert.

## Acceptance

- A status event that fails 6 times stops retrying and shows `abandoned` in the UI,
  never silently disappears.
- A status event that fails then later succeeds shows `delivered`, with the earlier
  failed attempts still visible in its history.
- Dashboard shows token days-remaining always, and escalates to a banner inside 14 days.
- Every table that can be empty explains why, instead of rendering blank.
