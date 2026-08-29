# Prompt 17 — "Change ad account" on the Integration page

## Context — read this before writing any code
The database, tables, views, RPCs and cron jobs already exist and are correct. **This task
requires ZERO migrations and ZERO DDL.** Do not create, alter or drop any table, view,
column, policy or function. If you believe you need one, stop and say so instead.

The Integration page already has a **Facebook Page** card with a working "Change Page" flow.
There is currently NO equivalent for the **ad account** — the ad-account picker
(`/dashboard/select-ad-account`) only runs during first connect, so once an account is set up
there is no way in the UI to point it at a different Meta ad account. That is the gap.

An account's Meta wiring is three separate fields on `public.accounts`:
- `meta_page_id` — decides which AdsPro account an incoming lead belongs to (leads are routed
  by Page, nothing else)
- `meta_ad_account_id` — decides which ad account the spend/insights sync reads from
- `meta_dataset_id` — decides where Conversions API events are delivered

They are independent. Changing one must not disturb the other two.

## Task
Add a **Change ad account** control to the Integration page, directly mirroring the existing
"Change Page" pattern so the two read as one family.

1. Show the currently connected ad account id (e.g. `act_2447097022359700`) in a card, the
   same way the Page card shows the connected Page.
2. A "Change ad account" link opens the EXISTING ad-account picker flow. **Reuse
   `/dashboard/select-ad-account` — do not build a second picker and do not duplicate its
   Meta API calls.**
3. On save, write `meta_ad_account_id` only.

## Three requirements that are easy to get wrong
1. **Do NOT clobber `meta_dataset_id`.** The first-connect picker saves ad account AND dataset
   in one flow. When changing the ad account from Integration, the existing dataset must be
   preserved unless the user explicitly changes it. A blanked dataset silently breaks
   Conversions API delivery, and nothing in the UI would show it.

2. **Set `meta_ad_account_timezone` to NULL whenever `meta_ad_account_id` changes.** This is
   not optional. Meta reports insights in the AD ACCOUNT's timezone, and the insights fetcher
   SKIPS its timezone lookup when the column is already populated. Leaving the previous
   account's value carries an unverified timezone onto a different ad account and misfiles
   every lead near the day boundary. Nulling it forces a genuine re-fetch on the next sync.

3. **Read and write through the logged-in user's session, not the service role.** The tables
   are RLS-scoped to the owner and that is the real security boundary. This is the pattern
   already used by the `/performance` screen; keep it.

## Also show the user what changing it means
A short, plain line in the confirm step, not a wall of text:
> Spend and performance data will start coming from the new ad account. Leads are unaffected —
> those arrive from your connected Facebook Page.

That is accurate and it stops the most likely support question.

## Definition of done — answer each of these explicitly in your reply
1. Confirm you ran **zero** migrations and made **zero** schema changes.
2. Name the file(s) you changed and state whether you reused the existing picker route or
   wrote new picker code.
3. State exactly which columns your save path writes.
4. Confirm `meta_dataset_id` is preserved when only the ad account is changed, and say how you
   verified it.
5. Confirm `meta_ad_account_timezone` is set to NULL when `meta_ad_account_id` changes.
6. Confirm the read/write path uses the logged-in user's session, not the service role.
7. State whether the screen is published to adsproindia.com.
