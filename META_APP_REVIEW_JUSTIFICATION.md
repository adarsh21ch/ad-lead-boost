# Meta App Review — use-case text for AdsPro India

Use this when submitting `ads_management` and `leads_retrieval` for review in
developers.facebook.com → App Review → Permissions and Features.

## `leads_retrieval`

**How will your app use this permission?**
> AdsPro receives lead submissions from Meta Lead Ads (Instant Forms) via the leadgen
> webhook, so advertisers using our platform can view and follow up on their leads outside
> of Meta. We store each lead's contact details and link them to the ad/campaign that
> generated them, so the advertiser's sales team can update lead outcomes (contacted,
> qualified, booked, etc.) in our dashboard.

**Screencast requirement:** record a short video showing:
1. Advertiser connects their ad account via "Connect Meta" (OAuth)
2. A test lead submitted through their Instant Form appears in the AdsPro dashboard
3. Advertiser marks it "Qualified"

## `ads_management`

**How will your app use this permission?**
> AdsPro reads the advertiser's connected ad account and Meta Pixel/dataset ID so it can
> send lead-status events (Qualified, Booked, Purchased) back to Meta via the Conversions
> API / Conversion Leads feature. This lets Meta's delivery algorithm optimize toward leads
> that actually convert into qualified prospects, not just form submissions. AdsPro does not
> create, edit, or manage ad campaigns on the advertiser's behalf — read-level access to the
> ad account and write-level access limited to the Conversions API event endpoint only.

**Screencast requirement:** same video as above, extended to show:
4. The delivery log confirming the "Qualified" event was sent to Meta successfully

## General notes for the reviewer

- AdsPro is a lead-quality-feedback tool for advertisers running Meta Lead Ads, built by
  Nevorai (India). It does not sell, share, or use lead data for any purpose other than the
  advertiser's own lead-status sync back to their own ad account.
- All PII (phone, email) is hashed before storage and before being sent to Meta's
  Conversions API, per Meta's Business Tools Terms.
- Data retention: hashed lead data is purged automatically after [N days — decide before
  submitting].

## Before submitting

- [ ] Privacy Policy URL live (required — must describe lead data handling specifically)
- [ ] Terms of Service URL live
- [ ] App icon + business verification complete in Meta Business Manager
- [ ] Screencast recorded showing the full flow above, end to end, on a **real** (not
      sandbox) test ad account
