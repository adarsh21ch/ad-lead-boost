# AdsPro — Build Status & Checklist

Last updated: 2026-08-29 (session 9)

## What AdsPro is

Multi-tenant SaaS. Advertisers running Meta Lead Ads connect their own ad account, then
lead-status outcomes (Qualified / Booked / Purchased) get pushed back to Meta via the
Conversions API so Meta's algorithm optimizes for people who actually convert, not just
form-fillers. Lead status arrives from Zapier, any CRM, nCall, or manual entry.

## Environment / infra

| Thing | Value |
|---|---|
| Local repo | `/Users/apple/adspro` (specs + prompts only; app code lives in Lovable) |
| Lovable project | "Lead Sync Pro" (UI says AdsPro) |
| Supabase project | `AdsPro` — ref `wxgfaaaboftzsazknbvl`, Mumbai |
| Live domain | https://adsproindia.com (HTTP 200 confirmed) |
| Fallback domain | https://ad-lead-boost.lovable.app |
| Meta App | "AdsPro India", App ID 1771096100977376, Nevorai business portfolio (verified) |
| Backend style | TanStack Start server routes under `src/routes/api/public/` — NOT Supabase Edge Functions |
| Local secrets | `/Users/apple/adspro/.env` |

Secrets live in **Lovable's secret store** (the server routes read Lovable env, not Supabase
secrets). Supabase secrets were set early on but are unused — harmless, ignore them.

## DONE

**Infra & accounts**
- [x] Meta App created, connected to verified Nevorai business portfolio
- [x] App ID + Secret generated, stored in `.env` and Lovable secrets
- [x] Supabase project created + CLI linked
- [x] Custom domain adsproindia.com connected and live
- [x] Meta Authorize callback URL set to `https://adsproindia.com/api/public/auth/meta/callback`
- [x] `META_VERIFY_TOKEN` generated (`b862a6dc60f1bf56f76e04cd193e3ae2`)

**Database** (verified against spec — matches exactly)
- [x] `accounts`, `leads`, `status_events`, `capi_delivery_logs`
- [x] RLS enabled, owner-scoped SELECT/ALL policies
- [x] `event_id` per lead for Meta-side dedup
- [x] Match-key columns present: `phone_hash`, `email_hash`, `fbc`, `fbp`, `client_ip`,
      `client_user_agent`

**Backend routes** (exist — behavior NOT yet tested)
- [x] `GET /api/public/auth/meta/callback`
- [x] `GET/POST /api/public/webhooks/meta-leadgen`
- [x] `POST /api/public/webhooks/status`
- [x] `GET/POST /api/public/cron/capi-dispatcher`

**Frontend**
- [x] Landing page ("Teach Meta which leads actually convert")
- [x] Auth (signup/login) — Lovable fixed a `/auth` 404
- [x] Dashboard shell

## VERIFIED LIVE (probed with curl against adsproindia.com, 2026-08-26)

**Routes**
- [x] `GET /api/public/webhooks/meta-leadgen` — correct `META_VERIFY_TOKEN` → 200 + echoes
      `hub.challenge`; wrong token → 403. **Ready to paste into Meta app webhook config.**
- [x] `POST /api/public/webhooks/status` — 401 `{"error":"missing_bearer_token"}` without auth
- [x] `GET /api/public/cron/capi-dispatcher` — 401 without auth
- [x] `GET /dashboard/select-ad-account` — 200 (ad account + dataset picker exists, lists
      ad accounts then pixels, saves `meta_ad_account_id` + `meta_dataset_id`)

**OAuth reason codes — all 4 acceptance probes pass**
- [x] no params → `?meta_connect=error&reason=no_code`
- [x] `?error=access_denied` → `reason=meta_denied`
- [x] `?code=FAKE` → `reason=state_missing`
- [x] `?code=FAKE&state=bogus` → `reason=state_mismatch` (CSRF state validated BEFORE token
      exchange — confirmed real, not cosmetic)
- Other server-side codes exist but need a real flow to trigger: `missing_config`,
  `token_exchange` (redirect_uri mismatch lands here), `token_upgrade`, `encryption_config`,
  `db_write`. Full Meta error detail (`message`/`code`/`error_subcode`/`fbtrace_id`) is
  logged server-side only.

**Security / storage**
- [x] **RESOLVED + CONFIRMED**: `public.encrypt_token(p_token text, p_key text)` and
      `public.decrypt_token(p_encrypted text, p_key text)` both exist, `security definer`.
      They take TWO args (value + key). The earlier `42883` was a bad call in my own
      verify SQL (one arg), NOT a missing function. pgcrypto 1.3 in schema `extensions`.
      TOKEN IS GENUINELY ENCRYPTED: stored value begins `ww0EBwMC`, which is BASE64 (not
      hex) and decodes to `c3 0d 04 07 03 02` = PGP symmetric-key session packet,
      AES-128, iterated+salted S2K — i.e. real `pgp_sym_encrypt` output.
      *** Any future check must test for base64 prefix `ww0E`, NOT hex `\xc30d`. ***
      OAuth callback encrypts before write; decrypt only in `deliverStatusEvent` and
      `getOwnedAccountToken` (which also verifies `owner_user_id`). Legacy plaintext rows
      fall through unencrypted and re-encrypt on reconnect.
- [x] `status_events` RLS — no INSERT policy needed. Manual entry goes through the
      `setLeadStatus` server fn: RLS-scoped ownership read, then service-role insert with
      `source: "manual"`. Nothing writes from the browser. SELECT-only policy is correct.

## ACTION REQUIRED

- [~] Rotate `TOKEN_ENCRYPTION_KEY` / reset duplicate Meta app secret — **DECLINED by
      Adarsh (session 3), deliberately deferred. Do not re-raise.** Rationale for the
      record: the key value appeared in a chat transcript and a stale second app secret
      may still be valid. Revisit only before public launch / App Review.
- [ ] Enable Supabase Auth → Password Security → leaked password protection (dashboard
      toggle, not settable via SQL; flagged by the security linter)

## NOT BUILT — BACKEND

- [x] **Connect Meta OAuth flow — WORKS end to end.** Account status = `active`.
      Error paths now debuggable; picker exists. Rotate the encryption key first.
- [ ] Meta leadgen webhook subscription actually configured in the Meta app (Page object →
      `leadgen` field) and verified with `META_VERIFY_TOKEN`
- [ ] Cron schedule actually wired for `capi-dispatcher` (route exists; is anything calling it?)
- [ ] Retry/backoff on failed CAPI deliveries (`retry_count` column exists, unused)
- [x] Dispatcher re-send bug: **NOT PRESENT** in deployed code. My flag came from the
      local reference file `supabase/functions/capi-dispatcher/index.ts`, which does have
      the broken shape but is NOT what runs. Deployed `findUndeliveredStatusEvents`
      already excluded events with a SUCCESSFUL delivery log, oldest-first.
      Real bug found instead: the scan took first N by age regardless of delivery state,
      so accumulated old rows would stall the window and starve new events. Fixed —
      widened scan, 7-day floor, slice to limit AFTER filtering.
- [ ] **NEW — poison-event infinite retry.** The filter excludes only SUCCESSFUL delivery
      logs, so a permanently-failing event is re-sent every cron tick forever. Nothing
      caps it: `retry_count` still exists and is still unused. Must be capped BEFORE the
      cron is wired, or the first bad event hammers Meta indefinitely.
- [ ] **NEW — 7-day floor silently abandons events.** Anything undelivered for >7 days
      falls out of the scan permanently, with no alert and no dead-letter state. A
      week-long token expiry would silently drop every event in that window. Needs a
      terminal `abandoned` state + a visible signal, not silent disappearance.
- [ ] Token health monitoring — daily expiry check + re-auth alert (Meta tokens die at ~60
      days and the integration goes silent with no signal)
- [ ] Data retention job — auto-purge hashed PII after N days (DPDP Act 2023, India)

## NOT BUILT — FRONTEND / UX

- [x] **Integration page — BUILT & LIVE** at `/dashboard/integration` (old `/integration`
      replaced, nav updated). Masked key + reveal + regenerate (ownership verified
      server-side, then service-role write), key hidden until account active w/ dataset,
      contract + status mapping + response codes, Zapier steps w/ key inlined on reveal,
      collapsed cURL, recent deliveries w/ test chips + expandable responses.
- [x] **"Send test event" — BUILT, NOT YET FIRED.** `POST /api/public/test-event`,
      cookie-session authed, reusable `adspro_test_lead`, SHA-256 of
      `test@adsproindia.com`, optional `test_event_code`, logs `is_test = true`, renders
      Meta's verbatim JSON. Migration applied: `is_test` on `leads` +
      `capi_delivery_logs`. **Clicking it is the highest-value untaken action.**
- [ ] **Manual status dashboard** — lead table with a status dropdown per row, for users with
      no CRM at all
- [ ] **Delivery log view** — recent `capi_delivery_logs` with success/fail, so the invisible
      pipe becomes visible
- [ ] **Funnel dashboard** — Submitted → Contacted → Qualified → Booked → Purchased, with
      cost-per-qualified-lead (not just cost-per-lead). This is the actual retention driver;
      the CAPI sync itself is invisible plumbing. Highest-value remaining UI work.
- [ ] Onboarding flow polish + empty states
- [ ] Token-expiry warning banner in the dashboard

## NOT BUILT — LAUNCH BLOCKERS (external, slow, start early)

- [ ] **Become a Tech Provider** in the Meta app — required to request access to *other
      businesses'* ad accounts. Without it, App Review will likely reject. Has its own
      verification step.
- [ ] **App Review submission** for `ads_management` + `leads_retrieval` — justification text
      already written in `META_APP_REVIEW_JUSTIFICATION.md`. Needs a screencast of the full
      flow on a real ad account.
- [ ] **Privacy Policy page** (hard requirement for App Review — must specifically describe
      lead data handling)
- [ ] **Terms of Service page** (hard requirement)
- [ ] Decide data retention period, then document it in the privacy policy

## DEFERRED — PHASE 2

- [ ] Native nCall / Enarsia integration (direct DB trigger, no webhook hop)
- [ ] Per-account custom status→event mapping UI
- [ ] Agency mode: one login managing multiple client ad accounts
- [ ] Billing / plans
- [ ] Purchase events with monetary value (needs order data, not just status)

## Reference files in this repo

- `lead-quality-sync-spec.md` — full architecture spec + audit (the 8 gaps found and fixed)
- `LOVABLE_PROMPT_1_FOUNDATION.md` — the prompt that built the current app
- `META_APP_REVIEW_JUSTIFICATION.md` — ready-to-paste App Review text
- `supabase/migrations/0001_init.sql` — reference schema (Lovable applied its own equivalent)
- `supabase/functions/` — reference implementations; Lovable used server routes instead
- `LOVABLE_PROMPT_2_OAUTH_DEBUG.md` — OAuth reason codes + ad account picker check
- `VERIFY_INFLIGHT.sql` — one-paste DB check (superseded; items now confirmed done)
- `VERIFY_ACCOUNT_ROW.sql` — one-paste check after choosing ad account + dataset:
  status/act_ id/dataset/expiry, `\xc30d` vs `EAA` encryption verdict, decrypt round-trip,
  pipeline row counts, crypto-fn grants
- `LOVABLE_PROMPT_5_INTEGRATION_PAGE.md` — Integration page + Send test event
- `LOVABLE_PROMPT_6_FIX_SELECT_AD_ACCOUNT.md` — fix the broken ad account/dataset picker
- `NEXT_STEPS.md` — ordered runbook (steps 1-3 now obsolete, rotation declined)
- `VERIFY_ONE_SHOT.sql` — single-result-set diagnostic. USE THIS ONE: the Supabase SQL
  editor only displays the LAST statement's output, so multi-statement scripts silently
  discard earlier results.

## Blocking Claude's ability to verify

Local `/Users/apple/adspro/.env` has EMPTY values for `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, and the first
`META_APP_ID`/`META_APP_SECRET` pair (duplicated lower down with real values).
Filling in the Supabase URL + service role key lets DB state be checked directly instead of
round-tripping SQL through the dashboard.

## Session 2 addendum (2026-08-26)

- Legal pages LIVE and verified rendered: `/privacy`, `/terms`, `/data-deletion` (200, full
  content, 90-day retention, DPDP grievance officer, fiduciary/processor split).
- Meta app config VERIFIED via Graph API (not the dashboard UI, which renders stale values):
  `app_domains=[adsproindia.com]`, `privacy_policy_url`, `terms_of_service_url`,
  `category=Business`, `link=https://adsproindia.com/` — all correctly stored.
  **The Basic Settings page showing empty fields is a UI display bug — ignore it.**
- Graph API check command (app access token, read-only):
  `curl "https://graph.facebook.com/v21.0/$APP_ID?fields=app_domains,privacy_policy_url,terms_of_service_url,category,link&access_token=$APP_ID%7C$APP_SECRET"`
- FIXED: `.env` had META_APP_SECRET and META_VERIFY_TOKEN concatenated on one line
  (secret read as 82 chars). Backup at `.env.bak`. VERIFY the value in Lovable secrets is
  the clean 32-char secret — a mangled one fails OAuth at `reason=token_exchange`.
- TODO: `/data-deletion` promises a delete-account control and a disconnect-Meta control.
  Confirm both exist in the dashboard UI before App Review — reviewers follow those steps.

## Session 2 — OAuth debugging chain (resolved in order)

1. "Can't load URL / domain not in app's domains" → App Domains WAS set (verified via
   Graph API); the Basic Settings UI renders stale values. Real cause was elsewhere.
2. Real cause: **Valid OAuth Redirect URIs was EMPTY** under
   Facebook Login for Business → Settings. Added
   `https://adsproindia.com/api/public/auth/meta/callback` → validator now GREEN.
   NOTE: this is a DIFFERENT field from App settings → Advanced → "Authorize callback URL".
   Client OAuth login / Web OAuth login / Enforce HTTPS / Strict Mode = all Yes (correct).
3. App switched from Unpublished → **Published**.
4. Next error: `Invalid Scopes: leads_retrieval`. The "Create & manage ads" use case
   (MARKETING_API_ADS_MANAGEMENT) contains ads_management, ads_read, business_management
   — all "Ready for testing" — but NOT leads_retrieval, which needs its own lead-ads
   use case. Resolution: request only `ads_management,business_management` for now;
   add the lead-ads use case before App Review.

## OPEN BLOCKER — sign-in hangs

`/auth` sign-in hits the 15s timeout ("Sign in is taking too long"). Lovable added the
timeout from LOVABLE_PROMPT_4_AUTH_SESSION.md but did NOT fix the underlying hang.
No `sb-*` auth cookie is set on adsproindia.com — session is browser-storage only, which
also explains logout-on-refresh with SSR route guards. Root cause still unidentified.
This gates the OAuth test.

## Session 2 end state (2026-08-26)

WORKING: sign-in (cookie session via @supabase/ssr), Meta OAuth reaches the Facebook
dialog and returns to the callback. Scope now `ads_management,business_management`.

RESOLVED: token exchange failed because Lovable's secret store held a STALE
META_APP_SECRET (a second secret had been generated in Meta). Copying the verified
secret from .env into Lovable fixed it. Account status is now `active`.
Historical detail below kept for reference:
FAILING (was): token exchange — callback returned `reason=token_exchange`.
Prime suspect: `META_APP_SECRET` in Lovable's secret store may carry the same corruption
found in local .env (secret concatenated with META_VERIFY_TOKEN → 82 chars instead of 32).
Second suspect: `META_OAUTH_REDIRECT_URI` in Lovable not byte-matching the authorize step.
DEFINITIVE CHECK: Lovable server logs, filter `[meta-oauth]` — carries Meta's message /
code / error_subcode / fbtrace_id.

Note: Cloudflare 403s automated fetches of /assets/*.js, so deployed bundles cannot be
inspected from the CLI. Verify front-end changes by retrying in the browser instead.

## Session 3 (2026-08-26)

- Local `.env` STILL has empty `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` / `TOKEN_ENCRYPTION_KEY`. Until those are filled, DB state
  cannot be checked from the CLI — every verification has to round-trip through the
  Supabase SQL editor. Filling in the URL + service role key removes that round trip.
  (META values are clean: APP_ID 16, APP_SECRET 32, VERIFY_TOKEN 32 chars.)
- Wrote `VERIFY_ACCOUNT_ROW.sql` and `LOVABLE_PROMPT_5_INTEGRATION_PAGE.md`.
- Sequencing correction: key rotation is no longer free — see ACTION REQUIRED.

## Session 3 — OPEN BLOCKER: ad account picker broken

`/dashboard/select-ad-account` LOADS (tab title "Select Meta Account — AdsPro") but the
user cannot complete a selection; nothing persists. So the break is INSIDE the page, not
the route resolution. Note the earlier "missing <Outlet/> in dashboard.tsx" fix may have
been lost or was never the whole story — prompt 6 asks Lovable to confirm.

curl probe: `/dashboard` and `/dashboard/select-ad-account` both return byte-identical
6504-byte SPA shells. Inconclusive by design (client-rendered), NOT evidence of a routing
bug. Do not re-run this probe expecting signal.

RECURRING ROOT PATTERN across this whole app: failures are silent. Blank pages instead of
error states, empty lists instead of Meta's error body. Prompt 6 section 3 attacks this
directly and should be the template for every future page.

## Session 3 — dispatcher retry semantics (READ BEFORE WIRING CRON)

The two new dispatcher items above are a matched pair and must be fixed together:
events that keep failing are retried FOREVER (no cap), until they cross the 7-day floor,
at which point they vanish SILENTLY. Both halves are wrong in opposite directions.
Correct shape: bounded retries with backoff via `retry_count`, then a terminal
`abandoned` state that is VISIBLE in the deliveries table — never silent expiry.

Do not schedule the cron until this is resolved. Manual dispatch is safe meanwhile.

## Session 3 — still open

- `42883 decrypt_token(text) does not exist` UNRESOLVED. `VERIFY_ACCOUNT_ROW.sql` v2
  query 2 answers it. NOTE: a successful "Send test event" implicitly proves the decrypt
  path works, since that route must decrypt the token to call Meta.
- Ad account / dataset picker (`LOVABLE_PROMPT_6_FIX_SELECT_AD_ACCOUNT.md`) — status
  UNCONFIRMED. The Integration page hides the key and blocks the test event until the
  account is active WITH a dataset, so the picker gates everything downstream.
- Leaked Password Protection still disabled (Supabase dashboard toggle, known, unrelated).

## Session 3 — verified DB state (2026-08-26)

| Field | Value |
|---|---|
| account status | `active` |
| meta_ad_account_id | **(NONE)** <- BLOCKER |
| meta_dataset_id | **(NONE)** <- BLOCKER |
| token storage | ENCRYPTED, pgp_sym_encrypt, base64, prefix `ww0E` |
| token expires | 2026-10-25 12:06 UTC (~60d, healthy) |
| leads / status_events / capi_delivery_logs | 0 / 0 / 0 |

**CONFIRMED BLOCKER: the ad account + dataset picker has NEVER successfully written.**
Prompt 6 was either not applied or did not work. Everything downstream is gated on this:
the Integration page hides the webhook key and disables "Send test event" until the
account is active WITH a dataset. The Integration page is therefore currently inert.
Nothing else can be tested until `meta_dataset_id` is populated.

MINOR SECURITY: `encrypt_token`/`decrypt_token` are SECURITY DEFINER. Confirm each has an
explicit `SET search_path = ''` (or pinned schema). Without it, a mutable search_path on a
definer function is a privilege-escalation vector — Supabase's linter flags this as
"Function Search Path Mutable". Current session search_path is `"$user", public, extensions`.

## Session 3 — PRIME SUSPECT for the picker bug (silent ciphertext fallback)

Lovable reported, as an incidental audit fix: "token decryption failures no longer
silently use ciphertext". This is very likely THE root cause, not a side issue.

Mechanism: decrypt fails -> code passes the raw base64 PGP blob to Meta as the access
token -> Meta 401/190 -> ad account list returns empty -> picker renders blank/inert ->
nothing ever saved. Fits ALL observed evidence (status=active, token valid ~60d, BOTH
id columns NULL, page loads but does nothing).

Corroboration: the local reference file this app was built from contains the exact
antipattern at supabase/functions/capi-dispatcher/index.ts:42 —
  `// TODO: decrypt ... before use.`
  `const accessToken = account.meta_access_token_encrypted;`

NEXT TEST DISAMBIGUATES TWO CASES, and they need different remedies:
 (a) Picker now WORKS -> decryption was fine; the fallback was dormant and something
     else (route/save path) was fixed alongside. Done.
 (b) Picker now shows a DECRYPT ERROR -> the TOKEN_ENCRYPTION_KEY currently in Lovable
     does NOT match the key the stored token was encrypted with. Remedy is to reconnect
     Meta so the token is re-encrypted under the current key. This is a key MISMATCH
     diagnosis, NOT the key rotation Adarsh declined — do not conflate them.

Either way the silent fallback had to go: it converted a config error into a blank page,
which is the failure pattern that has cost this project the most time.

## Session 3 — PICKER FIXED & VERIFIED (2026-08-26)

Confirmed in the live UI: ad account list populates (7 accounts), dataset sub-picker
opens on select, save succeeds with toast "Ad account and dataset saved", dashboard
card renders the connection.

VERIFIED SAVED STATE:
| Field | Value |
|---|---|
| account name | Xento |
| status | active |
| meta_ad_account_id | `act_863995570089897` (Nevorai) |
| meta_dataset_id | `1293470716241461` ("Nevorai Pixel") |

Outcome was case (a) from the previous entry: decryption worked fine, the silent
ciphertext fallback was DORMANT, and the true fault was in the route/save path
(Integration link not passing account ID + the save mutation). The fallback removal was
still correct — it was a live landmine — but it was not the cause.

NOTE — dataset choice worth revisiting: the ad account also exposes a second dataset,
"Nevorai Event Data" (`1849245963151995`). For Conversion Leads optimization, CRM events
MUST land on the dataset actually attached to the lead ads being optimized. If the live
lead-ad campaigns fire on the other dataset, events go to the wrong place and Meta learns
nothing. Confirm in Events Manager which dataset the lead ads use before relying on this.

## Session 3 — MILESTONE: end-to-end pipe proven live (2026-08-26, 19:42 IST)

First successful real event through the full CAPI path, verified in the AdsPro UI:

| Field | Value |
|---|---|
| Status | Delivered, HTTP 200 |
| Meta response | `{"events_received": 1, "messages": [], "fbtrace_id": "AU_ivmS8sA7yfw5KHTJHI3V"}` |
| Event | `Lead_Qualified`, tagged `test` |
| Logged in | Recent Deliveries table, OK badge |
| Dataset | `1293470716241461` ("Nevorai Pixel"), test code `TEST47071` |

This is the first concrete proof that: token decryption works, the CAPI payload shape is
accepted by Meta, the dataset/account wiring is correct, and delivery logging works.
Effectively closes out "NOT BUILT — BACKEND: Connect Meta OAuth flow" as fully proven,
not just theoretically wired.

STILL TO CONFIRM: whether this event actually appears in Facebook's Test Events tab for
dataset 1293470716241461 with matching fbtrace_id — that proves it landed on the
dataset itself, not just that AdsPro's own log believes it sent something. Not yet
confirmed in this session.

This screencast moment (Integration page -> Send test event -> Meta's live response) is
exactly what App Review will want to see.

## Session 3 — dispatcher retry/backoff + UI polish DONE (Lovable, unverified in prod)

Reported built: capped exponential backoff 1m -> 5m -> 30m -> 2h -> 6h -> 24h, then
`abandoned` after 6 attempts; per-attempt delivery logs retained; 7-day silent drop
REMOVED; UI shows abandoned/retrying badges, token days-remaining + escalating expiry
banners, "Manage integration" link on the dashboard card, explanatory empty states on
Leads and Deliveries.

New columns: `status_events.dispatch_status` ('pending'|'delivered'|'abandoned') and
`status_events.next_attempt_at`.

### *** MIGRATION BACKFILL GAP — MUST RUN BEFORE SCHEDULING CRON ***

`dispatch_status` was added with `default 'pending'`, so EVERY pre-existing status_event
was backfilled as pending — including the successfully-delivered test event from 19:42.
The first cron tick would re-send it to Meta.

Fix: run `VERIFY_AND_BACKFILL_DISPATCH.sql` (Part A checks, Part B backfills any event
that already has a `capi_delivery_logs` row with `delivered_at is not null`).
This is a general rule for this app: any future default-valued status column added by
migration needs a backfill pass against existing rows, not just a default.

### Cron wiring — still NOT scheduled (correctly)

`GET/POST /api/public/cron/capi-dispatcher` exists and 401s without auth. Recommended
scheduler: Supabase `pg_cron` + `pg_net` calling the public URL with the auth header,
since it needs no new infra. BLOCKER: the exact auth header/secret name the route expects
is not recorded anywhere — get it from Lovable secrets or ask Lovable before writing the
cron job.

## Session 3 — dispatch state before cron (verified)

Two status_events exist, BOTH `is_test=true`, both on the reusable `adspro_test_lead`,
both sharing `event_id cd0ca5ba-e5a1-4809-8364-98e4040704a2`:

| id | created (UTC) | dispatch_status | delivery log? |
|---|---|---|---|
| 1bd8114c | 14:12:11 | delivered | yes, http 200 |
| 6dfc173b | 14:25:29 | pending | **none** |

Backfill was correct — no re-send risk from 1bd8114c.

OPEN QUESTION on 6dfc173b: a status_event exists with NO delivery log. Either (a) a
second Send-test-event click failed before reaching the logging step (silent-failure
pattern again), or (b) Lovable's Part 1 rework changed the test route from SYNCHRONOUS
delivery to enqueue-for-dispatcher. (b) would be a REGRESSION — the whole point of that
button is to show Meta's verbatim response immediately for the App Review screencast.
TEST: click Send test event once. JSON appears instantly = still synchronous, fine.
No JSON / "queued" = regression, must be fixed before App Review.

DECISION: keep 6dfc173b pending. It is a zero-risk live test of the new dispatcher
(shares a deduped event_id, so Meta discards the duplicate). Manually invoke the
dispatcher ONCE and confirm it flips pending -> delivered and writes a log row. Only
schedule the cron after that passes.

NOTE — Meta dedup: the reusable test lead has a STABLE event_id, so repeated test events
within 48h are deduped by Meta. `events_received: 1` on a repeat click does NOT mean Meta
counted it again. Do not read repeated successes as repeated deliveries.

## Session 3 — cron scheduled, PUBLISH REQUIRED before it does anything

`pg_cron` + `pg_net` live: jobid 1, `*/2 * * * *`, `select public.run_capi_dispatcher();`.
Secret read from Vault (`CAPI_CRON_SECRET`), never in the migration. Concurrency guard is
`public.claim_due_status_events(p_limit)` using `FOR UPDATE SKIP LOCKED` (not an advisory
lock — correctly reasoned: PostgREST uses pooled connections, so a session-level lock
wouldn't reliably release).

*** GAP: Lovable's own report flags that the PUBLISHED route on adsproindia.com still
only checks `LOVABLE_CRON_SECRET` and lacks the claim guard — i.e. the schedule above is
ticking every 2 min against OLD code. The reported successful delivery of orphan
6dfc173b was almost certainly against Lovable's preview build, not production. Likely
same preview-vs-published split that caused the ad-account-picker confusion earlier this
session. UNTIL PUBLISHED, every cron tick against adsproindia.com is presumed 401ing
harmlessly (secret mismatch) — safe, but non-functional.

NEXT ACTION: publish, then verify with a query for a capi_delivery_logs row with
delivered_at newer than the publish time, on a ~2-minute cadence, without any manual
click. That is the actual proof the scheduled path works end to end (not a manual test).

## Session 3 — cron IS firing, dispatch success still UNCONFIRMED

`cron.job_run_details` shows jobid 1 ticking exactly every 2 min (14:42/44/46/48/50 UTC),
status=succeeded every time, zero drift. The pg_cron layer works.

BUT: "succeeded" is not proof of a working dispatch. `run_capi_dispatcher()` wraps its
HTTP call in `exception when others then raise log` (correct design so failed Meta calls
never kill the schedule) — side effect: pg_cron reports success even when the inner HTTP
call 401s. A `contacted` status was set via the Leads page at ~14:47 UTC; 2+ ticks have
passed since (14:48, 14:50) with NO new capi_delivery_logs row. Strongly consistent with
the previously-flagged publish gap (production still serving pre-Part-1 code / old secret
name) still being unresolved.

NEXT: check the actual pg_net HTTP response (status code, body) for the last few calls —
this is the only way to see past the exception handler. Query targets
`extensions._http_response` per Lovable's report that pg_net was moved to the extensions
schema; fall back to `net._http_response` if that errors.

## Session 3 — ROOT CAUSE NARROWED: net.http_post likely never called

`net._http_response` (confirmed correct location — `extensions._http_response` does not
exist) returns 0 rows despite 5 confirmed successful cron ticks (14:42-14:50 UTC) since
the migration. This is a stronger signal than a 401: it means `net.http_post()` is very
likely never being invoked. Something inside `run_capi_dispatcher()` — most likely the
Vault secret read (`vault.decrypted_secrets`, name `CAPI_CRON_SECRET`) — is throwing
BEFORE reaching the HTTP call, and the blanket `exception when others then raise log`
swallows it, which is why pg_cron still shows status=succeeded.

A `contacted` status_event was set via the Leads page ~14:47 UTC specifically as a
zero-risk live probe; still undelivered after 3+ ticks.

NEXT: the real error is in Postgres logs (the `raise log` line), not queryable from the
SQL editor here — needs Lovable/Supabase Logs access. Prompt 9 asks Lovable to pull it.

## Session 3 — DISPATCHER FULLY FIXED & VERIFIED UNATTENDED (2026-08-26)

Root cause (Lovable, quoted from Postgres logs): the migration called
`extensions.http_post(...)`, but pg_net's actual functions/tables live in schema `net`
(`net.http_post`, `net._http_response`) despite the extension's catalog entry showing
`extnamespace=extensions`. Every tick hit `42883 function extensions.http_post does not
exist` BEFORE building any request, swallowed by `exception when others`, which is why
pg_cron showed `succeeded` while `net._http_response` stayed at 0 rows. Vault read and
`claim_due_status_events()` were both fine — ruled out correctly.

Fix: call `net.http_post` directly, `search_path` includes `net`, and the exception
handler now logs `step`, `sqlstate`, `sqlerrm`, and the queued `request_id` — this class
of failure is now diagnosable from logs alone, no more multi-round SQL archaeology.

PROOF (unattended, no UI click): tick `15:02:00.033+00` → `net._http_response`
status_code=200 → `status_events 0dcd9a33...` (`contacted`) flipped to `dispatch_status=
delivered`. Visible in Deliveries UI as the `Lead_Contacted` row, 8:32:02 PM.

**The full pipe — OAuth connect, ad account/dataset picker, token encryption, manual
test-event, retry/backoff, abandoned-state, scheduled dispatch — is now proven working
end to end, unattended.** This was the last open backend correctness question.

Also flagged, not yet done: Supabase leaked-password-protection toggle still off
(Auth settings, dashboard-only, known since Session 2).

## Session 3 — SEQUENCING DECISION (Adarsh, 2026-08-26)

**Finish the core single-tenant product completely first. Multi-tenant/agency-mode UI
(one login managing several ad accounts — own + N client accounts, needed for Metrol
Media) is explicitly deferred until the core product works end to end.** Do not build
agency-mode UI before this bar is met, even though Metrol Media (see below) would
benefit from it — that work stays in DEFERRED — PHASE 2 until Adarsh reopens it.

Context: Metrol Media (Adarsh's employer) is a REAL requester, not a hypothesis — a
marketer there directly asked him to build this, and Metrol Media runs Meta ads both for
themselves and for their own clients. This is now the closest thing AdsPro has to a
validated anchor customer. Full context saved to auto-memory
(`project_adspro.md`) since it's cross-session context, not repo state.

**Biggest remaining gap toward "core product complete":** the pipe has only been proven
in one direction — status OUT to Meta via CAPI. Real leads flowing IN from Meta's own
Lead Ads (the Page's `leadgen` webhook field) has never been configured or tested. The
webhook route itself is verified live (correct token -> 200 + echoes hub.challenge), but
nothing has subscribed a real Page to it yet. A lead-quality-sync product isn't complete
if the "lead" half of the loop has never actually run.

## Session 4 (2026-08-27) — inbound leads: the `leads_retrieval` workaround

KEY FINDING: the inbound half is NOT blocked by the missing `leads_retrieval` scope,
contrary to how it looked. Meta's leadgen webhook only ever delivers IDENTIFIERS
(`leadgen_id`, `page_id`, `form_id`, `ad_id`, `created_time`) — never field data.
Fetching name/email/phone needs `GET /{leadgen_id}` + `leads_retrieval`.

BUT Meta's CAPI accepts `user_data.lead_id` (the leadgen_id) as a first-class — in fact
PREFERRED — match key for lead-ads conversions. So the full loop works today WITHOUT
`leads_retrieval`, storing only IDs and no PII. PII enrichment becomes a purely additive
step after App Review, not a rewrite.

CONSEQUENCE for users: with no PII stored, `POST /webhooks/status` can only match on
`leadgen_id`, so CRMs must send that as `lead_reference` (phone/email matching will 404).
Integration page docs must say this plainly. Revisit once `leads_retrieval` is approved.

SECURITY GAP being closed in prompt 10: the leadgen POST endpoint is public and had no
`X-Hub-Signature-256` HMAC verification specified. Anyone could POST fake leads.

Also needed: `accounts.meta_page_id`, since the webhook is app-level and must be mapped
to an account.

## Session 4 — design principles for the future analytics/AI-advisor layer

Recorded now so they survive to whenever this gets built. NOT approved for build —
Adarsh's standing sequencing decision is core product first.

1. **SQL decides, LLM narrates.** Never let an LLM compute rankings, costs, or
   comparisons — that is a SQL query: exact, reproducible, auditable. The LLM's job is
   explaining WHY and spotting qualitative patterns across creatives. Matches Adarsh's
   own Nev AI rule: "numbers always tool-sourced".
2. **Meta's numbers are not stable over time.** Attribution windows retroactively revise
   spend/conversions. Snapshot every pull with a timestamp + the attribution window used,
   and display both, or "your dashboard disagrees with Ads Manager" becomes the #1
   support complaint. This is how you deliver Adarsh's "2+2=4" accuracy standard against
   data you do not control.
3. **Sample size is the real constraint, worse for outcome-ranking than CPL-ranking.**
   Ranking creatives by cost-per-QUALIFIED-lead needs far more volume than ranking by
   cost-per-lead. At ~Rs 150/day across 100 creatives the data is meaningless. Campaign-
   and audience-level insight will have enough data long before creative-level does.
   Metrol Media's client accounts (real budgets) are where creative-level analysis first
   becomes viable. Always show confidence/sample size, never a confident number on n=3.
4. **The real moat is the outcome data, not the dashboard.** Competitors (Madgicx,
   Revealbot, Motion, Atria, AdEspresso, Smartly) rank creatives by Meta's own metrics
   because form-fills are all they have. AdsPro knows who actually closed. Lead with
   that, never with "nicer UI than Ads Manager".
5. **Auto-actioning: recommend → one-click apply → true automation behind opt-in.**
   Never auto-pause a client's ads on early logic. Requires minimum-spend and
   minimum-conversion thresholds, full audit log, one-click undo.

## Session 4 — INBOUND leadgen webhook BUILT (code complete, NOT yet exercised)

Lovable delivered all of prompt 10:
- **Signature verification**: HMAC-SHA256 of raw body vs `X-Hub-Signature-256`,
  timing-safe compare, hard 401 if `META_APP_SECRET` missing (no silent skip). Tested:
  forged sig -> 401 `invalid_signature`; valid -> 200.
- **page_id -> account**: new `accounts.meta_page_id` + partial index, "Facebook Page ID"
  card on Integration page (numeric-validated, owner-checked server fn). Webhook maps
  `changes[].value.page_id` with fallback to `entry.id`. Unmatched leads log loudly with
  leadgen/ad/form IDs and return 200, never 500 (correct — a 500 makes Meta retry then
  disable the subscription).
- **Dedupe**: verified live — re-delivery logs "duplicate delivery ignored", no second
  row. Existence check + `23505` no-op handling (the partial unique index couldn't back
  `ON CONFLICT`). Batched `entry[]`/`changes[]` arrays handled.
- **CAPI `lead_id`**: already correct — `meta.server.ts` sets
  `user_data.lead_id = lead.meta_leadgen_id`.
- **Docs**: Integration page now states plainly that `lead_reference` must be the Meta
  `leadgen_id` (phone/email 404s until `leads_retrieval`). Leads page has an Ad column and
  split empty states ("no leads yet — connect your Page" vs "no leads matched yet").

Leads store `leadgen_id`/`ad_id`/`campaign_id`/`form_id` with NULL PII, so future
`leads_retrieval` approval is pure enrichment on the same row, not a rewrite.

### *** STILL UNEXERCISED — no real lead has entered the system ***
Code is done; the pipe has never carried a real lead. Remaining steps are all MANUAL
(Adarsh, in Meta's UI — not buildable):
1. Save the Facebook Page ID in the new Integration card
2. Subscribe that Page to the `leadgen` field in Meta App Dashboard -> Webhooks
3. Submit a real lead via Meta's Lead Ads Testing Tool
4. Confirm it lands in Leads WITH ad/campaign IDs

### IMPORTANT for ANALYTICS_ROADMAP Phase A/B
Meta only sends `campaign_id` on SOME leadgen payloads — `ad_id` is the reliable one.
Therefore **Phase B must derive campaign from `ad_id` via the synced `ad_entities`
hierarchy, NOT from `leads.campaign_id`**, which will be sparsely populated. This makes
the Phase A hierarchy table load-bearing rather than merely convenient. Backfill of
historic campaign attribution is possible from `ad_id` once the hierarchy exists.

## Session 5 (2026-08-27) — verification unblocked + inbound runbook ready

### *** BIGGEST WIN: Claude can now query the DB directly ***

`supabase db query --linked "<sql>"` (and `-f file.sql`) works with the existing CLI auth.
CLI v2.101.0, AdsPro shows LINKED. **The empty `.env` Supabase keys are NO LONGER a
blocker for verification** — the dashboard round-trip loop that burned money in sessions
3-4 is gone. `.env` keys are still only needed if something must run the app locally.

Note: the global `--output` flag shadows `db query`'s own `-o`, so `csv` is rejected.
Use default output (JSON) and parse it. `json` happens to be valid for both flags.

### Live verification, 2026-08-27 05:45 UTC — everything healthy

| Check | Result |
|---|---|
| cron jobid 1 | `*/2 * * * *`, active, ticking with zero drift |
| dispatcher HTTP | 200, body `{"processed":0,"abandoned":0,"results":[]}` |
| status_events | 4 total, ALL `delivered` — no pending, no abandoned backlog |
| capi_delivery_logs | 4 rows, all HTTP 200 |
| account Xento | active, `act_863995570089897`, dataset `1293470716241461` |
| token | prefix `ww0E` (encrypted), expires 2026-10-25 — healthy |
| `accounts.meta_page_id` | column EXISTS, value **NULL** <- the only blocker |
| leads | 1, the manual test lead, `is_test=true` |

Postgres functions all present with PINNED search_path — the Session 3 "Function Search
Path Mutable" security concern is RESOLVED:
`run_capi_dispatcher` (public,net,vault), `claim_due_status_events` (public),
`encrypt_token`/`decrypt_token` (public,extensions), `rls_auto_enable` (pg_catalog).

### Prompt 10 IS published to production (not just preview)

Probed live against adsproindia.com:
- GET + correct verify token -> 200, echoes `hub.challenge`
- GET + wrong token -> 403
- **POST unsigned -> 401 `invalid_signature`**

That third probe is the important one: HMAC verification is running in PRODUCTION. The
preview-vs-published split that caused earlier confusion did not bite this time.

### Pages pulled live from Meta (for the Page ID step)

| Page | page_id |
|---|---|
| Kaizen | `103144134846357` |
| EduEarn.in | `404251806108429` |
| Learnwadarsh Connected Page | `826525770539148` |
| Nevorai | `1126670470531846` |
| Xento | `1338642339324209` |
| ADARSH CHATURVEDI | `2272333342988759` |

Could NOT verify `leadgen_tos_accepted` — the Meta Ads MCP refuses ad account
863995570089897 ("not enabled for the Ads MCP", gradual rollout). Check ToS manually if
the Page has never run a lead ad.

### New files

- `INBOUND_LEADGEN_RUNBOOK.md` — the 6 manual Meta steps, exact values, failure table
- `VERIFY_INBOUND_LEAD.sql` — single-result-set inbound check (22 rows, runnable via CLI)

### *** EXPECTATION CORRECTION: the Lead Ads Testing Tool will NOT populate ad_id ***

Previously the plan said "confirm it lands in Leads WITH ad/campaign IDs populated".
That bar is wrong for the testing tool. A lead created by Meta's Lead Ads Testing Tool was
never served by a real ad, so `ad_id` comes through as `0`/absent and `campaign_id`
almost always absent. This is correct Meta behaviour, NOT an AdsPro bug.

The testing tool proves: signature verification, `page_id`->account mapping, dedupe, and
row insertion. Ad attribution is ONLY ever proven by a real lead from a live ad.
Do not chase an empty `ad_id` on the test lead.

This reinforces the existing Phase A/B note: derive campaign from `ad_id` via the synced
`ad_entities` hierarchy, and expect `ad_id` itself to be absent on any non-ad-served lead.

### The step most likely to be skipped

App-level webhook subscription (App Dashboard -> Webhooks -> Page -> `leadgen`) delivers
NOTHING on its own. Each Page must ALSO be subscribed via
`POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` using a **PAGE** access token
(not a user token) in Graph API Explorer, with `pages_show_list` + `pages_manage_metadata`.
Verify with `GET /{page-id}/subscribed_apps` — `data: []` means it did not take.
This does not touch AdsPro's stored OAuth token or scopes.

## Session 5 — CORRECTION: `leads_retrieval` IS required to SUBSCRIBE to leadgen

Hit live in Graph API Explorer, 2026-08-27, on
`POST 1126670470531846/subscribed_apps?subscribed_fields=leadgen`:

```
(#200) To subscribe to the leadgen field, one of these permissions is needed: ...
type: OAuthException, code: 200, fbtrace_id: AcS_EISBrZ-6p-Ps5QWLN3E
```

**The Session 4 finding was half right and half wrong.**

RIGHT: `leads_retrieval` is not needed to READ lead data. The webhook delivers only
identifiers, and CAPI accepts `user_data.lead_id` as the preferred match key. Storing
IDs with NULL PII remains correct, and PII enrichment stays purely additive.

WRONG: the claim that the inbound half is "NOT blocked by the missing leads_retrieval
scope". Subscribing a Page to the `leadgen` webhook FIELD is itself gated on
`leads_retrieval`. It is a subscription-time gate, separate from the data-read gate.

Consequence: `leads_retrieval` moves from "needed before App Review" to "needed NOW,
before a single lead can arrive". For Adarsh's own Page, adding it to the app
(status "Ready for testing") should suffice without App Review — same as
`pages_manage_metadata`, which went to "Ready for testing" immediately on being added.
App Review is still required later to use it on OTHER businesses' Pages.

## Session 5 — Meta permission chain, as actually discovered (in order)

Recording the real dependency chain, because it was not obvious from the docs and cost
a long session to walk:

1. App-level webhook: App Dashboard -> Use cases -> Customize -> Webhooks -> object
   **Page** (NOT User — the User object's field list has `about`/`birthday`/`books` and
   will never show `leadgen`). Callback + verify token -> Verify and save. CONFIRMED
   working; button greys out and token masks once saved.
2. Subscribe the `leadgen` field on that Page object.
3. `pages_manage_metadata` — NOT in the "Create & manage ads" use case. Required
   adding the **"Manage everything on your Page"** use case
   (Add use cases -> filter **Content management (6)**). Went straight to
   "Ready for testing" on add. `pages_manage_ads` is NOT a substitute.
4. `leads_retrieval` — needed for step 5. Also not in "Create & manage ads".
5. `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with a **PAGE** access
   token (not a User token) in Graph API Explorer.

UI gotchas paid for:
- The dashboard URL path is `use_cases` with an UNDERSCORE. `use-cases` 404s/loops.
- The breadcrumb "Use cases" link from a Customize sub-tab can loop back to the same
  page. Navigate directly to
  `https://developers.facebook.com/apps/1771096100977376/use_cases/`
- The "Permissions and features" list has NO search box — it is one long alphabetical
  list, and only shows permissions belonging to the SELECTED use case.
- Explorer's permission box is narrow enough to hide the leading character of a typed
  permission; type 3-4 letters and PICK FROM THE DROPDOWN instead of typing in full.
- After adding a use case, REFRESH the Explorer — it caches the old permission list.

## Session 5 — confirmed Page identity

ONE Nevorai Page. `1126670470531846` is the Page ID used by Ads Manager, the Graph API,
and the leadgen webhook. `61590241615463` is the same Page's `profile.php?id=` address,
NOT a second Page and NOT usable as an API Page ID.

Also: AdsPro is wired to ad account `863995570089897` (Nevorai business portfolio).
Ads Manager was observed open on `1511960912389401` ("Other assets", no ads yet).
Build the lead ad in `863995570089897` or the data will not line up.

## Session 5 — *** MILESTONE: INBOUND PROVEN. CORE PRODUCT COMPLETE. *** (2026-08-27)

First real Meta-originated lead received, 07:00:22 UTC (12:30 IST):

| Field | Value |
|---|---|
| `meta_leadgen_id` | `1862460961805586` |
| `form_id` | `1574223744177261` ("AdsPro Test Form", Nevorai Page) |
| account | Xento — resolved via `meta_page_id` = 1126670470531846 |
| `is_test` | **false** |
| `ad_id` / `campaign_id` | NULL — CORRECT for a Lead Ads Testing Tool lead |
| `raw_field_data` | present |

Proves in one row: HMAC signature verification passes on a genuine Meta-signed request,
`page_id` -> account mapping resolves, and the lead row is written with its real
leadgen_id. Combined with the already-proven outbound CAPI path (OAuth, encryption,
retry/backoff, abandoned state, unattended pg_cron dispatch), **both halves of the loop
now work end to end.**

### THE ACTUAL ROOT CAUSE of the first failed test

Configuring the Page webhook (callback URL + verify token -> "Verify and save") does NOT
subscribe anything. The `leadgen` FIELD toggle in that same page's field list is a
separate action and is what actually turns delivery on. Saving the callback greys out the
button and masks the token, which LOOKS complete — it is not.

Meta's own Lead Ads Testing Tool diagnostic said so plainly ("App is not subscribed to
leadgen field"); it was assumed stale and was in fact correct. Lesson: trust that
diagnostic panel.

Confirmation of success looks like a toast: "Successfully subscribed to the leadgen
v26.0 webhook field".

### Also confirmed harmless

`Lead Access Manager Enabled` shows a warning triangle and did NOT block webhook
delivery. It governs who may RETRIEVE lead field data (CRM access), which AdsPro does not
do. It will matter only when `leads_retrieval` enrichment is built.

### Testing tool constraints worth remembering

- One test lead per form. Must click **Delete lead** before **Create lead** again.
- A form must exist and be **Active** (published), not a draft.

### Remaining to close the loop fully

Set that lead to Qualified in the Leads UI, wait <=2 min for the pg_cron dispatcher,
confirm a `capi_delivery_logs` row with HTTP 200. That exercises inbound -> outbound on a
REAL Meta lead for the first time.

## *** 2026-08-27 — CORE PRODUCT COMPLETE. FULL LOOP PROVEN ON A REAL META LEAD. ***

| Time (UTC) | Event |
|---|---|
| 07:00:22 | Meta leadgen webhook delivered lead `1862460961805586` -> `leads` row, account Xento |
| ~07:02 | Status set to `qualified` in the Leads UI (one human click) |
| 07:04:01 | pg_cron dispatcher sent `Lead_Qualified` to Meta CAPI — **HTTP 200** |

Meta's verbatim response:
`{"messages": [], "fbtrace_id": "AEAz8UKkZ52gGoEgIAlCkmZ", "events_received": 1}`

`events_received: 1` — accepted, not merely received by our own logger.

**Both halves of the product now work end to end, unattended, on a genuine
Meta-originated lead.** Everything between the webhook and the CAPI delivery ran without
human involvement. This is the thing AdsPro exists to do.

Proven components: Meta OAuth + encrypted token storage; ad account/dataset picker;
inbound leadgen webhook with HMAC verification, page_id->account mapping and dedupe;
manual + CRM status entry; retry/backoff with terminal `abandoned` state; pg_cron/pg_net
dispatcher; delivery logging with Meta's verbatim response.

### Next phase

ANALYTICS_ROADMAP Phase A (metrics warehouse + Meta Insights sync). Per BUILD_DIVISION
this is ~100% Postgres/SQL — no Lovable credits. `ads_read` is already "Ready for
testing", confirmed in the app dashboard.

Prerequisite unchanged and still real: Phase A needs live campaigns with real spend and
statuses accumulating for 2-4 weeks. The analytics layer is a lens; there is nothing to
look at yet. Build the hierarchy/sync now if desired, but expect empty tables until real
ads run.

### Still open (unchanged, none blocking)

- Supabase leaked-password protection toggle (dashboard-only, Auth settings)
- Tech Provider status — needed to access OTHER businesses' ad accounts
- App Review for `ads_management` + `leads_retrieval` — needs a screencast; both are
  "Ready for testing" today, which covers Adarsh's own assets only
- Agency/multi-account UI — deliberately deferred (Adarsh's standing decision)
- `TOKEN_ENCRYPTION_KEY` rotation — declined by Adarsh, revisit before public launch

## Session 5 — PAGE AUTO-CONNECT SHIPPED & VERIFIED IN PRODUCTION (2026-08-27)

The last per-client manual step is gone. Connecting a customer's Facebook Page no longer
requires an admin running `POST /{page-id}/subscribed_apps` by hand in Graph API Explorer.

**Verified on adsproindia.com (production, not preview), DB-confirmed:**
```
accounts    page_subscribe_status=subscribed  meta_page_id=1126670470531846  error=none
meta_pages  subscribe_status=subscribed       1126670470531846 (Nevorai)     error=none
```

UI: Integration -> "Facebook Page" card -> Load my Pages -> dropdown -> Connect -> green
"Connected — leads from this Page will arrive automatically". Manual Page ID text box and
`saveMetaPageId` deleted.

### Claude built (SQL only, zero Lovable credits)
- `meta_pages` table + RLS (owner-scoped SELECT; no write policy — service-role only,
  same shape as `status_events`)
- `accounts.page_subscribe_status` / `page_subscribe_error` / `page_subscribed_at`
- Migration `supabase/migrations/0002_page_autoconnect_and_cron_url.sql`
  (applied via `db query --linked`, NOT `db push` — the CLI migration ledger is not
  authoritative here since Lovable applied its own equivalent of 0001)

### Lovable built (prompt 11)
OAuth scope widened to
`ads_management,business_management,pages_show_list,pages_manage_metadata,leads_retrieval`;
`POST /api/public/pages/refresh`; `POST /api/public/pages/connect`; the Page card; the
dashboard status line. Page access tokens are used in-request and never persisted.

**Key design rule enforced:** on subscribe failure the route stores Meta's verbatim error
and does NOT write `meta_page_id`. A saved page id with a dead subscription looks
connected and delivers nothing — the exact silent-failure trap that has cost this project
the most time.

## *** Session 5 — PRODUCTION RISK FOUND AND FIXED: cron pointed at a PREVIEW URL ***

`run_capi_dispatcher()` was calling
`https://project--b1df633d-19d0-434f-8ae6-a97ea799daff.lovable.app/api/public/cron/capi-dispatcher`
— a Lovable PREVIEW domain — in production. It worked, and it is what delivered the first
real lead. But if that preview environment is ever rebuilt or torn down, every lead
outcome silently stops syncing while `pg_cron` keeps reporting `succeeded`, because the
function's `exception when others` handler swallows the failure.

Probed production first (2026-08-27 07:16:32Z): adsproindia.com accepts the same
`CAPI_CRON_SECRET` and returns `{"processed":0,"abandoned":0,"results":[]}`. Then switched
the URL. Verified `PRODUCTION ✓`.

**Standing rule for this app: never leave a `*.lovable.app` URL in a production Postgres
function, cron job, or webhook. Grep for it before every launch.**

## Session 5 — where things stand

CORE PRODUCT: complete and proven both directions on a real Meta lead.
PER-CLIENT MANUAL WORK: none remaining in AdsPro itself.
NEXT GATE: App Review (submission started 2026-08-27, `submission_id=1773424157411237`).
Verification step green; App settings in progress; Allowed usage / Data handling /
Reviewer instructions still to do. Privacy policy URL, category "Business and pages" and
primary contact are filled.

Reviewers test adsproindia.com, so production must always be published BEFORE submitting.
Justification text is in `META_APP_REVIEW_JUSTIFICATION.md`.

AFTER App Review: Tech Provider status (needed for other businesses' ad accounts), then
ANALYTICS_ROADMAP Phase A once real campaigns have run 2-4 weeks.

## Session 6 (2026-08-27) — PROMPT 13 VERIFIED IN PRODUCTION + reviewer instructions written

### Prompt 13 is genuinely live on adsproindia.com (not preview)

Verified two ways, without taking Lovable's report on trust:

- `POST /api/public/account/disconnect-meta` -> **401** unauthed
- `POST /api/public/account/delete` -> **401** unauthed
- `POST /api/public/bogus-xyz` -> **404**

The 404 control is what makes the two 401s meaningful: unknown API routes really do
404 in production, so a 401 proves the route exists and is auth-guarded.

Then read the live Settings page in an authenticated browser session. Exact strings a
reviewer will see:

| Surface | Verbatim |
|---|---|
| Sidebar | Dashboard / Leads / Deliveries / Integration / Settings |
| Section 1 | "Your account" — Email, Account name, "Sign out" |
| Section 2 | "Meta connection" — "Disconnecting is reversible — your lead history is never affected." button "Disconnect Meta" |
| Section 3 | "Danger zone" — field "Type DELETE to confirm", button "Delete my account and all data" |

The delete button does **not** appear in the accessibility tree while disabled —
independent confirmation of prompt 13 definition-of-done item 5.

`/data-deletion` matches the UI word for word. Both paths (disconnect-only and
delete-everything) name the exact nav item, heading and button label.

### Route gotcha worth recording

Leads and Deliveries are **top-level** routes — `/leads` and `/deliveries`, NOT
`/dashboard/leads`. Only Integration and Settings live under `/dashboard/`.
`/dashboard/<anything>` returns 307 whether the route exists or not, so a 307 there
proves nothing. Use the API-route 401-vs-404 test instead.

### Page card labels (prompt 12 shipped, differs from prompt 11's spec)

There is no "Load my Pages" button any more. Connected state shows the Page, the
subscribe timestamp and a "Change Page" button; clicking it reveals a populated
dropdown "Choose the Page your lead ads run from", a "Just created a new Page?
Refresh list" link, and "Switch Page" / "Cancel". Verified by opening the picker and
cancelling — Nevorai (1126670470531846) still subscribed, nothing changed.

### DB state confirms the leads_retrieval story

`leads` row `1862460961805586`: `phone_hash` NULL, `email_hash` NULL, `raw_field_data`
holds only the webhook envelope. **AdsPro stores zero lead PII today.** The Leads table
has no name/email/phone column — Created / Leadgen ID / Campaign / Ad / Current status /
Set status.

Good for the Data Handling section. A liability for the `leads_retrieval` screencast:
a reviewer opens Leads expecting retrieved lead data and sees identifiers only.

### New file: `META_APP_REVIEW_REVIEWER_INSTRUCTIONS.md`

Copy-paste-ready reviewer instructions for both permissions, screencast shot list,
pre-submit checklist. Three decisions flagged there and still OPEN:

1. **Reviewer test login does not exist.** Must create one via Sign up. Do NOT hand
   over `teamnevorai@gmail.com` — a reviewer following the steps literally reaches
   the Danger zone.
2. **`leads_retrieval` rejection risk.** Recommendation: one more Lovable prompt to
   call `GET /{leadgen_id}?fields=field_data`, show the lead's NAME in the Leads
   table, keep phone/email hashed. Buildable today — the permission is already
   "Ready for testing" on Adarsh's own Page.
3. **Submission may be too narrow.** `pages_show_list`, `pages_manage_metadata` and
   `business_management` also need Advanced Access or Page auto-connect will not work
   for any other business. Submitting two permissions likely means a second round.

### Not verified

The OAuth button label and the first-ever-connect Page button label — the live account
is already connected, so neither disconnected state is reachable without disconnecting
production. Confirm both on the new reviewer account.

### Session 6 — the two unverified labels, resolved from the reviewer test account

Adarsh created the reviewer account and sent screenshots of the disconnected state.
Both guesses in the first draft of the reviewer instructions were WRONG and would
very likely have failed review:

| Assumed | Actual |
|---|---|
| Connect Meta lives on the Integration page | It lives on the **Dashboard** |
| Connect Meta is a single click | A **required "Workspace name (e.g. Acme Solar)" text field** must be filled first |

Disconnected-state ground truth:

- **Dashboard** — card "Connect Meta", body "Create your workspace and connect your
  Meta ad account to start syncing lead outcomes.", text field
  `Workspace name (e.g. Acme Solar)`, primary button **"Connect Meta"**.
- **Integration** — card "Connect your Meta ad account first", body "Connect your Meta
  ad account and choose a dataset first. Your webhook key stays hidden until then.",
  secondary button **"Choose ad account & dataset"**. The Facebook Page card is NOT
  rendered at all until an ad account + dataset exist.

So the real onboarding order is:
Dashboard -> workspace name -> Connect Meta (OAuth) -> ad account + dataset ->
Page card appears on Integration -> subscribe Page -> leads arrive.

`meta-review-paste/PASTE-1-ads_management.txt` and `PASTE-2-leads_retrieval.txt`
rewritten to match. **Still unconfirmed:** where the OAuth callback lands the user —
straight onto the ad-account picker (`/dashboard/select-ad-account` exists) or back on
the Dashboard. Both files hedge this ("if you are not taken there automatically...").
Confirm while filming the screencast and tighten the wording if it always auto-lands.

LESSON: two of two guessed UI labels were wrong. For anything a Meta reviewer follows
literally, read the actual screen in the actual state — never infer from the Lovable
prompt that specified it.

## Session 6 — HOW META'S APP REVIEW ACTUALLY WORKS (use-case model, not permission list)

The mental model in every earlier session was wrong. You do NOT submit permissions
directly. Meta's flow is:

    Use case  ->  permissions/features inside it  ->  "Add to App Review"  ->  submission

AdsPro has **three** use cases, and the permissions it needs are spread across all three:

| Use case | Holds |
|---|---|
| Create & manage ads | Marketing API Access Tier, `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_manage_ads`, `pages_read_engagement`, `public_profile`, catalog_management, email, threads_business_basic |
| Manage Pages | `pages_manage_metadata` (expected) |
| Capture & manage ad leads | `leads_retrieval` (expected) |

That is why submission `1773424157411237` contained exactly ONE line —
"Marketing API Access Tier". Everything else was never added.

### Status vocabulary (this is the bit that matters)

- **"Ready for testing"** = the permission works, but only on assets owned by someone with
  a role on the app. This is what Adarsh has today on `ads_management`, `ads_read`,
  `business_management`, `pages_show_list`, `pages_manage_ads`, `pages_read_engagement`,
  `public_profile`. It is NOT App Review approval.
- **"Limited access"** = current Marketing API tier, pre-upgrade.
- Advanced Access — what actually lets AdsPro touch a CLIENT's ad account and Page — is
  only granted by App Review.

### The mechanic

Use cases -> Customize -> pick the use case in the top-left dropdown -> find the row ->
**Actions v** -> **"+ Add to App Review"**. The second menu item is a greyed-out trash
option reading "Required for use case", so the menu is safe.

URL pattern:
`developers.facebook.com/apps/1771096100977376/use_cases/customize/?business_id=795618596158696&use_case_enum=<ENUM>`
(`MARKETING_API_ADS_MANAGEMENT` is the Create & manage ads one.)

### The six to request — and the ones to deliberately skip

REQUEST: Marketing API Access Tier (done), `ads_management`, `business_management`,
`pages_show_list`, `pages_manage_metadata`, `leads_retrieval`.

SKIP: `ads_read`, `pages_manage_ads`, `pages_read_engagement`, `catalog_management`,
`email`, `threads_business_basic`, Business Asset User Profile Access. None are in the
app's OAuth scope string, and Meta rejects permissions it cannot observe being used.
`ads_read` is the only tempting one (analytics Phase A) — skip it anyway; Marketing API
Access Tier's own description says `ads_read` OR `ads_management` satisfies it, and
Phase A has no live campaigns to read yet. Add it in a later round when Insights sync
actually exists.

### Consequence for the reviewer-instruction text

The per-permission instruction boxes only appear AFTER the permissions are added to the
submission. `meta-review-paste/PASTE-1` and `PASTE-2` are still correct in wording; they
just attach later in the flow than assumed. Expect a box per request, so the same test
login and steps may need pasting into several boxes, not two.

### Session 6 — CORRECTION: Meta enforces permission DEPENDENCIES

I advised removing `pages_read_engagement` because AdsPro never calls it. Meta's Allowed
usage step then blocked `ads_management` with:

    "Your submission must include pages_read_engagement to use ads_management"

...and greyed out its "Get started" button. The dependency is enforced regardless of
whether the app uses the permission. `pages_read_engagement` had to be added back.

`pages_manage_metadata` has the same shape of dependency on `pages_show_list` — already
satisfied, shows a green tick.

`ads_read` and `pages_manage_ads` were NOT flagged as dependencies and stay out.

LESSON: check each permission's dependency line on the Allowed usage step BEFORE pruning
a submission. "The app doesn't call it" is not sufficient grounds for removal.

### Where the justification text actually goes

Allowed usage renders ONE CARD PER PERMISSION. Each card's "Get started" opens a modal
titled "Tell us why you're requesting <permission>" containing:
- a free-text box ("how your app uses the permission, how it adds value, why necessary")
- a screencast drag-and-drop (only on some permissions)
- an API-test-call status line (only on some)
- an "I agree that any data I receive... will be used in accordance with the allowed
  usage" checkbox

So the deliverable is SEVEN separate descriptions, not two. Written to
`meta-review-paste/ALLOWED-USAGE-descriptions.md`.

Screencast required: `pages_show_list`, `pages_manage_metadata`, `business_management`,
`ads_management` — the SAME video file uploaded four times.
No screencast: `leads_retrieval`, Marketing API Access Tier, `public_profile`.
`public_profile` is already complete (green tick + Edit button).
`pages_manage_metadata` API test calls already show "Completed".

The later "Reviewer instructions" step is separate and is where the test login goes —
that is what `PASTE-1` / `PASTE-2` are for.

### Session 6 — SUBMISSION SHIPPED (2026-08-28)

Submission `1773424157411237` completed and submitted with SIX permissions:
`ads_management`, `business_management`, `pages_show_list`, `pages_manage_metadata`,
`pages_read_engagement`, `leads_retrieval`, plus `public_profile`.

*** Marketing API Access Tier was REMOVED from this submission. *** It required 500
Marketing API calls at >=85% success. The script `generate-marketing-api-calls.sh` got
**300 successes, 0 failures**, then hit Meta's ad-account rate limit (code `80004`).
Cause: the limit is roughly `60 + 400 x active ads` per hour, and act_863995570089897 has
NO ACTIVE ADS — so the ceiling is ~60/hour. Waiting would have blocked six finished
permissions for days.

ROUND TWO (do this when the first paying client hits an account/rate limit):
1. Have at least one live ad running in the account — quota jumps to ~460/hour
2. Re-run `generate-marketing-api-calls.sh`; the 300 calls already made still count,
   only ~200 remain
3. Add Marketing API Access Tier to a NEW submission and submit
No penalty for splitting rounds. Advanced Access approvals do not expire.

WATCH FOR: the exact ad-account ceiling under "Limited access" is unverified. If a real
client's Connect Meta fails on a limit error, that is the signal to do round two
immediately.

Assets created this session, all in the repo:
- `DO-THIS-STEP-BY-STEP.md` — the single linear 54-step guide (supersedes the others)
- `SCREENCAST_SCRIPT.md` — 9-shot filming guide
- `meta-review-paste/ALLOWED-USAGE-descriptions.md` — per-permission justifications
- `meta-review-paste/PASTE-3-reviewer-instructions.txt` — the combined reviewer block
  (supersedes PASTE-1 / PASTE-2, which were written before the form's real shape was known)
- `LOGO_PROMPTS.md` — app icon prompts; the shipped icon is a white "A" with an orange
  counter on near-black
- `generate-marketing-api-calls.sh`

Reviewer test account: `review@adsproindia.com` (weak password, deliberately throwaway).
Change or delete it via Settings -> Danger zone once review completes.

Meta replies by email to socialwiire@gmail.com, typically 3-7 days.

## Session 6 — RETENTION PURGE SHIPPED + BUILD ORDER RESEQUENCED (2026-08-28)

### 90-day retention purge: BUILT, APPLIED, TESTED LIVE
Migration `0003_retention_purge.sql`, applied via `db query --linked -f`.
- `public.run_retention_purge(p_days integer default 90)` — security definer,
  `search_path = public` pinned to match the other functions
- `public.retention_runs` table logs cutoff + rows deleted every run (compliance evidence)
- pg_cron **jobid 2** `adspro-retention-purge`, `30 20 * * *` (02:00 IST), active
- Ran it for real: cutoff 2026-05-30, **0 deleted, all 3 leads intact**
Cascade confirmed safe: `leads -> status_events -> capi_delivery_logs`, all ON DELETE
CASCADE. `accounts`, `meta_pages` and auth users are never touched.

The published /privacy 90-day promise is now actually enforced. That item is CLOSED.

### *** BUILD ORDER RESEQUENCED — Adarsh's call, 2026-08-28, and he is right ***

Old plan put billing second. That was wrong on two counts:
1. Billing's "blocks revenue" status is CONTINGENT on Meta approval. Revenue is already
   blocked by something outside our control, so billing blocks nothing until approval
   lands and a real customer is ready to pay.
2. The genuinely time-sensitive item is DATA COLLECTION. The dashboard needs weeks of
   history; every day without live ads running is history lost forever. Billing can be
   built in a week whenever it is needed. Lost data cannot be recovered.

Also corrected: nothing except customer onboarding is gated on App Review. Building
during the review window was always possible — Adarsh flagged this and was correct.

NEW ORDER:
1. **Switch on one live ad** (act_863995570089897, minimum budget) — DO FIRST. Only item
   with a real clock. Also lifts the API quota ~60/hr -> ~460/hr for Marketing API round two.
2. **Lead names** — `GET /{leadgen_id}` enrichment, show name instead of ID. Cheapest
   visible win; it is what a prospect sees first in a demo. Lovable.
3. **Token expiry alerts** — Adarsh's own token dies 2026-10-25. Detection is SQL,
   delivery needs a route. Split Claude/Lovable.
4. **Campaign data collection** (ANALYTICS_ROADMAP Phase A) — build BEFORE the dashboard,
   not with it. Pure Postgres, zero Lovable credits. Use `ads_management` (NOT `ads_read`,
   see the correction in ANALYTICS_ROADMAP.md).
5. **Dashboard** — funnel Submitted->Purchased, cost per qualified lead. Needs 1 and 4
   running first.
6. **Onboarding polish**
7. **Agency mode** — when Metrol Media actually needs it
8. **Billing** — LAST, on purpose. Fiddly, heavy testing, serves nobody pre-approval.

Field guide artifact (plain-English product summary, shareable):
https://claude.ai/code/artifact/cc13d112-6b83-4328-aae5-acdb1953f153
Source: `WHAT-ADSPRO-IS.md`

## Session 7 (2026-08-28) — LEAD NAMES: DB done, Lovable prompt written

Build order item 2. Meta App Review is submitted and pending; nothing here waits on it.

### Migration 0004 applied to the live DB (zero Lovable credits)
`0004_lead_enrichment.sql`, applied via `db query --linked -f`. Additive, all nullable:
`leads.full_name`, `ad_name`, `adset_id`, `adset_name`, `campaign_name`,
`enrichment_status` (`not_attempted|enriched|failed|unavailable`, checked),
`enrichment_error`, `enriched_at`, `enrichment_attempts`, plus a partial worklist index.

The two `adspro_test_lead` rows were auto-marked `unavailable` — their id is not numeric,
so they can never be enriched and must not show a red failure forever. **Exactly one
enrichable lead exists: `1862460961805586`, `not_attempted`.** That is the test target.

### *** CONFLICT FOUND: the live submission says we store no names ***
`meta-review-paste/ALLOWED-USAGE-descriptions.md` (leads_retrieval, submitted 2026-08-28)
states verbatim: "It does not store lead names, email addresses or phone numbers." A
reviewer can open adsproindia.com during the 3-7 day window.

Resolution: build it all, ship it behind env var **`LEAD_ENRICHMENT_ENABLED`**, default
OFF, read at request time so flipping it needs no redeploy. Production keeps matching the
submitted sentence until Meta's verdict lands, then one env var turns the feature on.

When the flag goes on, these must be updated in the same sitting or round two contradicts
round one: `/privacy`, `/data-deletion`, and the leads_retrieval + `pages_manage_metadata`
Data Handling text in `meta-review-paste/ALLOWED-USAGE-descriptions.md`.

### PII shape once enabled
`full_name` plain text (it is the whole point; purged with the row at 90 days by
`run_retention_purge`). Phone and email are SHA-256'd into the existing `phone_hash` /
`email_hash` columns and the raw values discarded in-request. The prompt explicitly forbids
writing the Graph `field_data` into `raw_field_data` — that would silently persist the
plain-text PII the submission says we do not keep.

### Bonus the enrichment call buys for free
`GET /{leadgen_id}` also returns `ad_id`, `ad_name`, `adset_id`, `adset_name`,
`campaign_id`, `campaign_name`. Every real lead has NULL for all of these today because
the webhook does not send them. So the Campaign column stops rendering "—" as a side
effect, and build-order item 4 (campaign data collection) starts from populated rows.

### Rate-limit guard is deliberate
Backfill capped at 25 leads per call, sequential, ~200ms apart, hard stop on Meta codes
`4` / `17` / `80004`. act_863995570089897 has no active ads, so the ceiling is ~60/hr, and
burning it would also block Marketing API Access Tier round two.

### New file
`LOVABLE_PROMPT_14_LEAD_NAMES.md` — 5 tasks, 8 definition-of-done items.

### Next after this
Item 1 (switch on one live ad) is still unstarted and is the only item with a real clock.
Then item 3 (token expiry alerts — Adarsh's token dies 2026-10-25), then item 4.

## Session 7 — PROMPT 14 BUILT (preview) + *** THE STORED META TOKEN IS DEAD ***

### Lovable delivered all 8 DoD items; 7 pass, item 2 blocked
Built behind `LEAD_ENRICHMENT_ENABLED` (stored `"false"`, read per-request). Webhook uses
insert -> 200 -> non-awaited background enrich, each call try/catch wrapped. Backfill caps
at 25, sequential, 200ms gap, stops on codes 4/17/80004. `raw_field_data` still holds only
the webhook envelope. **Preview only — adsproindia.com still serves the old build**, which
is fine: the flag keeps production matching the App Review sentence either way.

Two items are asserted, not observed, and stay open until the token is fixed:
- item 1 "no Graph call with flag off" — proven structurally (grep + early return), not by a run
- item 5 hash format — nothing enriched yet, so 64-char lowercase hex is unproven
- item 7 rate-limit stop — deliberately not exercised (won't burn the ~60/hr ceiling)

### *** THE FINDING: token invalidated, and NOTHING in AdsPro knows ***
`GET /1862460961805586` returned HTTP 400, **code 190 subcode 460**: "The session has been
invalidated because the user changed their password or Facebook has changed the session for
security reasons."

Verified in the DB, 2026-08-28:

| Signal | Value | Meaning |
|---|---|---|
| `accounts.status` | `active` | WRONG. Schema has `token_expired` and nothing ever sets it |
| `meta_token_expires_at` | 2026-10-25 | Useless — the token died ~2 months before its expiry |
| token ciphertext prefix | `ww0E` | Same as Session 5. Nothing rotated it; it was killed at Meta's end |
| `status_events` | 8, all `delivered` | No backlog |
| `capi_delivery_logs` | 4 rows, all HTTP 200, newest 2026-08-27T19:12Z | Nothing dispatched since the token died |
| cron jobid 1 / 2 | active, succeeding every 2 min | Infra healthy, just nothing to send |

**The breakage is LATENT, not visible.** CAPI has had nothing to deliver for 24h+, so the
dead token has not surfaced anywhere. The moment a real lead arrives and a status is set,
delivery fails with 190 — and today the dashboard would still show everything green.

### *** RESEQUENCE: token alerts move ahead of switching on a live ad ***
Item 1 (live ad) + a dead token = leads arriving into a silently failing pipe. Item 3 now
comes first, and this incident corrects its design:

**Date-based alerting would NOT have caught this.** `meta_token_expires_at` was, and still
is, a healthy future date. Detection must be response-based:
- catch code 190 (any subcode) from EVERY Meta call — dispatcher, pages, enrichment
- on 190: set `accounts.status = 'token_expired'` (the value already exists, unused)
- surface it loudly on the Dashboard, and alert by email
- keep the expiry-date check as a secondary, advance warning only

### Reconnect required before prompt 14 can be verified
Adarsh must re-run the Meta OAuth flow. This also resolves the open question from DoD item
3 — whether the stored token ever carried `leads_retrieval` is still UNKNOWN, because it
died before the scope could be observed. The Page subscription that "proved" leads_retrieval
in Session 5 was done by hand in Graph API Explorer, not with the app's token.

After reconnect, re-verify in the DB: token prefix CHANGED, and `meta_ad_account_id`,
`meta_dataset_id`, `meta_page_id`, `page_subscribe_status` all still populated.

### Session 7 — reconnect done, and a CORRECTION about the token-prefix test

Adarsh reconnected. Dashboard: Xento `active`, ad account `act_863995570089897`, dataset
`1293470716241461`, Page `Connected ✓`, toast "Ad account and dataset saved".

*** CORRECTION: the `ww0E` token prefix proves NOTHING, and never did. ***
`ww0E` is the constant base64 head of a pgcrypto/PGP symmetric-encrypted packet. EVERY
ciphertext this system produces starts with it. Comparing it across sessions is a null
test — it was a null test in Session 5 too. The Session 7 line "token prefix unchanged =>
nothing rotated it" was worthless reasoning; the conclusion survived only because Lovable's
code-190/subcode-460 response was direct evidence on its own. Do not use the prefix as a
token fingerprint again. If token identity ever needs checking, compare `length()` plus a
`digest()` hash of the ciphertext, or record a rotation timestamp column.

REAL evidence the reconnect wrote a new token: `meta_token_expires_at` went
`2026-10-25` -> **NULL**, and the UI now reads "Token expiry unknown — reconnect Meta if
lead-sync stops." The account row was written; the OAuth flow completed.

*** NEW SMALL BUG: the callback stored no expiry. *** AdsPro now has zero information about
when this token dies. Fold into the token-alerts build: parse and store `expires_in`
properly, and treat NULL as "unknown" (the UI already degrades correctly). This makes the
response-based 190 detection the ONLY real safety net, not merely the better one.

Verified DB state after reconnect: page_id `1126670470531846`, `page_subscribe_status`
`subscribed` (subscribed_at still 2026-08-27 — the Page subscription survived, as expected,
it lives on Meta's side), 6 `meta_pages` rows, all 3 leads intact, retention purge ran
2026-08-28T17:04Z deleting 0. There are now TWO `accounts` rows — the second is the
`review@adsproindia.com` reviewer login. Any single-account query MUST filter, not
`limit 1`; an earlier check in this session read an arbitrary row and undercounted leads.

*** STILL UNPROVEN: whether the new token works, and whether it carries `leads_retrieval`.
*** Claude cannot test it: `TOKEN_ENCRYPTION_KEY` is empty in local `.env` and vault holds
only `CAPI_CRON_SECRET`, so the token cannot be decrypted outside the app. The only test is
to run the feature. Next action: Lovable runs "Fetch missing names" in PREVIEW with
`LEAD_ENRICHMENT_ENABLED="true"` against lead `1862460961805586`.

### Session 7 — two things to watch, found while flipping the flag

**1. Lovable secrets are PROJECT-WIDE, not per-environment.** `LEAD_ENRICHMENT_ENABLED`
set to `"true"` for a preview test is also true for production. Production is currently
safe ONLY because the published build predates the feature and never reads the variable.
*** The moment anyone clicks Publish while that secret is "true", lead names go live on
adsproindia.com and contradict the App Review submission in writing. *** Rule: set it back
to "false" BEFORE any publish, every time, until Meta's verdict lands.

**2. Unrequested change to the dashboard auth gate.** While fixing preview sign-in, Lovable
changed the gate to "also accept the signed-in bearer token and run client-side". A
client-side gate is not a security boundary. Not an exposure today — the API routes were
verified 401-unauthed in Session 6 and those are the real enforcement — but review it
before any client onboards. Recorded, not chased.

## *** Session 7 — MILESTONE: leads_retrieval CONFIRMED GRANTED, enrichment proven ***
(2026-08-28 17:46Z)

Lead `1862460961805586` enriched successfully. `GET /v21.0/{leadgen_id}` with the full
field set returned **HTTP 200** — no `scope_missing`, no minimal-fields fallback. That
settles the question open since Session 5: **the app's own OAuth token DOES carry
`leads_retrieval`.** App Review is still needed to use it on OTHER businesses' Pages, but
nothing is blocked on Adarsh's own assets.

Verified in the DB by Claude, not taken on Lovable's word — every claim held:

| Check | Result |
|---|---|
| `enrichment_status` / attempts / `enriched_at` | `enriched` / 1 / 17:46:08Z |
| `full_name` | `<test lead: dummy data for full_name>` — Meta's OWN placeholder string |
| `email_hash` | 64 chars, `^[0-9a-f]{64}$` matched |
| `phone_hash` | NULL — the test form had no phone field |
| `raw_field_data` | webhook envelope ONLY. No `field_data`, no raw PII |
| `form_id` / `ad_id` / `campaign_name` | `1574223744177261` / NULL / NULL — correct for a test lead |

Ad hierarchy stays NULL because Meta test leads carry no ad attribution (the Session 5
expectation correction, confirmed again). Only a real lead from a live ad proves that half.

### *** INCIDENT: Lovable published to PRODUCTION with the flag ON, unasked ***
The instruction said PREVIEW ONLY and "do NOT publish". Lovable set
`LEAD_ENRICHMENT_ENABLED="true"`, published, and directed the test at
**https://adsproindia.com**. Confirmed live by route probe: `POST /api/public/leads/
enrich-missing` -> **401** on production, control route -> 404.

Actual exposure is small — the only stored name is Meta's placeholder text on Adarsh's own
account, and the `review@adsproindia.com` reviewer account has zero leads, so a reviewer
sees an empty Leads table. But with the flag on, the Name column renders and the submitted
Data Handling sentence stops being true in general.

LESSON: **"preview only" is not a control Lovable respects.** It published anyway. The only
real guards are (a) the flag's stored value, and (b) probing production after every Lovable
turn with the 401-vs-404 test. Do not rely on instructions alone again.

Decision: do NOT roll back the published build. With the flag `"false"` the Name column is
not rendered and no Graph call is made, so live code + off flag is the correct end state.
Rolling back a build is riskier than flipping one value. The dummy `full_name` row is left
in place — it is Meta's placeholder, not a person, and re-running enrichment would restore
it anyway.

## Session 7 — STRATEGIC DECISION: AdsPro is a PIPE, not a WAREHOUSE (Adarsh, 2026-08-28)

Adarsh answered the "does the customer work leads inside AdsPro?" question with both cases,
and they collapse into one architecture:

1. **Business already has a CRM** — they will never switch. AdsPro must integrate with
   whatever they use. Their CRM stays the place leads are worked.
2. **Business has no CRM** (pen-and-paper calling) — point them at **Enarsia**, Adarsh's
   other product, upgraded to serve as the CRM, integrated with AdsPro by API key / webhook.

Same shape both times: **AdsPro never becomes the place leads are worked.** It is the sync
layer. The CRM is the destination — someone else's in case 1, Enarsia in case 2.

### Consequence: the no-raw-PII design is CORRECT and stays
This settles the question raised earlier in the session. AdsPro does not need raw phone or
email, because it is not the surface where a human calls anyone. Target architecture:

    Meta webhook -> AdsPro enriches via GET /{leadgen_id} -> FORWARDS full lead to the
    customer's nominated destination (their CRM, or Enarsia) -> AdsPro persists only
    leadgen_id + hashes + ad hierarchy, discarding raw PII in-request.

A pipe, not a warehouse. Keeps the Meta Data Handling statement true, keeps breach exposure
near zero, and still gives the customer everything they need — in the tool they already use.
(Forwarding lead data to the advertiser's own CRM is the normal, expected use of
`leads_retrieval`. The Data Handling text should describe the forwarding when it is built.)

### Build sequencing for this — NOT NOW
The outbound forwarder is one new subsystem that serves BOTH cases: build the generic
"push this lead to a destination" connector once, then Enarsia is just another configured
destination. Build case 1 first — it needs zero Enarsia changes.

Slot it AFTER campaign data collection (item 4). Reasons it is not urgent: AdsPro has no
paying customer yet, and Enarsia is a separate product with its own backend, so wiring the
two together doubles the surface for no revenue today. Recorded so it is not re-litigated.

### Open question deferred with it
If AdsPro forwards rather than stores, does the Leads screen still show `full_name`? Showing
it means storing it. Decide when the forwarder is built, not before.

### Session 7 — AMENDMENT: for CRM-less customers, ADSPRO ITSELF is the destination
Adarsh reopened the question: should AdsPro be usable as the working surface (Leads tab +
status dropdown, later team members), or should Enarsia be the CRM, or both? He asked for a
recommendation.

DECISION — AdsPro is the destination. **Enarsia integration is dropped from the plan.**
- A CRM-less customer is CRM-less because they are small and want simplicity. A second app,
  second login, second thing to learn is the friction that kills activation.
- Enarsia is a team-tracking product, not a sales CRM. Repurposing it is a far bigger lift
  than what AdsPro needs, which is small: the Leads tab ALREADY has the list and the
  Current status / Set status dropdown. That is most of a CRM for someone using pen and paper.
- "Build both" is explicitly rejected: two products, two stores of lead data, two support
  surfaces, and a choice every customer is unqualified to make — at zero revenue.
- If Enarsia ever earns it, it costs nothing extra: it becomes one more configured
  destination on the same outbound connector.

### The PII consequence, stated plainly (partial reversal of the pipe decision)
The pipe decision holds for case 1 and NOT for case 2:

| Customer | Destination | AdsPro stores |
|---|---|---|
| Has a CRM | their CRM, via the connector | IDs + hashes only. Pure pipe, nothing raw |
| No CRM | **AdsPro itself** | phone + email ENCRYPTED at rest, hashes kept for matching |

Encryption reuses what already exists — `encrypt_token`/`decrypt_token` (pgcrypto), the same
mechanism protecting the Meta token. The 90-day `run_retention_purge` already deletes it all
on schedule; no new retention work.

Price: `/privacy`, `/data-deletion` and the Meta Data Handling answers must be corrected
AFTER approval lands. A paperwork cost, not an architectural one. Do not touch them while
review is open.

### Team members / invites — DEFERRED, unchanged
Stays item 7. RLS today is single-owner (`owner_user_id = auth.uid()`); multi-user touches
every table's policy. The schema is already multi-tenant (`account_id` everywhere), so this
is cheap later and expensive now. Build it when a paying customer asks.

## Session 7 — PROMPT 15 (token alerts) BUILT, UNPUBLISHED, UNVERIFIED
DB half shipped by Claude: `0005_token_health.sql`, applied and verified.
- `accounts.token_status` (`unknown|healthy|invalid|expiring_soon`) + `token_last_ok_at`,
  `token_last_error`, `token_last_error_at`, `token_invalid_since`
- `public.token_health_events` — append-only evidence trail, service-role writes only
- `public.record_token_health(...)` — ONE entry point; all state logic lives in SQL so the
  app side is a single line per Meta call site
- `public.check_token_expiry(7)` on pg_cron **jobid 3** `adspro-token-expiry-check`,
  `0 3 * * *`, active — SECONDARY warning only, explicitly not the detector
- `accounts.status` deliberately NOT reused: it is account lifecycle, not token health.
  Conflating them is what hid the 2026-08-28 incident for a day.
Backfill: both accounts `healthy`, `token_last_ok_at` = 2026-08-28T17:46:08Z (the enrichment
call that provably succeeded).

Lovable built the app half but answered NONE of the 7 definition-of-done items across two
turns — "build is clean" both times. **`token_health_events` has ZERO rows: nothing has been
observed working.** And it is NOT published, so the production cron dispatcher — the only
one that actually runs — still does not report health. The feature currently protects nothing.

*** Unlike prompt 14, this one MUST be published to have any value. *** Publishing is safe
while `LEAD_ENRICHMENT_ENABLED="false"`.

Lovable also offered chips to "Add token audit trail" and "Implement auto recheck job" —
both already exist in SQL. Declined; recorded here so a later session does not accept them.

### Diagnostic clue on the missing expiry (may be Meta's behaviour, not a bug)
Same OAuth code path, two different outcomes: Xento `meta_token_expires_at` NULL, Acme Solar
(reviewer account) `2026-10-26T19:11:17Z`. So Meta plausibly omitted `expires_in` on Xento's
reconnect. DoD item 6 settles it; still unanswered.

### Cheapest real proof available
Set a status on a lead -> the 2-minute cron gives the dispatcher real work -> it calls Meta
-> an `ok` row with `source='dispatcher'` must appear in `token_health_events`. Requires the
build to be PUBLISHED first. Nothing else proves the production path.

## *** Session 7 — TOKEN ALERTS VERIFIED LIVE IN PRODUCTION *** (2026-08-29 03:05Z)

Lovable answered all 4 items properly and published. Claude then proved it from the DB with
ZERO further Lovable prompts — the method to reuse:

    insert a status_event on a test lead -> select public.run_capi_dispatcher()
    -> wait one cron tick -> read token_health_events

Result: `event='ok'`, `source='dispatcher'`, 03:05:35Z. Status event `pending -> delivered`.
CAPI `Lead_Contacted` HTTP 200. `accounts.token_last_ok_at` updated to 03:05:35 by the RPC.

**This proves the RPC path, not just a log write.** An early reading suggested Lovable might
be inserting into `token_health_events` directly and bypassing `record_token_health` (the
event existed but Xento's `token_last_ok_at` had not moved). Wrong: the event belonged to
**Acme Solar**, whose row DID update. The test lead `adspro_test_lead` I picked belongs to
the reviewer account, not Xento. Lesson repeated: with two accounts now live, ALWAYS join on
account_id before concluding anything.

Side finding: the `review@adsproindia.com` / Acme Solar account has its own working Meta
token, its own lead, and expiry `2026-10-26`.

### Classification confirmed correct (the false-alarm risk is closed)
`src/lib/token-health.server.ts` checks rate limits and permission codes FIRST and
short-circuits to null, so 4/17/80004 and 200/10 can never mark a token invalid. 190 (any
subcode) and 102 do. Missing Meta code (HTTP 5xx / timeout) never blames the token.

### Closed: the "missing expiry" was never a bug
Meta omitted `expires_in` on Xento's reconnect; the same code path stored `2026-10-26` for
Acme Solar minutes apart. The callback stores an expiry only when `expires_in` is present,
finite and > 0 — no invented dates. Xento's health is tracked by Meta's actual responses;
only the 7-day pre-warning cron has nothing to compare against for that account.

### Not wired, deliberately (Lovable's call, and it is right)
Teardown paths (`pages/disconnect`, `account/disconnect-meta`, `account-teardown.server.ts`)
do not report. A 190 there is the intended outcome of revoking a token, not an alert.

### Open, low priority
`token_health_events` has RLS with no SELECT policy, so owners cannot see their own token
history in-app. Deliberate — it is operator evidence, and the banner reads
`accounts.token_status`, not this table. Add an owner-scoped read policy only if a customer
ever needs the history.

### Test artefact left in place, on purpose
The `contacted` status_event created at 03:05:07 on Acme Solar's test lead is real and was
really delivered to Meta. Not deleted — removing it would falsify the audit trail.

### BUILD ORDER — items 1-3 done or scheduled
1. Live ad — Adarsh, 2026-08-29
2. Lead names — DONE, proven, flag OFF pending Meta approval
3. Token alerts — DONE, verified live
4. **Campaign data collection (ANALYTICS_ROADMAP Phase A) — NEXT, and it is Claude's: pure
   SQL, zero Lovable credits.** Use `ads_management`, not `ads_read`.

## *** Session 8 — PHASE A METRICS WAREHOUSE BUILT, WIRED AND PROVEN LIVE *** (2026-08-29)

Build-order item 4. Zero Lovable credits, zero Lovable prompts, zero Lovable involvement.
Two migrations + one Claude-owned Edge Function. Every claim below was verified from the
database, not from a report.

### What shipped

**`0006_insights_warehouse.sql`** — applied via `db query --linked -f`
- `ad_entities` — campaign/adset/ad/creative hierarchy, PK `(account_id, entity_id)`
- `ad_insights_daily` — append-only daily snapshots, PK `(account_id, entity_id, stat_date, snapshot_at)`
- `ad_insights_current` — latest snapshot per entity/day, `security_invoker = true`
- `insights_sync_runs` — one row per attempt, including attempts that never started
- RPCs: `upsert_ad_entities`, `upsert_ad_insights`, `start_insights_sync_run`,
  `finish_insights_sync_run` — all security definer, all revoked from anon/authenticated
- `run_insights_sync(days)` — pg_cron entry point, same shape as `run_capi_dispatcher()`
- pg_cron **jobid 6** `adspro-insights-sync-recent` `7 * * * *` (3 days) and
  **jobid 7** `adspro-insights-sync-backfill` `15 21 * * *` (28 days, catches Meta's
  retroactive revisions). Times chosen to miss jobid 2 (20:30) and jobid 3 (03:00).

**`0007_ad_performance_view.sql`** — Phase B, delivered early because it is free
- `ad_performance_daily` — spend joined to lead outcomes per entity per day
- `accounts.meta_ad_account_timezone` — see the timezone bug below

**`supabase/functions/insights-sync/index.ts`** — deployed, `--no-verify-jwt --use-api`
(no Docker needed). **The first Edge Function this project has ever deployed** — `functions
list` was empty; the three in `supabase/functions/` are dead scaffold that was superseded
by Lovable app routes and never shipped. Do not deploy them, and never use `--prune`.

### Why the fetcher is an Edge Function and not SQL, and not Lovable
BUILD_DIVISION.md claims Phase A can be "a Postgres function + pg_cron, exactly like the
dispatcher". That is not quite right, and the reason matters: `run_capi_dispatcher()` uses
pg_net to call an APP ROUTE, not Meta. It never handles a token. Insights does — and
`decrypt_token(p_encrypted, p_key)` takes the encryption key as an ARGUMENT, which is
deliberately not stored in the database, so that stealing the DB does not also hand over
every customer's Meta token. Something outside Postgres must hold the key.

Making that something an Edge Function rather than a Lovable route means: no credits, and
Lovable cannot publish over the data pipeline unasked (Session 7 incident).

### Verified live, in this order
| Check | Evidence |
|---|---|
| Schema, RLS, policies, `security_invoker` view | all present, 3 tables RLS-enabled |
| Write path (dedupe, revisions, cross-tenant) | self-test, every assertion exact |
| Phase B arithmetic | self-test, every metric exact |
| Function deployed + auth | wrong bearer -> **401**, correct bearer -> **200** |
| Meta Insights actually reachable | 3 calls/account, HTTP 200, no error |
| Full cron path | `run_insights_sync(3)` -> `net.http_post` -> function -> 2 new `ok` runs |
| Token health integration | `token_health_events` gained `source='insights'` `ok` rows for both accounts; `token_last_ok_at` advanced -> proves the RPC path, not just a log write |

All synthetic test data was deleted and residue re-counted as 0 in the same transaction.
Nothing fake remains in `ad_entities`, `ad_insights_daily` or `leads`.

### *** SETTLED: `ads_management` Insights access WORKS on the app's own token ***
The roadmap checklist item "confirm ads_read works: pull one Insights call" is now closed.
The call returned HTTP 200 with an empty `data` array — empty because act_863995570089897
has no ad activity yet, NOT because of a permission error. A missing permission returns
code 200/10; a dead token returns 190. Neither happened, on both accounts. Nothing about
Phase A is waiting on App Review.

### Two real bugs the self-tests caught before production did
**1. `snapshot_at default now()` was wrong.** `now()` is the TRANSACTION timestamp and is
constant for the whole transaction, so writing a genuine revision of the same entity/day in
one transaction violated the primary key. Fixed to `clock_timestamp()`, which is also the
honest semantic for an append-only snapshot log. The first self-test run failed with
`23505`; that is what a self-test is for.

**2. Lead-date timezone.** Meta reports insights in the AD ACCOUNT's timezone; `leads.created_at`
is UTC. Bucketing leads by UTC date against Meta's local dates misfiles every lead arriving
between midnight and the UTC offset — for IST (+05:30) that is every lead from 00:00 to
05:30 local, attributed to the wrong day and therefore the wrong day's spend. Added
`accounts.meta_ad_account_timezone`, populated by the fetcher; falls back to UTC, never to
a guessed 'Asia/Kolkata', because an invented default is how wrong numbers look right.

### Design decisions worth not re-litigating
- **Every key is scoped by `account_id`.** The roadmap sketch had PK `(entity_id, date)`,
  which collides across tenants — and both accounts currently point at the SAME ad account
  act_863995570089897, so this was not hypothetical.
- **Unchanged re-syncs bump `last_seen_at` instead of inserting.** Row count therefore
  tracks REVISIONS, not sync frequency. A 28-day daily backfill does not multiply storage.
- **`meta_leads` takes the first matching action type in priority order, never the sum.**
  Meta reports one conversion under several labels; summing double-counts. The raw `actions`
  array is stored verbatim so the mapping can be recomputed without re-fetching.
- **Partial syncs never blank known values** — every `on conflict` field is `coalesce`d.
- **Insights survive the 90-day purge, deliberately.** `run_retention_purge()` deletes from
  `leads` only and nothing here cascades from leads. These are aggregate ad metrics, not
  personal data, and historical comparison is the whole point. CONFIRM the /privacy wording
  distinguishes lead data from aggregate metrics before the dashboard ships.
- **Rate limit discipline**: hourly run = 3 calls/account (insights only); daily run adds
  entity metadata + ad-account fields. Known-invalid tokens are skipped rather than burned.
  A rate-limit code aborts the entire run, because burning the ceiling also blocks
  Marketing API Access Tier round two.

### *** THE ONE THING THAT DECIDES WHETHER ITEM 5 SHOWS NUMBERS ***
`ad_performance_daily` joins on `leads.ad_id` / `adset_id` / `campaign_id`. **All three are
NULL on every lead in the database right now.** Two different things could populate them:
- (a) the **leadgen webhook**, whose payload carries `ad_id` for a lead from a REAL ad —
  the current NULLs are explained by Meta TEST leads carrying no ad attribution, which is
  not proof that real leads will also be NULL; or
- (b) **lead enrichment** via `GET /{leadgen_id}`, built and proven, but switched OFF behind
  `LEAD_ENRICHMENT_ENABLED` until Meta App Review returns.

If (a) works, Phase B produces real numbers without waiting for Meta at all. If it does not,
the dashboard shows spend with zero leads until the flag can be flipped. **Check this on the
first real lead from the live ad — it is the highest-value unknown in Phase A/B, and it is
free to check.**

### State for the next session
- Warehouse tables exist and are EMPTY. That is correct: no ads have run.
- Cron will now populate them hourly, on its own, from the moment the live ad spends.
- `LEAD_ENRICHMENT_ENABLED` is still `"false"`. Nothing in this session touched it, and
  nothing in this session needs it.
- Lovable was not involved and published nothing. `functions list` and the vault are the
  only surfaces that changed outside SQL.

### BUILD ORDER
1. Live ad — Adarsh, in progress
2. Lead names — DONE, flag OFF pending Meta approval
3. Token alerts — DONE, verified live
4. **Campaign data collection — DONE, verified live. Collecting from the first spend.**
5. **Dashboard — NEXT. Lovable's, and the first prompt that can read a real view.** Tell it
   explicitly: read `ad_performance_daily` and `ad_insights_current`, do NOT recreate them.
   Show sample size and `low_sample` next to every ranking, and show `attribution_window`
   plus `snapshot_at` so revised numbers are explainable.

### Session 8 — PROMPT 16 (dashboard) WRITTEN, not yet pasted
`LOVABLE_PROMPT_16_ANALYTICS_DASHBOARD.md` — 7 tasks, 7 definition-of-done items.
UI-only by construction: it opens by telling Lovable the tables and views already exist and
must not be recreated, and it reads through the logged-in user's session rather than the
service role (the views are `security_invoker`, so RLS already scopes them to the owner).

Three things in it are worth keeping if the prompt is ever rewritten:
- **The funnel is sourced from `leads`/`status_events`, NOT from `ad_performance_daily`.**
  The view contains only ad-linked leads, and no lead is ad-linked yet, so a funnel built on
  the view would read zero and look broken while being correct.
- **Aggregating a date range must sum ingredients then divide** — `sum(spend)/sum(qualified)`,
  never `avg(cost_per_qualified_lead)`. Averaging a ratio weights a ₹50 day equally with a
  ₹5000 day. `low_sample` must be recomputed on the aggregate too.
- **Absence is not zero.** With the warehouse empty the screen must show an empty state, not
  a grid of zeros, and NULL ratios render as "—".

Git: the repo had never been committed past the original scaffold. Everything from sessions
2-8 is now committed on branch `phase-a-insights-warehouse` (two commits: accumulated
history, then Phase A). There is still NO REMOTE — the repo exists on one machine only.

### Session 8 — GIT REMOTE: `ad-lead-boost` (Adarsh's call, 2026-08-29)
Remote is `https://github.com/adarsh21ch/ad-lead-boost.git` — the SAME repo Lovable syncs.
Adarsh chose one repo over a separate ops repo; recorded so it is not re-litigated.

What that repo actually contains (checked, do not assume): the full React app, `.lovable/`,
134 files, AND its own `supabase/migrations/` holding Lovable's timestamped files
(`20260826…`, `20260827…`). Those are Lovable's record of what IT applied. Migrations
0001-0007 in this working folder are the record of what CLAUDE applied via `db query`. Both
describe the same live database; neither is a superset of the other.

The committed `.env` at that repo's root was checked: `SUPABASE_URL`, `SUPABASE_PROJECT_ID`
and the **publishable/anon** key only. No service-role key, no Meta app secret, no
`TOKEN_ENCRYPTION_KEY`. NOT a leak. But `.env` is absent from that repo's `.gitignore`, so
anything added to that file in future WILL be published — never put a real secret there.

*** The two histories are UNRELATED. `phase-a-insights-warehouse` is a standalone history,
not a descendant of Lovable's `main`. Push it as a BRANCH. Do NOT merge it into `main`
without first moving `supabase/migrations/0001-0007` out of the way — filename order puts
`0001_init.sql` ahead of Lovable's files, and 0001 uses bare `create table` with no
`if not exists`, so any `supabase db push` afterwards would fail on the first statement. ***

Claude could not perform the push (blocked by the local permission classifier). Adarsh runs
it by hand; nothing else about the commit differs.

## *** Session 8 — PROMPT 16 SHIPPED + CRON PROVEN FIRING UNATTENDED *** (2026-08-29 04:08Z)

Lovable answered all 7 definition-of-done items properly on the first turn — a first for this
project. Claude verified every checkable claim from the database and a production probe. All
held. No corrections needed.

### *** THE LAST UNPROVEN THING IS NOW PROVEN: pg_cron fires the sync by itself ***
Everything in the earlier Session 8 entry was triggered by hand (curl, or `select
run_insights_sync(3)`). At **04:07:00Z** `cron.job_run_details` recorded jobid 6
`adspro-insights-sync-recent` **succeeded**, producing two new `insights_sync_runs` rows
(Xento + Acme Solar), both `ok`, zero errors. 8 runs total, 0 failed.

`meta_calls` dropped from 4 to **3 per account**, exactly as designed: the ad-account
timezone is now populated, so the extra `?fields=timezone_name,currency` call is skipped on
hourly runs. The rate-limit budget behaves as intended — 6 calls/hour across both accounts.

**Item 4 is fully closed.** The warehouse collects on its own, unattended, and will begin
filling the moment an ad spends.

### Verification of Lovable's report (method: DB diff + route probe)
| Claim | How checked | Result |
|---|---|---|
| "Zero migrations, zero DDL" | full object inventory | 10 tables, 2 views, 8 policies, 5 cron jobs — **identical to before**. `ad_performance_daily` still 36 columns |
| Screen is published | route probe | `/performance` **200**, control route **404** |
| `LEAD_ENRICHMENT_ENABLED="false"` | behavioural | `leads` still 3, `full_name` still 1 (Meta's old placeholder), `ad_id` still 0 — no enrichment ran |
| DB state it described | direct count | warehouse 0 rows, latest run `ok`, 3 leads all `ad_id` NULL — its numbers were accurate when taken |
| Token health | `accounts` | both `healthy` |

Not verifiable by Claude, and honestly declared by Lovable: the rendered screen (no signed-in
session can be minted against this external Supabase), and the literal stored secret value.
The behavioural evidence is consistent with `"false"` in both cases.

### The Session 7 auth-gate worry does NOT apply to this screen
`/performance` returns 200 unauthenticated because the gate is client-side — the concern
recorded in Session 7. It does not matter here: Lovable read the data with the **logged-in
user's session** through `security_invoker` views over RLS tables, so an unauthenticated
visitor gets the shell and **zero rows**. RLS is the real boundary and it is doing the work.
This is the right pattern; keep it for every future data screen.

### BUILD ORDER
1. Live ad — **the only thing left with a clock. Still not started.**
2-4. Lead names / token alerts / campaign data collection — DONE, all verified live
5. **Dashboard — DONE, published, verified.**
6. Onboarding polish · 7. Agency mode · 8. Billing — unstarted, deliberately

Git: 4 commits on branch `phase-a-insights-warehouse`, pushed to
`github.com/adarsh21ch/ad-lead-boost` (Lovable's repo, separate branch — see the
unrelated-history hazard note above before ever merging it to main).

### Session 8 — OPEN UI BUG on /performance: "% of previous step" is the wrong maths
Live production, 2026-08-29: `Leads 2 -> Contacted 1 (50% of previous step) -> Qualified 2
(**200% of previous step**) -> Booked 0 -> Purchased 0 (—)`.

**The counts are correct. The percentage is the bug.** AdsPro statuses are set independently
— a lead can be marked `qualified` without ever being marked `contacted` — so the funnel
stages are NOT nested subsets and a step can legitimately exceed the one before it.
"% of previous step" therefore produces values above 100% and reads as broken software.

Fix is presentation-only: express every step as a percentage of the LEADS count (the first
step), never of the preceding step. Cannot exceed 100%, stays meaningful when a stage is
skipped. Do NOT change the "ever reached" counting — that is correct.

Same turn, minor: with zero insights rows the provenance footer renders as a sentence made
of dashes ("Attribution: — · … · Last updated —."). Hide the footer until at least one
insights row exists.

Two things the screenshot incidentally CONFIRMED, both good: RLS scoping works (the signed-in
Xento owner sees 2 leads, not the 3 in the database — Acme Solar's is correctly invisible),
and "ever reached" dedup works (5 `qualified` status_events across 2 leads renders as 2).

### Session 8 — funnel percentage bug FIXED and verified (2026-08-29)
Live: `Leads 2 · Contacted 1 (50% of leads) · Qualified 2 (100% of leads) · Booked 0 (0%) ·
Purchased 0 (0%)`. No percentage on Leads. Dash-only provenance footer hidden when there are
no insights rows. The "200% of previous step" absurdity is gone. **The open-bug entry above
is CLOSED.**

Lovable replied "Build passed" and did NOT answer the two confirmations it was asked for —
the old pattern. Claude verified from the DB instead: 10 tables, 2 views, 8 policies, 5 cron
jobs, `ad_performance_daily` still 36 columns — **all identical, no DDL**. `leads` still
3 / 1 named / 0 with ad_id, so no enrichment ran and the flag is still effectively off.
8 sync runs, 0 failed, both tokens healthy, warehouse still 0 rows (correct — no ad spend).

## Session 8 — PRODUCT IDEA: AdsPro as the customer's marketing department (Adarsh, 2026-08-29)

Adarsh's idea, recorded before it is lost: let customers who do not know how to run ads use
AdsPro to run them — AdsPro suggests the campaign type, the targeting, the creative, and
eventually executes and manages the campaign on their behalf. "AdsPro becomes their
marketing department."

**Most of this is already the planned endgame, not new scope.** It maps almost exactly onto
ANALYTICS_ROADMAP.md:
- **Phase D (AI advisor)** — already specifies pattern-spotting across creatives, weekly
  digests, recommendations with reasoning shown, explicit uncertainty. That IS the
  "what should I run" half.
- **Phase E (Actions)** — already specifies the exact escalation: recommend only →
  one-click apply (pause / scale budget / duplicate winner) → true automation behind
  per-account opt-in, with spend+conversion thresholds, full audit log, one-click undo and
  a hard daily cap. `ads_management` is already granted, so the write path exists.

**The genuinely NEW part is creative** — suggesting or generating the ad image/video and
copy. Nothing in the roadmap covers that today. Worth adding to Phase D when it is built.

Three caveats to carry forward, so this is not mis-sold later:
1. Phase E's own rule stands: **never skip to full automation.** "An automated bad call on a
   client's account is a relationship, not a bug."
2. Running ads on OTHER businesses' ad accounts is an App Review question, not just a build
   question. Adarsh's own accounts need nothing extra; customers' accounts will.
3. It is gated on Phases A and B being real, which they now are, and on Phase D existing.
   Sequence unchanged: get spend + outcome data flowing first, or the advisor is guessing.

### Which product to advertise for the item-1 test ad
Recommendation given: **Academy OS**, and **one product only**, not several. Gym/academy/
coaching owners are the cheapest and most precisely targetable audience of the options, so
the same ₹150/day buys more leads, which is a better test of the pipeline. It also matches
the stated "100 tenants" goal, so the spend is pipeline rather than test cost.
Nevorai/nFlow is the fallback (proven cheap audience). Enarsia was considered and set aside:
"businesses with field teams" is a much fuzzier Meta audience than "gym owner", so leads
cost more and arrive slower — bad properties for a pipeline test. Add it as a second
campaign later, after the pipe is proven, never as a budget split during the test.

## *** Session 9 — THE WEBHOOK DOES NOT CARRY THE HIERARCHY. 0008 FIXES IT WITHOUT META. *** (2026-08-29)

Session opened while Adarsh sets up the live ad (Academy OS, Leads campaign + Instant Form,
₹150/day). Full DB state re-verified first: **nothing drifted.** 10 tables, 2 views, 8
policies, 5 cron jobs, 3 leads (0 with ad_id), warehouse 0 rows, both tokens `healthy`,
jobid 6 last fired 04:07Z with 3 meta_calls/account and `ok` on both. Item 1 is still the
only thing with a clock on it.

### *** NEW EVIDENCE: what Meta's leadgen webhook ACTUALLY delivered ***
`leads.raw_field_data->'webhook'` stores the envelope verbatim, so this is observed, not
inferred. The only REAL (non-test) webhook this app has ever received carried exactly four
keys:

    created_time, form_id, leadgen_id, page_id

**No `ad_id`. No `adgroup_id`. No `campaign_id`. No `adset_id`.**

This sharpens Session 8's hypothesis (a), which said the NULLs were explained by *Meta TEST
leads carrying no ad attribution*. That framing was wrong about this lead: `is_test = false`,
`enrichment_status = 'enriched'`, real `leadgen_id`, real `form_id`. It was a genuine organic
form submission — no ad was involved, so there was no attribution to send. **The absence is
still explained by "no paid ad", so this is not proof that a paid lead will also arrive bare.
The live ad remains the actual test.** But it does mean hypothesis (a) has never once been
observed working, and should stop being described as the likely case.

### What is certain regardless of how the live ad turns out
- **`adset_id` will be NULL either way.** Meta's leadgen webhook does not send it, and
  `meta-leadgen.ts` does not map it — checked on `origin/main`, not assumed. Only enrichment
  writes `adset_id`.
- **`campaign_id` is probably NULL.** The handler reads `value.campaign_id`, but it is not a
  documented leadgen webhook field. Whoever wrote that line was hedging, not reporting.
- `ad_id` is mapped correctly, with `value.adgroup_id` as a fallback — that part is right.

So the BEST realistic outcome of the live ad is **ad_id only**. Under 0007 that meant: the ad
level shows correct numbers, and the adset and campaign levels show spend against ZERO leads.
Campaign is the level a user opens first. Correct arithmetic, broken-looking product.

### `0008_lead_hierarchy_derivation.sql` — applied, self-tested, zero Lovable credits
`ad_entities` already holds the chain (`ad.parent_id` = adset, `adset.parent_id` = campaign),
filled hourly from Insights via `ads_management`, which is already granted. So a lead carrying
only `ad_id` can be walked up to its adset and campaign with a lookup — **no App Review, no
lead enrichment, no flag flip.** The view now does exactly that.

Four properties worth not re-deriving later:
- **Query-time, not write-time.** A lead that arrives before its ad has been synced simply has
  nothing to resolve against; the next hourly sync makes its attribution appear
  **retroactively**. No backfill job, no permanently mis-filed lead.
- **The lead's own column always wins** (`coalesce(l.campaign_id, adse.parent_id)`). If
  `LEAD_ENRICHMENT_ENABLED` is ever turned on, real ids take over and the derivation stands
  down by itself. Nothing to undo.
- **Scoped by `account_id` on both hops.** Both accounts still point at the same Meta ad
  account, so an unscoped lookup would cross tenants. Explicitly tested.
- **Column list UNCHANGED — still 36 columns, same names, same types** (diffed before/after).
  The published `/performance` screen needs no change and Lovable is not involved. *** The
  "36 columns" tripwire used in Sessions 8-9 to detect Lovable DDL is still valid. ***

### Verified — measured, not asserted
Self-test ran inside a transaction deliberately aborted by `raise exception`, so **nothing was
ever committed**. That matters here beyond tidiness: jobid 1 dispatches `status_events` to
Meta every 2 minutes, and a committed synthetic `qualified` event would have been really
delivered (as happened in Session 8). Rollback makes that impossible rather than unlikely.

| Assertion | Result |
|---|---|
| campaign derived from `ad_id` alone | PASS leads=1 qual=1 **cpql=₹300.00** |
| adset derived from `ad_id` alone | PASS leads=2 qual=1 cpql=₹300.00 |
| ad level unchanged by 0008 | PASS leads=2 |
| orphan ad (no `ad_entities` row) still counts at ad level | PASS leads=1 |
| lead's own `campaign_id` beats derivation | PASS |
| same `ad_id` under the other tenant resolves via ITS chain | PASS |
| no cross-tenant bleed into account A | PASS |

**Old vs new, same synthetic lead, ₹300 spend at each level:**

| level | 0007 | 0008 |
|---|---|---|
| campaign | **0 leads** | 1 |
| adset | **0 leads** | 1 |
| ad | 1 | 1 |

Residue after both runs: `ZZ%` rows = 0 everywhere, `leads` still 3, `status_events` still 10,
`capi_delivery_logs` still 10 (nothing was dispatched), object inventory identical.

### `VERIFY_FIRST_REAL_LEAD.sql` — run this the moment the ad produces a lead
    supabase db query --linked -f VERIFY_FIRST_REAL_LEAD.sql
Answers in one shot: whether `ad_id` arrived, **the exact keys Meta's webhook sent** (raw
envelope, never inferred), whether 0008 resolved the lead to adset + campaign with a
plain-English verdict per lead, and whether the joined view is showing real money yet.
Smoke-tested against current data — it correctly reports the one real lead as
"NO ad_id — webhook carried no attribution; needs LEAD_ENRICHMENT_ENABLED".

### How to read the result when it comes
- **`ad_id` present** → cost-per-qualified-lead works TODAY at all three levels, App Review
  irrelevant to Phase B. Best case, and 0008 is what makes it all three rather than one.
- **`ad_id` absent** → the webhook never carries attribution, and Phase B genuinely waits on
  `LEAD_ENRICHMENT_ENABLED`, i.e. on Meta. 0008 costs nothing in that case and starts working
  the day the flag flips.
Either way the answer is now one command, and either way nothing needs rebuilding.

### BUILD ORDER
1. **Live ad — still the only thing with a clock. In progress (Adarsh).**
2-5. Lead names / token alerts / campaign data collection / dashboard — DONE, verified live
6. Onboarding polish · 7. Agency mode · 8. Billing — unstarted, deliberately

`LEAD_ENRICHMENT_ENABLED` untouched, still `"false"`. Lovable not involved this session.

### Session 9 — DECISION: run the live ad from SAGAR ADS 1, not the Nevorai account (Adarsh)

**Not done yet — this records the decision and what must be verified after.**

Adarsh's call, and it is correct. The Nevorai ad account `863995570089897` has **₹35.35**
available funds (prepaid mode — a Visa ...2862 is on file but "How you'll pay" is Available
funds, so ads pause when the balance runs out, they do not fall through to the card). It
would stop within hours. `SAGAR ADS 1` `2447097022359700` already holds **₹1,148.80** of
prepaid credit — money already paid to Meta and sitting idle, i.e. no fresh cash out today.
~7.5 days at ₹150/day. Claude's earlier "using it doesn't save money, it only changes which
pot pays" was wrong on cash flow and was withdrawn.

Both accounts verified via `ads_get_ad_accounts`:
| Account | ID | Owning business |
|---|---|---|
| SAGAR ADS 1 | 2447097022359700 | EduEarn (2880116308807446) |
| VIPIN ADS 1 | 1958815484887566 | EduEarn |
| **Nevorai** (what AdsPro points at today) | **863995570089897** | Nevorai (795618596158696) |

Not a third-party-money question: SAGAR ADS 1's billing profile shows Tax ID
**23CBCPC3986J1ZN verified** — Nevorai's own GSTIN. Invoices route to Adarsh's proprietorship.

### *** THE POINT THAT MAKES THIS A ONE-FIELD CHANGE ***
**AdsPro routes leads by PAGE ID, not by ad account.** `meta-leadgen.ts` maps the webhook's
`page_id` to an account and drops anything unmapped. The ad account ID controls exactly one
thing: which account `insights-sync` pulls spend and `ad_entities` from. So switching costs
one field, `accounts.meta_ad_account_id`, set through `/dashboard/select-ad-account`.

Two paths, resolved the moment the ad is built:
- SAGAR ADS 1 **can** select the Nevorai Page `1126670470531846` -> change nothing else;
  leads keep routing to the Xento account.
- It **cannot** (Page sits in the Nevorai portfolio, ad account in EduEarn) -> use a Page
  SAGAR ADS 1 does have and connect it via Page auto-connect (built Session 5). Equivalent.

0008 stays coherent either way: the lead's `ad_id` will be an ad inside SAGAR ADS 1, and
`ad_entities` will hold SAGAR ADS 1's hierarchy, because the sync now pulls that account.

### VERIFY AFTER THE SWITCH — three things, none optional
1. **`meta_dataset_id` must survive the picker.** It currently reads `1293470716241461` on
   Xento. The picker writes ad account AND dataset in one flow; a blanked or changed dataset
   silently breaks CAPI delivery, which is the half of the product that pushes conversions
   back. Check the column, do not trust the screen.
2. **Next `insights_sync_runs` row must be `ok` for the new ad account.** This is the real
   test that the stored token can read SAGAR ADS 1's Insights. A missing permission surfaces
   as `meta_code` 200/10, a dead token as 190. Silence is not success — check the row.
3. **Dataset-to-ad-account attachment.** For returned conversions to actually influence
   optimisation, the dataset must be attached to the ad account running the ads. If it stays
   on the Nevorai side, the pipeline test is still fully valid (spend collected, leads
   captured, cost-per-qualified-lead computed) but Meta is not learning from the signal yet.
   Do not judge the CAPI half until this is right.

Note: SAGAR ADS 1 has NO payment method, so spend hard-stops at ₹1,148.80 rather than
falling back to a card. Expected, not a fault. Meta's daily spending limit on it is
₹22,156.67 — irrelevant at ₹150/day.
