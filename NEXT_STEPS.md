# AdsPro — next steps (session 3 handoff)

Do steps 1-6 in ONE sitting. They are one maintenance window; splitting them means
connecting Meta twice.

---

## 0. (2 min, optional but unblocks CLI verification)

Fill the three empty values in `/Users/apple/adspro/.env`:

    VITE_SUPABASE_URL=https://wxgfaaaboftzsazknbvl.supabase.co
    VITE_SUPABASE_ANON_KEY=<Supabase -> Project Settings -> API -> anon public>
    SUPABASE_SERVICE_ROLE_KEY=<same page -> service_role>

One variable per line. Never join two on one line (that bug already cost a session).
After this, DB state can be checked directly instead of round-tripping the SQL editor.

## 1. Reset the Meta app secret

Meta app "AdsPro India" -> Settings -> Basic -> App Secret -> Reset.
Copy the new 32-char value. Immediately paste it into BOTH:
  - Lovable secrets: `META_APP_SECRET`
  - local `.env`: `META_APP_SECRET=` (line 11, replace value only)
This kills the stale duplicate secret that caused the earlier `reason=token_exchange`.

## 2. Rotate TOKEN_ENCRYPTION_KEY

Generate:

    openssl rand -hex 32

Paste into Lovable secrets `TOKEN_ENCRYPTION_KEY` and into `.env` line 19.

## 3. Clear the now-orphaned token (Supabase SQL editor)

The existing ciphertext was encrypted under the OLD key and can no longer decrypt.
Wipe it so nothing tries:

    update accounts
    set meta_access_token_encrypted = null,
        meta_token_expires_at = null,
        status = 'pending_meta_connect';

## 4. Reconnect Meta

Log into adsproindia.com -> dashboard -> Connect Meta. Full OAuth round trip.
Expect to land back with no `?meta_connect=error`.
If it errors, read the reason code in the URL and check Lovable server logs
filtered on `[meta-oauth]` (carries Meta's message / code / error_subcode / fbtrace_id).

## 5. Choose ad account & dataset

Dashboard -> "Choose ad account & dataset" -> pick the ad account, then the pixel.

## 6. Verify — ONE paste

Run `VERIFY_ACCOUNT_ROW.sql` in the Supabase SQL editor. Report back:
  - `status`               -> expect `active`
  - `meta_ad_account_id`   -> expect `act_...`
  - `meta_dataset_id`      -> expect numeric
  - `token_ttl`            -> expect ~60 days
  - `token_storage_verdict`-> MUST say "ENCRYPTED (pgcrypto) OK"
                              If it says PLAINTEXT, stop — encryption fell through.
  - `decrypted_prefix`     -> expect `EAA` (proves the new key round-trips)

---

## 7. Then build: Integration page

Paste `LOVABLE_PROMPT_5_INTEGRATION_PAGE.md` into Lovable.
It also asks Lovable to check the suspected dispatcher re-send bug (section 7) —
make sure it reports what it found, do not let that answer get skipped.

## 8. Then prove the pipe

On `/dashboard/integration`, click "Send test event" with a `test_event_code` from
Events Manager -> your dataset -> Test Events.
Success = Meta's raw JSON shows `events_received: 1`, and the event appears live in
the Test Events tab. THIS is the moment the product is real, and the core beat of
the App Review screencast.

---

## After that, in priority order

1. Wire the cron for `capi-dispatcher` (route exists; nothing calls it) — AFTER the
   re-send bug is confirmed fixed, not before.
2. Meta leadgen webhook subscription (Page object -> `leadgen` field) using
   `META_VERIFY_TOKEN` b862a6dc60f1bf56f76e04cd193e3ae2. Endpoint already verified live.
3. Add the lead-ads use case to the Meta app so `leads_retrieval` becomes requestable.
4. Confirm `/data-deletion`'s promises exist in the UI: a delete-account control AND a
   disconnect-Meta control. Reviewers follow those steps literally.
5. Become a Tech Provider (slow, external — start it in parallel with the above).
6. Funnel dashboard (Submitted -> Contacted -> Qualified -> Booked -> Purchased with
   cost-per-qualified-lead). Highest-value retention UI; the CAPI sync itself is
   invisible plumbing.
