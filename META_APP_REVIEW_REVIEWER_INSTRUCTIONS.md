# Meta App Review — Reviewer Instructions (copy-paste ready)

Submission `1773424157411237` — AdsPro India, App ID `1771096100977376`
Written 2026-08-27, after verifying every label against **live production**
(adsproindia.com, signed in), not against specs.

---

## 1. What was verified live before writing this

| Checked | Result |
|---|---|
| `/dashboard/settings` route published to production | YES — page renders |
| `POST /api/public/account/disconnect-meta` | 401 unauthed (exists; bogus API path returns 404) |
| `POST /api/public/account/delete` | 401 unauthed (exists) |
| Sidebar nav, exact order | Dashboard / Leads / Deliveries / Integration / Settings |
| Settings section headings | "Your account", "Meta connection", "Danger zone" |
| Settings buttons | "Sign out", "Disconnect Meta", "Delete my account and all data" |
| Delete confirm field label | "Type DELETE to confirm" |
| Delete button disabled until DELETE typed | YES — button is not in the interactive tree while disabled |
| `/data-deletion` matches the UI word for word | YES |
| Leads table columns | Created / Leadgen ID / Campaign / Ad / Current status / Set status |
| Delivery log shows Meta's verbatim body | YES — `events_received: 1` visible |
| Route `/leads` and `/deliveries` | Top-level, NOT `/dashboard/leads` |

**Two labels could not be verified** because the live account is already connected:
the Meta OAuth button in its disconnected state, and the Page-card button on a
first-ever connect (connected state shows "Change Page" -> "Switch Page").
Confirm both on the reviewer test account in step 2 before pasting.

---

## 2. THREE decisions to make before pasting anything

### 2a. Reviewer test login — REQUIRED, does not exist yet

AdsPro is behind a login, so Meta requires working credentials. Do **not** give
them your own account (`teamnevorai@gmail.com`) — a reviewer following the
instructions literally will reach the Danger zone.

Create a throwaway account at https://adsproindia.com/auth -> "Sign up".
Suggested: `review@adsproindia.com` with a simple password you don't reuse.
Leave it **disconnected from Meta** — the reviewer connects their own assets,
which is exactly what demonstrates the permission.

While you're in that fresh account, write down the two unverified labels above.

### 2b. `leads_retrieval` — the real rejection risk

AdsPro does **not** currently call `GET /{leadgen_id}`. Confirmed in the database:
the one real Meta lead (`1862460961805586`) has `phone_hash` NULL, `email_hash`
NULL, and `raw_field_data` holding only the webhook envelope. The Leads table has
no name, email or phone column.

`leads_retrieval` is needed as a **subscription gate** —
`POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` fails without it
(`(#200) To subscribe to the leadgen field, one of these permissions is needed`).
That is true, and it is written up honestly below.

The risk: a reviewer opens the Leads screen expecting to see retrieved lead data
and sees ID columns only. The permission is literally named "leads retrieval".

**Recommendation — build the enrichment first (one Lovable prompt), then submit.**
On webhook receipt, call `GET /{leadgen_id}?fields=field_data`, display the lead's
**full name** in the Leads table, and keep phone/email **hashed** as today. That
turns the weakest part of the submission into a textbook demo, and it is something
advertisers actually want. `leads_retrieval` is already "Ready for testing" on your
own Page, so you can build and record it today without waiting for approval.

Faster alternative if you'd rather not wait: submit `ads_management` now (its
evidence is strong — the Delivery Log shows `events_received: 1`) and hold
`leads_retrieval` for a second submission after the enrichment ships.

### 2c. You are probably submitting too few permissions

Page auto-connect — the feature shipped yesterday — needs more than the two
permissions in this submission. For AdsPro to work on **another business's**
assets, all of these need Advanced Access:

| Permission | Why AdsPro needs it | In submission? |
|---|---|---|
| `ads_management` | list ad accounts/datasets; POST Conversions API events | yes |
| `leads_retrieval` | subscribe the Page to the `leadgen` webhook field | yes |
| `pages_show_list` | populate the Page picker | **check** |
| `pages_manage_metadata` | `POST /{page-id}/subscribed_apps` | **check** |
| `business_management` | resolve ad accounts under a business portfolio | **check** |
| `ads_read` | Insights sync (analytics Phase A, later) | optional now |

All six are in the OAuth scope string the app already requests. Submitting only two
means a second review round before you can onboard a paying client. Add the missing
ones to **this** submission if the dashboard still lets you.

---

## 3. `ads_management` — reviewer instructions

Paste into the "How will your app use this permission / instructions for reviewer" box.

```
AdsPro (https://adsproindia.com) is a lead-quality feedback tool for advertisers
running Meta Lead Ads. It sends lead-outcome events (Contacted, Qualified,
Disqualified, Scheduled, No-show, Purchased) back to the advertiser's own dataset
through the Conversions API, so Meta can optimise delivery toward leads that
actually convert (Conversion Leads), not just form submissions.

ads_management is used for exactly two things:

1. READ — list the ad accounts and datasets the signed-in user already has access
   to, so they can choose which one AdsPro should send events to.
2. WRITE — limited strictly to the Conversions API events endpoint for the dataset
   the user selected.

AdsPro never creates, edits, pauses or deletes campaigns, ad sets, ads or
creatives, and never spends budget.

TEST LOGIN
URL:      https://adsproindia.com/auth
Email:    <<PASTE REVIEWER EMAIL>>
Password: <<PASTE REVIEWER PASSWORD>>

STEPS TO REPRODUCE

1.  Sign in at https://adsproindia.com/auth with the credentials above.
    You land on the Dashboard.
2.  Click "Integration" in the left sidebar.
3.  Click "Connect Meta" and authorise with a Facebook account that has an ad
    account and a Page. You are returned to AdsPro.
4.  Select an ad account and a dataset from the two dropdowns and save. This is
    the only place AdsPro reads ad-account data.
5.  Click "Leads" in the left sidebar. Pick any lead and choose "Qualified" in the
    "Set status" column.
6.  A background dispatcher runs every two minutes and sends a Lead_Qualified
    server event to the dataset selected in step 4, via the Conversions API.
7.  Click "Deliveries" in the left sidebar. The new row shows the Meta event name,
    HTTP 200, and Meta's verbatim response body, for example:
    {"messages":[],"fbtrace_id":"AEAz8UKkZ52gGoEgIAlCkmZ","events_received":1}
    "events_received": 1 confirms Meta accepted the event.

TO SEE IT IMMEDIATELY instead of waiting two minutes: on the Integration page use
"Send test event". It runs the real delivery path. You may paste a Test Event Code
from Events Manager -> your dataset -> Test Events, and the event will appear
there rather than affecting optimisation.

TO REVOKE ACCESS: Settings -> Meta connection -> "Disconnect Meta". AdsPro
unsubscribes the Page, calls DELETE /me/permissions to revoke every granted
permission on Meta's side, and erases the stored access token, ad account,
dataset and Page.
```

---

## 4. `leads_retrieval` — reviewer instructions

Use this **as-is** if you submit without the enrichment build (2b). If you build
the enrichment first, replace the DATA HANDLING paragraph — a note follows.

```
AdsPro receives the advertiser's Meta Lead Ads submissions so their sales team can
record each lead's outcome, and so those outcomes can be synced back to Meta via
the Conversions API for Conversion Leads optimisation.

leads_retrieval is required to subscribe the advertiser's Page to the "leadgen"
webhook field. Calling
POST /{page-id}/subscribed_apps?subscribed_fields=leadgen
without it returns:
(#200) To subscribe to the leadgen field, one of these permissions is needed
This permission is what allows the advertiser's leads to reach AdsPro at all.

TEST LOGIN
URL:      https://adsproindia.com/auth
Email:    <<PASTE REVIEWER EMAIL>>
Password: <<PASTE REVIEWER PASSWORD>>

STEPS TO REPRODUCE

1.  Sign in at https://adsproindia.com/auth and click "Integration" in the left
    sidebar.
2.  Connect Meta if not already connected ("Connect Meta").
3.  In the "Facebook Page" card, choose the Page your lead ads run from in the
    dropdown labelled "Choose the Page your lead ads run from", then confirm.
    AdsPro calls POST /{page-id}/subscribed_apps with subscribed_fields=leadgen.
    On success the card reads:
    "Connected — leads from this Page will arrive automatically"
    with the Page name, Page ID and the subscription timestamp.
    On failure AdsPro shows Meta's verbatim error and deliberately does NOT save
    the Page, so a dead subscription can never look connected.
4.  Open Meta's Lead Ads Testing Tool for that Page and form and create a test
    lead. (The tool allows one test lead per form — delete the previous one first.)
5.  Return to AdsPro and click "Leads" in the left sidebar. The lead appears
    within seconds, identified by its Meta leadgen_id, with the form and ad it
    came from.
6.  Set that lead's status to "Qualified". Within two minutes the "Deliveries"
    page shows a Lead_Qualified event delivered to Meta with
    "events_received": 1.

DATA HANDLING
AdsPro stores only identifiers: the leadgen_id, form_id, ad_id and timestamp.
It does not store the lead's name, email address or phone number. Meta's
Conversions API accepts lead_id as the preferred match key for lead-ads
conversions, so the full optimisation loop works without AdsPro holding any
personal data. Lead records are retained for a maximum of 90 days.

Users can revoke access at any time via Settings -> Meta connection ->
"Disconnect Meta" (which calls DELETE /me/permissions), or delete every record
permanently via Settings -> Danger zone. Both paths are documented at
https://adsproindia.com/data-deletion
```

**If you ship the enrichment first**, swap the DATA HANDLING paragraph for:

```
DATA HANDLING
On receiving the leadgen webhook AdsPro calls GET /{leadgen_id} to retrieve the
lead's submitted fields. The lead's name is displayed to the advertiser who owns
the ad. Email address and phone number are hashed (SHA-256) before storage and are
never stored or transmitted in plain text. Lead records are retained for a maximum
of 90 days.
```
...and add to the steps: "The lead's name from the Instant Form is shown in the
Leads table" at step 5.

---

## 5. Screencast — shot list

One video covers both permissions. Meta rejects screencasts that skip the
authorisation dialog, so film the whole thing in one take, no cuts.

1. Browser at `https://adsproindia.com/auth`. Sign in with the **reviewer** account.
2. Dashboard, disconnected state, visible.
3. Integration -> "Connect Meta" -> **the full Facebook permission dialog on screen,
   readable** -> Continue.
4. Back in AdsPro: pick ad account, pick dataset, save. Show them selected.
5. Facebook Page card: pick the Page, confirm, show
   "Connected — leads from this Page will arrive automatically".
6. Switch tab to Meta's Lead Ads Testing Tool. Create a test lead on that form.
7. Back to AdsPro -> Leads. Show the lead appearing with its leadgen_id.
8. Set status to "Qualified".
9. Wait, or use Integration -> "Send test event".
10. Deliveries -> show the row: `Lead_Qualified`, `200`, `events_received: 1`.
11. Settings -> show "Meta connection" and "Danger zone". Click "Disconnect Meta",
    show the confirmation dialog. **You may confirm it — this is the reviewer
    account, not yours.** Show the connection is gone.

Step 11 is worth the extra 20 seconds: reviewers specifically check that revocation
exists and works.

---

## 6. Pre-submit checklist

- [ ] Reviewer test account created; credentials pasted into both permission boxes
- [ ] The two unverified labels confirmed on that fresh account (2a)
- [ ] Decision made on `leads_retrieval` — submit now, or build enrichment first (2b)
- [ ] Missing permissions added to the submission, or consciously deferred (2c)
- [ ] Production published — reviewers test adsproindia.com, never a preview URL
- [ ] Screencast recorded per the shot list, uploaded
- [ ] `/privacy`, `/terms`, `/data-deletion` all live and consistent (verified today)
- [ ] Business verification complete (done — Nevorai portfolio)

## 7. Known-good facts you may be asked for

| Field | Value |
|---|---|
| App name | AdsPro India |
| App ID | 1771096100977376 |
| Live URL | https://adsproindia.com |
| Privacy Policy | https://adsproindia.com/privacy |
| Terms | https://adsproindia.com/terms |
| Data deletion | https://adsproindia.com/data-deletion |
| OAuth callback | https://adsproindia.com/api/public/auth/meta/callback |
| Retention | 90 days from lead creation |
| PII stored | none today (identifiers only) — changes if 2b enrichment ships |
