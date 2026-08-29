# AdsPro screencast — exactly what to film

ONE video. Upload the SAME file to all five cards:
pages_show_list, pages_manage_metadata, pages_read_engagement,
business_management, ads_management.

No lead form needed. No Lead Ads Testing Tool. `leads_retrieval` is already
approved-green and needs no video, so the CAPI delivery is proven with the
"Send test event" button instead of a real lead.

Length: 2-4 minutes. One take, no cuts, no edits. Meta rejects heavily edited videos.

---

## BEFORE YOU HIT RECORD

1. Sign OUT of AdsPro. Then sign IN as **review@adsproindia.com** (the throwaway
   account). It must be in the DISCONNECTED state so the connect flow is on camera.

2. *** PICK A PAGE THAT IS NOT "Nevorai" *** — use **Kaizen** or **EduEarn.in**.
   Nevorai is subscribed to your live Xento account. Subscribing it from the reviewer
   account would re-point your production lead flow at the test account.

3. Close WhatsApp, Messages, and any window with personal chats. The whole screen is
   being recorded and Meta staff will watch it.

4. Full-screen the browser. One tab only.

5. Recording: press **Cmd + Shift + 5** -> "Record Entire Screen" -> Record.
   Stop from the menu bar icon when done. Saves to Desktop as .mov.

---

## WHAT TO FILM, IN ORDER

**1. Sign in**
Show `https://adsproindia.com/auth`. Type the reviewer email and password. Sign in.
You land on the Dashboard showing the "Connect Meta" card.

**2. Start the connection**
Type a workspace name into the field `Workspace name (e.g. Acme Solar)` — for example
"Reviewer Test". Click **Connect Meta**.

**3. THE PERMISSION DIALOG — the most important shot**
Facebook's blue permission dialog opens. PAUSE here for 3-4 seconds so the whole list of
requested permissions is readable on screen. Do not rush this. A screencast that skips or
blurs this dialog is the single most common rejection.
Then click Continue / approve all.

**4. Ad account + dataset**  (proves business_management + ads_management READ)
You return to AdsPro. Open the ad account dropdown so the list of ad accounts is visible
for a couple of seconds. Pick one. Then open the dataset dropdown, let it show, pick one.
Save.

**5. Page list**  (proves pages_show_list)
Click **Integration** in the left sidebar. On the "Facebook Page" card, open the dropdown
labelled "Choose the Page your lead ads run from". HOLD IT OPEN for 3 seconds so the list
of Pages is clearly visible. Select **Kaizen** (not Nevorai).

**6. Subscribe the Page**  (proves pages_manage_metadata + pages_read_engagement)
Confirm the selection. Wait for the green state and let the camera rest on it:
   "Connected - leads from this Page will arrive automatically"
with the Page name, Page ID and the subscribed timestamp visible. Hold 3 seconds.

**7. SWITCH ACCOUNTS — keep recording**
*** The reviewer account has ZERO leads, and "Send test event" needs a lead to exist
(capi_delivery_logs -> status_events -> leads). It WILL fail there. ***
Click **Sign out**. Sign back in as **teamnevorai@gmail.com** (your real account, already
connected). Signing out and in on camera is fine and reads as proof the screens are real.

**8. Send a real conversion event**  (proves ads_management WRITE)
Click **Integration**. Scroll to "Send test event". LEAVE the "Meta test event code" field
BLANK — it is optional. Click **Send test event**. Meta's verbatim response appears; hold
on it so `events_received: 1` is readable.

**9. Show the delivery log**
Click **Deliveries** in the left sidebar. The new row shows the Meta event name, HTTP 200,
Delivered, and Meta's response body. Hold 3 seconds. Stop recording.

---

## DO NOT FILM THE DISCONNECT

*** Skipping this on purpose. ***
"Disconnect Meta" calls `DELETE /me/permissions`, which revokes the app's permissions for
your whole FACEBOOK USER — not just the reviewer account. Since the same Facebook login
powers your live Xento setup, doing it on camera would kill your production token and stop
real lead syncing until you reconnect.

None of the five permissions being reviewed require it. Your `/data-deletion` page already
documents revocation in writing, which is what the policy actually asks for.

---

## AFTER RECORDING — CLEAN UP

The reviewer account is now subscribed to the Kaizen Page. Leave it; it is harmless and it
matches what the reviewer will see if they follow your written instructions.

Confirm your live setup is untouched: sign in as teamnevorai@gmail.com and check
Integration still reads "Nevorai (1126670470531846)" and "Connected".

---

## UPLOADING

Same .mov file, five times, on these cards:
- pages_show_list
- pages_manage_metadata
- pages_read_engagement
- business_management
- ads_management

Each card: **Get started** -> drag the video into "Drag and drop your file" -> Save.
The description and the agreement tick are already saved on all of them.
