# Lovable Prompt 9 — Debug: cron ticks "succeed" but nothing is ever dispatched

Paste everything below the line into Lovable.

---

The `capi-dispatcher` cron (jobid 1, every 2 minutes) is confirmed firing on schedule —
`cron.job_run_details` shows 5+ consecutive `status=succeeded` runs. But nothing is
actually being delivered:

- A `status_events` row was set to `contacted` via the Leads page at ~14:47 UTC
  specifically as a live test. It is STILL `dispatch_status='pending'` after 3+ cron
  ticks.
- `net._http_response` (confirmed this is the right table — `extensions._http_response`
  does not exist, `net._http_response` does) has **zero rows** in the same window.

Zero rows in `net._http_response` is the key fact: it means `net.http_post()` is very
likely never being called at all — not "called and got a 401." Something inside
`public.run_capi_dispatcher()` is throwing before it reaches the HTTP call, and the
`exception when others then raise log` block is swallowing that error, which is why
pg_cron still reports `succeeded`.

## What to do

1. **Pull the actual Postgres logs** for the last 15 minutes (Supabase Dashboard → Logs
   → Postgres Logs, or the Logs Explorer). Search for log lines from
   `run_capi_dispatcher` around 14:42–14:52 UTC. The `raise log` call should have written
   the real exception message and SQLSTATE. Quote it back to me verbatim.

2. Prime suspects, roughly in order of likelihood — confirm or rule out each:
   - **Vault read fails.** `vault.decrypted_secrets` requires the calling role to have
     the right grants; if `run_capi_dispatcher()` runs as a role without access (or the
     secret named `CAPI_CRON_SECRET` doesn't actually exist in Vault yet, only in
     Lovable's own secret store — those are DIFFERENT stores), the `select` against
     `vault.decrypted_secrets` throws before any HTTP call is built.
   - **`claim_due_status_events()` throws** — e.g. a permissions issue on the
     `status_events`/`leads`/`accounts` join, or the function signature doesn't match
     how it's being called from `run_capi_dispatcher()`.
   - **Publish gap** — confirm explicitly whether the CURRENT PUBLISHED deployment on
     adsproindia.com actually matches the code you described building. If the dispatcher
     function itself lives in the database (it does, it's a Postgres function) it doesn't
     need a frontend publish — but double check nothing about it depends on
     unpublished application code or environment variables that only exist in a preview
     environment and not in the linked production Supabase project.

3. Fix the actual root cause. Do not just widen the exception handler or add more
   swallowing — the bug is that a real error has no visible trail. At minimum, make the
   `raise log` message include enough detail (SQLSTATE + SQLERRM + which step failed) that
   this is diagnosable from logs alone next time, and confirm the secret genuinely exists
   in `vault.decrypted_secrets` with that exact name before we go further.

4. After the fix, do not just say "fixed." Manually trigger one run (`select
   public.run_capi_dispatcher();` directly, or wait for the next tick) and confirm:
   - `net._http_response` gets a new row with a real status_code
   - the pending `contacted` status_event flips to `delivered`
   Report the actual row values.

## Acceptance

- Root cause identified and quoted from real log output, not guessed.
- The pending `contacted` test event is delivered without any manual UI click.
- `net._http_response` shows real HTTP responses going forward.
