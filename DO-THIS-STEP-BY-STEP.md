# AdsPro — Meta App Review: every step, in order

Do them in order. Do not skip. Do not think ahead.

*** Open this on your PHONE while you film, because the screen recording
    captures everything on your Mac. ***

===============================================================================
PART A — GET READY (before recording)
===============================================================================

1.  Quit WhatsApp. Click WhatsApp, then press Cmd + Q.
2.  Quit Terminal. Click Terminal, then press Cmd + Q.
3.  Quit anything else personal — Messages, Photos, email.
4.  Open Chrome. Close every tab except one.
5.  In that one tab, go to:  adsproindia.com
6.  If you are signed in, click **Sign out** at the bottom-left.
7.  You are now on the sign-in page.
8.  In Email type:      review@adsproindia.com
9.  In Password type:   88888888
10. Click **Sign in**.
11. You should now see "Dashboard" and a box saying "Connect Meta".
    STOP. Do not click anything else.
12. Make Chrome full screen (green button, top-left of the window).

===============================================================================
PART B — RECORD THE VIDEO
===============================================================================

13. Press Cmd + Shift + 5 together.
14. A small bar appears. Click the icon that says **Record Entire Screen**.
15. Click the **Record** button.
16. Count to 2 slowly. Now start.

17. Click the box that says "Workspace name (e.g. Acme Solar)".
18. Type:  Reviewer Test
19. Click the dark button **Connect Meta**.
20. A blue Facebook window opens asking for permissions.
21. *** DO NOT CLICK. Count slowly to 4. *** This is the most important moment
    in the whole video. If you rush here, Meta rejects it.
22. Now click the blue button to continue / approve.
23. Wait until you are back on AdsPro.

24. Click the dropdown for the **ad account**.
25. Let the list stay open. Count to 3.
26. Click any ad account in the list.
27. Click the dropdown for the **dataset**.
28. Let the list stay open. Count to 3.
29. Click any dataset in the list.
30. Click **Save**.

31. Click **Integration** in the left sidebar.
32. Find the box titled "Facebook Page".
33. Click its dropdown ("Choose the Page your lead ads run from").
34. Let the list stay open. Count to 3.
35. Click **Kaizen**.
    *** NOT Nevorai. Choosing Nevorai will break your live lead flow. ***
36. Click the button under it to confirm (says Connect or Connect Page).
37. Wait for the green line: "Connected - leads from this Page will arrive
    automatically". Count to 3 while looking at it.

38. Click **Sign out** at the bottom-left.
39. In Email type:     teamnevorai@gmail.com
40. In Password type:  your normal password
41. Click **Sign in**.
42. Click **Integration** in the left sidebar.
43. Scroll down to the box titled "Send test event".
44. LEAVE the "Meta test event code" box EMPTY. Do not type anything in it.
45. Click **Send test event**.
46. A response appears with:  "events_received":1
    Count to 4 while looking at it.
47. Click **Deliveries** in the left sidebar.
48. Look at the top row. Count to 3.
49. Look at the top menu bar of your Mac. Click the small **stop** square.
50. The video is saved on your Desktop as a .mov file.

*** WATCH THE VIDEO ONCE before uploading. Check: is the blue Facebook
    permission window clearly visible? Is any personal chat visible?
    If either is wrong, delete it and film again from step 5. ***

===============================================================================
PART C — UPLOAD THE VIDEO (same file, 5 times)
===============================================================================

51. Go back to Chrome. Open your App Review page:
    developers.facebook.com/apps/1771096100977376/app-review/submissions/
52. Click into your submission, then click **Allowed usage**.

53. Do this FIVE times, once for each of these cards:
       pages_show_list
       pages_manage_metadata
       pages_read_engagement
       business_management
       ads_management

    For each one:
       a. Click **Get started** on that card.
       b. Click **Upload file**.
       c. Choose the .mov from your Desktop.
       d. Wait for it to finish uploading.
       e. Click **Save**.

    The description and the tick box are already saved on all five.
    You are ONLY adding the video.

54. When all five cards show green ticks everywhere, click **Next**.

===============================================================================
PART D — DATA HANDLING
===============================================================================

Answer using these facts. They are true — I checked your database.

  Do you store personal information?          NO
  Do you sell or share data with others?      NO
  Do you transfer data to third parties?      NO
  How long do you keep data?                  90 days
  Is data encrypted?                          YES - encrypted at rest,
                                              all traffic over HTTPS
  Where is data stored?                       Supabase (Postgres), Mumbai, India
  What Meta data do you receive?              Ad account ID, dataset ID, Page ID,
                                              lead identifiers (leadgen_id,
                                              form_id, ad_id), access token

If a question is not on this list, answer it the plain honest way and move on.
Then click **Next**.

===============================================================================
PART E — REVIEWER INSTRUCTIONS
===============================================================================

  a. Open the file PASTE-1-ads_management.txt
  b. Select all (Cmd + A), copy (Cmd + C)
  c. Paste it into the instructions box
  d. If it asks "does your app need a login?" answer YES
        Email:    review@adsproindia.com
        Password: 88888888
  e. If there is a second box for leads_retrieval, paste
     PASTE-2-leads_retrieval.txt into it
  f. Click **Next**

===============================================================================
PART F — SUBMIT
===============================================================================

  a. Check every step at the top shows a green tick:
     Verification, App settings, Allowed usage, Data handling,
     Reviewer instructions
  b. Click **Submit for review**
  c. Done. Meta replies by email, usually in 3-7 days.

===============================================================================
IF SOMETHING GOES WRONG
===============================================================================

Screenshot it and send it. Do not guess and do not click Submit with a
red or empty step.
