# AdsPro — Who builds what (Claude vs Lovable)

Goal: minimise Lovable credit burn. Written 2026-08-27.

## The key realisation

**The CAPI dispatcher already proves the pattern.** `run_capi_dispatcher()` and
`claim_due_status_events()` are POSTGRES FUNCTIONS. `pg_net` makes the HTTP calls to
Meta. `pg_cron` schedules them. None of that is Lovable code — it all lives in the
database. It was built via SQL migrations, not the app.

That means any scheduled, non-user-facing backend work can bypass Lovable entirely.

## What Claude can do directly (NO Lovable credits)

Tooling available and confirmed on this machine:
- `supabase` CLI v2.101.0, linked to project `wxgfaaaboftzsazknbvl`
- so: `supabase db push` (migrations), `supabase functions deploy` (Edge Functions)

Therefore Claude can build, unaided:
- **All schema** — tables, columns, indexes, constraints, RLS policies
- **All SQL views / materialised views** — including the entire Phase B metric layer
- **All Postgres functions** — including HTTP-calling ones via `pg_net`
- **All scheduling** — `pg_cron` jobs
- **Supabase Edge Functions** — written and deployed via CLI
- **The Meta Insights sync itself** (Phase A) — as a Postgres function + pg_cron, exactly
  like the dispatcher. No app code needed.
- Data backfills, migrations, verification queries, diagnostics

## What genuinely requires Lovable

Only things inside the React app (`src/`):
- **Pages and components** — the Phase C explorer UI, dashboards, tables, charts
- **Anything user-facing** — nav, empty states, badges, forms
- **Server routes that need the logged-in user's session** (cookie auth lives in the app)

That is it. UI, essentially.

## Revised phase ownership

| Phase | Claude (free) | Lovable (credits) |
|---|---|---|
| A — Metrics warehouse + Meta Insights sync | ~100% | none |
| B — Joined metrics (cost-per-qualified-lead etc.) | 100% | none |
| C — Explorer UI (dropdowns, tables, charts) | none | 100% |
| D — AI advisor | aggregation + prompt logic | display only |
| E — Actions (pause/scale/duplicate) | Meta write calls | buttons + confirm UI |
| F — Audience sync | 100% | small settings UI |

Rough split of remaining work: **~60-70% can avoid Lovable entirely.**

## Rules to avoid conflicts

1. **Tell Lovable what already exists.** When giving it a UI prompt, state which tables,
   views and functions Claude created, and say explicitly: *do not recreate these, read
   from them.* Otherwise Lovable may duplicate or "fix" objects it does not recognise.
2. **Keep migrations in `supabase/migrations/`** and committed, so both sides see one
   source of truth.
3. **Backend style is now deliberately mixed** — Lovable's TanStack server routes for
   user-session work, Postgres functions/pg_cron for scheduled jobs. That is the correct
   home for background work anyway, but note it so nobody "consolidates" it later by
   accident.
4. **Lovable prompts should be UI-only from here.** If a prompt contains schema or cron,
   it is in the wrong place — give it to Claude instead.

## Top efficiency unblock (still outstanding)

`/Users/apple/adspro/.env` still has EMPTY `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Filling these lets Claude query and verify the DB directly
instead of round-tripping every SQL statement through the dashboard editor and pasting
results back. This session burned significant time and cost on exactly that loop.

Get them from Supabase Dashboard -> Project Settings -> API.
One variable per line. Never join two on one line.
