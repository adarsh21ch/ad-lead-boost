# Lovable Prompt — Fix auth: login hangs, and session lost on refresh

Three related bugs. Please diagnose from the actual code before changing things, and
tell me what you found for each.

## Symptom 1 — Sign in hangs on "Please wait..."
Clicking Sign in on `/auth` leaves the button stuck on "Please wait..." indefinitely.
Suspected cause: the submit handler awaits something after `signInWithPassword` that
never resolves (e.g. a follow-up query to `accounts` or `profiles` that returns no row
under RLS, or a navigation that never fires), and the loading state is never reset.

Required fixes:
- Wrap the whole handler in `try / catch / finally` and reset the loading state in
  `finally`, unconditionally.
- On a Supabase auth error, show the actual error message to the user — do not fail
  silently and do not leave the button spinning.
- Do NOT block navigation on any secondary fetch (account row, profile, etc.). Navigate
  to `/dashboard` as soon as the session exists; let the dashboard load its own data.
- Add a client-side timeout (e.g. 15s) so a hung request surfaces an error instead of
  spinning forever.

## Symptom 2 — Session is lost on every refresh
Refreshing any dashboard page logs the user out and bounces them to `/auth`.

Root cause: the Supabase session is being stored client-side only (localStorage), but
this app uses TanStack Start server routes and server-side route guards. The server
never sees a localStorage value, so every server-rendered request looks unauthenticated.
I confirmed from the live site that no `sb-*` auth cookie is being set on adsproindia.com.

Required fix — move the session into cookies using `@supabase/ssr`:
- Create a **browser client** with `createBrowserClient` from `@supabase/ssr`, as a
  single module-level singleton (do NOT create a new client per render or per hook call).
- Create a **server client** with `createServerClient` from `@supabase/ssr`, wired to
  read and write cookies from the TanStack Start request/response.
- Ensure cookies are set with `httpOnly` where appropriate, `secure: true`,
  `sameSite: 'lax'`, and `path: '/'`.
- Server-side route guards / loaders must read the session from the server client, not
  from any client-side store.

## Symptom 3 — Logged out after some time even without refreshing
Token refresh is not persisting. Ensure:
- `autoRefreshToken: true` and `persistSession: true` on the client.
- A single `onAuthStateChange` subscription at the app root that handles
  `SIGNED_IN`, `SIGNED_OUT`, and `TOKEN_REFRESHED`, and that is properly unsubscribed
  on unmount. Multiple competing subscriptions or multiple client instances will fight
  over the session — check for that specifically.
- Refreshed tokens are written back to the cookie store, not just held in memory.

## Verification I will run after you publish
1. Sign in — the button must resolve (success or a visible error), never hang.
2. After signing in, an `sb-*` cookie must exist on the adsproindia.com origin.
3. Hard-refresh `/dashboard` — must stay signed in, not bounce to `/auth`.
4. Open `/dashboard` in a new tab — must already be signed in.

## Constraints
- Do NOT touch `/api/public/webhooks/meta-leadgen`, `/api/public/webhooks/status`,
  `/api/public/cron/capi-dispatcher`, or `/api/public/auth/meta/callback`.
- Do not change the legal pages.
- Report what the actual root cause of the hang turned out to be — I want the real
  reason, not just "added error handling".
