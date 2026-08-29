# AdsPro — Getting Real Leads In (plain-English runbook)

Written 2026-08-27. Everything here is YOU clicking in Meta's website.
The code is finished and already live. These clicks are the last thing standing between
"almost done" and "done".

## What we're actually doing, in one sentence

Right now AdsPro can SEND information to Meta, but Meta has never SENT A LEAD to AdsPro.
We're switching on that direction. Think of it as plugging in the other end of the cable.

---

# BEFORE YOU START — pick your Facebook Page

These are your Facebook Pages. The long number is the Page's ID.

| Page name | Its ID number |
|---|---|
| Kaizen | `103144134846357` |
| EduEarn.in | `404251806108429` |
| Learnwadarsh Connected Page | `826525770539148` |
| **Nevorai** | `1126670470531846` |
| Xento | `1338642339324209` |
| ADARSH CHATURVEDI | `2272333342988759` |

## *** DECIDED 2026-08-27: use Nevorai, Page ID `1126670470531846` ***

Adarsh confirmed lead ads will run from the ad-ready Nevorai Page.

CORRECTION (2026-08-27): there is only ONE Nevorai Page. An earlier note in this file
claimed there were two — that was wrong.

Facebook exposes the same Page under two different web addresses:
- `facebook.com/profile.php?id=61590241615463` — the public profile-style link
- Page ID `1126670470531846` — the ID Meta's ads system, Graph API, and the leadgen
  webhook all use. THIS is the one AdsPro needs.

Confirmed three independent ways:
1. `ads_get_user_pages` returns Nevorai = `1126670470531846`
2. Adarsh's own Ads Manager URL carries `page_id=1126670470531846` while managing the
   Nevorai business portfolio
3. "Pages you manage" lists exactly one Nevorai

RULE FOR THIS APP: a `profile.php?id=` number is NOT the Page ID for API purposes.
Always take the Page ID from Graph API / Ads Manager, never from the profile URL.

Every `1126670470531846` below is already filled in. Nothing left to substitute.

---

# STEP 1 — Tell AdsPro which Page (2 minutes)

1. Open https://adsproindia.com/dashboard/integration
2. Look for a box labelled **"Facebook Page ID"**
3. Paste your Page's ID number into it
4. Click Save

Then message Claude: **"Page ID saved"** — Claude will check the database and confirm it
really saved. That box has never been used before, so it's worth confirming.

---

# STEP 2 — Tell Meta where to send leads (5 minutes)

1. Go to https://developers.facebook.com/apps and open **AdsPro India**
2. In the left menu click **Webhooks**
3. In the dropdown at the top, choose **Page**
4. Click **Subscribe to this object**
5. Paste these two values:

   Callback URL:
   ```
   https://adsproindia.com/api/public/webhooks/meta-leadgen
   ```

   Verify Token:
   ```
   b862a6dc60f1bf56f76e04cd193e3ae2
   ```

6. Click **Verify and Save**

It should succeed straight away. Claude already tested this exact handshake — it works.

7. Now you'll see a long list of things you can subscribe to. Find the row called
   **`leadgen`** and click **Subscribe** next to it.

---

# STEP 3 — Connect your actual Page (10 minutes) — *** DON'T SKIP THIS ***

Step 2 only told Meta "my app wants Page events". It did NOT connect your specific Page.
Without this step you will get zero leads and everything will look correctly set up.
This is the single most common reason this breaks.

1. Go to https://developers.facebook.com/tools/explorer/
2. Top right, in the **Meta App** dropdown, choose **AdsPro India**
3. Just below it there's a dropdown that says **User or Page** — click it and choose
   **Get User Access Token**
4. A permissions list appears. Tick these two:
   - `pages_show_list`
   - `pages_manage_metadata`
5. Click **Generate Access Token** and approve the Facebook popup
6. **Now the important bit:** click that **User or Page** dropdown again. This time,
   under a heading called **Page Access Token**, choose your Page.

   You must do this. If you skip it you're still holding a "user" pass instead of a
   "page" pass, and the next command will look like it worked but won't do anything.

7. Near the address bar of the tool, change the method dropdown from **GET** to **POST**
8. In the long text box, type exactly this (replace 1126670470531846 with your number):

   ```
   1126670470531846/subscribed_apps?subscribed_fields=leadgen
   ```

9. Click **Submit**. You should see:

   ```json
   { "success": true }
   ```

### Check it really worked

Change the method back to **GET**, and in the text box type:

```
1126670470531846/subscribed_apps
```

Click Submit. You should see **AdsPro India** listed, with `leadgen` next to it.

If instead you see `"data": []` (an empty list), it did NOT work — go back to point 6.
You were still on the user pass, not the page pass.

**Don't worry:** this does not change or break the Meta connection already saved inside
AdsPro. It's a separate temporary pass, used once, in this tool only.

---

# STEP 4 — Send yourself a fake lead (3 minutes)

1. Go to https://developers.facebook.com/tools/lead-ads-testing
2. Choose your Page
3. Choose one of your lead forms

   **If no forms are listed**, you don't have one yet. Create a lead form first in Meta
   Business Suite (Page → Lead Forms), or by building a Lead Ad in Ads Manager.
   This tool cannot create one for you.

4. Click **Create Lead**

### IMPORTANT — what "success" looks like

The lead will arrive with **no ad name and no campaign name attached**. That is normal
and correct. This fake lead was never shown in a real ad, so there is no ad to name.

This test proves the pipe works: Meta can reach AdsPro, AdsPro recognises your Page, and
the lead gets saved. Ad and campaign names only ever appear on leads from real, live ads.

**Do not think it's broken because the ad column is empty.** It isn't.

---

# STEP 5 — Tell Claude, and Claude checks

Message Claude: **"Test lead sent"**

Claude runs one database check and tells you plainly whether it arrived, and if it didn't,
which step to redo.

---

# STEP 6 — The final proof (2 minutes)

Once the lead is showing in AdsPro:

1. Open the Leads page in AdsPro
2. Change that lead's status to **Qualified**
3. Wait 2 minutes (the system checks every 2 minutes automatically)
4. Message Claude: **"Set it to qualified"**

Claude confirms it was sent to Meta successfully. At that point the full circle is proven:
Meta sends AdsPro a lead → you mark it good → AdsPro tells Meta it was good.

**That is the core product finished.**

---
---

# TECHNICAL REFERENCE (ignore unless something breaks)

## Key values

| Field | Value |
|---|---|
| Callback URL | `https://adsproindia.com/api/public/webhooks/meta-leadgen` |
| Verify Token | `b862a6dc60f1bf56f76e04cd193e3ae2` |
| App ID | `1771096100977376` |
| Ad account in AdsPro | `act_863995570089897` |
| Dataset in AdsPro | `1293470716241461` ("Nevorai Pixel") |

## Pre-flight, verified 2026-08-27 05:45 UTC

| Check | Result |
|---|---|
| `GET /webhooks/meta-leadgen` + correct token | 200, echoes `hub.challenge` |
| same, wrong token | 403 |
| `POST` unsigned | 401 `invalid_signature` -> HMAC IS live in production |
| `accounts.meta_page_id` column | exists, value NULL |
| cron dispatcher | every 2 min, HTTP 200, 0 pending, 0 abandoned |
| status_events | 4, all `delivered` |

## Failure table

| Symptom | Cause |
|---|---|
| No lead row at all | Step 3 skipped, or done holding a USER token. Re-check `GET 1126670470531846/subscribed_apps`. |
| Logs show "unmatched" | `accounts.meta_page_id` doesn't match the Page that fired. Redo Step 1. |
| Meta reports delivery failure | App Dashboard -> Webhooks -> Page -> `leadgen` -> Recent Errors |

## Why `leads_retrieval` is not needed

Meta's leadgen webhook only ever delivers identifiers (`leadgen_id`, `page_id`, `form_id`,
`ad_id`). Meta's CAPI accepts `user_data.lead_id` (the leadgen_id) as the PREFERRED match
key for lead-ads conversions. So leads are stored with IDs and NULL PII, and
`leads_retrieval` approval later is pure enrichment on the same row, not a rewrite.

Consequence for CRM users: `POST /webhooks/status` can only match on `leadgen_id`, so a
CRM must send that as `lead_reference`. Phone/email matching 404s until enrichment lands.

## Two open items, not blocking

- Could not verify `leadgen_tos_accepted` — Meta's Ads MCP refuses ad account
  863995570089897 ("not enabled for the Ads MCP"). If the Page has never run a lead ad,
  accept the Lead Gen ToS at https://www.facebook.com/legal/leadgen/tos
- The ad account exposes a second dataset, "Nevorai Event Data" (`1849245963151995`).
  AdsPro is wired to `1293470716241461`. For Conversion Leads optimization the events must
  land on the dataset the live lead ads actually optimize against — confirm in Events
  Manager before relying on this in production.


## Which AD ACCOUNT to build the lead ad in

AdsPro is connected to ad account **`863995570089897`** (the one inside the Nevorai
business portfolio).

As of 2026-08-27 Ads Manager was open on a DIFFERENT ad account, `1511960912389401`,
which sits under "Other assets" and has no ads yet. A lead ad built there will produce
leads AdsPro is not watching, and the numbers will never line up.

Build the lead ad in `863995570089897`. Switch accounts using the dropdown at the top
left of Ads Manager -> Business portfolios -> Nevorai -> the account ending 0089897.
