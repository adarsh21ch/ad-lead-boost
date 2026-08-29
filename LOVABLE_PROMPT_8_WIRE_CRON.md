# Lovable Prompt 8 — Schedule the CAPI dispatcher

Paste everything below the line into Lovable.

---

The retry/backoff work is done and verified. The dispatcher route
`/api/public/cron/capi-dispatcher` exists, is auth-protected (401s without credentials),
and has never been scheduled — nothing calls it. Wire that up now.

## 1. Tell me the auth contract first

State explicitly, in your reply: which secret name the route checks, and the exact header
format it expects (e.g. `Authorization: Bearer <CRON_SECRET>`). This is not recorded
anywhere in my notes and I need it documented.

## 2. Schedule it via Supabase pg_cron + pg_net

Use a Supabase migration — no new infrastructure, and it runs next to the data.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Schedule `capi-dispatcher` to run **every 2 minutes**. Status outcomes are not
latency-critical (Meta optimizes on a multi-hour horizon), but 2 minutes keeps the
Integration page feeling responsive when someone is watching a test.

Do NOT hardcode the secret in the migration file. Read it from Supabase Vault
(`vault.decrypted_secrets`) or a Postgres setting, so the SQL is safe to commit.

Handle the response: `pg_net` is async, so log or ignore cleanly — a failed cron HTTP
call must not raise inside the cron job and kill the schedule.

## 3. Guard against overlapping runs

If a batch takes longer than 2 minutes, two dispatcher invocations must not process the
same events. Use a Postgres advisory lock (`pg_try_advisory_lock`) inside the route, or
`select ... for update skip locked` when claiming events. Say which you used.

## 4. There is one orphaned event — leave it, it is the live test

`status_events` row `6dfc173b-7c03-4bce-8f2b-6e6268b601b6` is `dispatch_status='pending'`
with no delivery log (a test-event click that failed mid-deploy). It is a test event
sharing a deduped `event_id`, so dispatching it is harmless.

Do NOT delete or manually mark it. The first cron tick should pick it up, deliver it, and
flip it to `delivered` with a log row. That is the acceptance test for the whole
dispatcher. Report what happened to it after the first run.

## 5. Verify and report

After scheduling, confirm from the DB:
- `select * from cron.job;` shows the schedule
- `6dfc173b` moved from `pending` to `delivered`
- a new `capi_delivery_logs` row exists for it

Report the actual values. Do not report success based on the migration applying cleanly.

## Acceptance

- `cron.job` contains the dispatcher schedule.
- The orphaned pending event is delivered without manual intervention.
- Two concurrent runs cannot double-send an event.
- The cron secret is not committed in plaintext.
