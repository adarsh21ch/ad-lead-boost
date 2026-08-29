# Allowed usage — one description per permission

Where: App Review submission -> Allowed usage -> the "Get started" button on each card
-> the box headed "Please provide a detailed description of how your app uses the
permission or feature requested..."

Paste the matching block, tick the agreement checkbox, upload the screencast where one is
required, then Save.

Screencast needed for: pages_show_list, pages_manage_metadata, business_management,
ads_management. THE SAME VIDEO FILE FOR ALL FOUR.
No screencast needed for: leads_retrieval, Marketing API Access Tier, public_profile.

===============================================================================
1. pages_show_list
===============================================================================
AdsPro is a lead-quality feedback tool for advertisers running Meta Lead Ads. After an
advertiser connects their Meta account, AdsPro shows them the list of Facebook Pages they
manage so they can select the Page their lead ads run from. We read the person's Page list
and render the Page names and IDs in a dropdown on our Integration page; the advertiser
picks one.

Value to the person using the app: without this they would have to locate and type a raw
numeric Page ID by hand, which is error-prone and a step most non-technical advertisers
cannot complete. The dropdown makes setup a single click.

Why it is necessary: selecting the correct Page is what determines where AdsPro listens
for that advertiser's leads. We store only the selected Page's ID and name. AdsPro does
not post to the Page, read its content, or access its followers.

===============================================================================
2. pages_manage_metadata
===============================================================================
AdsPro subscribes the advertiser's selected Page to the "leadgen" webhook field so that
submissions from their Meta Lead Ads instant forms are delivered to AdsPro in real time.
We call POST /{page-id}/subscribed_apps with subscribed_fields=leadgen exactly once, at
the moment the advertiser clicks Connect on our Integration page.

We use this permission only to create that webhook subscription. AdsPro never updates Page
settings, Page information, or any other Page metadata.

Value to the person using the app: this is what makes their own leads appear inside
AdsPro automatically, with no manual export or CSV upload. It is the core function they
signed up for.

Reliability detail: if the subscription call fails, AdsPro displays Meta's verbatim error
and deliberately does not save the Page, so a Page with a broken subscription can never
appear connected while silently delivering nothing.

===============================================================================
3. business_management
===============================================================================
Many advertisers run their Meta Lead Ads through a Business portfolio rather than a
personal ad account. AdsPro reads the businesses and the ad accounts the signed-in person
already has access to, so it can present those ad accounts and their datasets in a
dropdown for the person to choose from during setup.

AdsPro does not create, modify, or delete businesses, business users, or asset
assignments. The access is read-only and used purely to populate the setup dropdowns.

Why it is necessary: without it, any advertiser whose ad account sits under a Business
portfolio cannot complete setup, because AdsPro would be unable to see the ad account or
the dataset that their lead-outcome events must be sent to.

===============================================================================
4. leads_retrieval
===============================================================================
AdsPro receives the advertiser's own Meta Lead Ads submissions so their sales team can
record each lead's real outcome (contacted, qualified, booked, purchased), and so those
outcomes can be sent back to Meta through the Conversions API for Conversion Leads
optimisation.

leads_retrieval is required in order to subscribe the advertiser's Page to the "leadgen"
webhook field. Calling POST /{page-id}/subscribed_apps?subscribed_fields=leadgen without
it returns: "(#200) To subscribe to the leadgen field, one of these permissions is
needed". This permission is therefore what allows an advertiser's leads to reach our
product at all.

Value to the person using the app: Meta's delivery algorithm learns which leads actually
converted rather than optimising only for form submissions, so the advertiser's cost per
qualified lead falls.

Data handling: AdsPro stores only identifiers — the leadgen_id, form_id, ad_id and
timestamp. It does not store lead names, email addresses or phone numbers. Meta's
Conversions API accepts lead_id as the preferred match key for lead-ads conversions, so
the full loop works without our system holding any personal data. Lead records are
retained for a maximum of 90 days.

===============================================================================
5. ads_management
===============================================================================
AdsPro uses ads_management for exactly two things:

1. READ — list the ad accounts and datasets the signed-in person already has access to,
   so they can choose which dataset AdsPro should send lead-outcome events to.
2. WRITE — strictly limited to the Conversions API events endpoint for the dataset the
   person selected. AdsPro posts server events such as Lead_Qualified, Schedule and
   Purchase, keyed on the Meta lead_id.

AdsPro never creates, edits, pauses or deletes campaigns, ad sets, ads or creatives, and
never spends budget.

Value to the person using the app: their Meta campaigns begin optimising toward leads that
actually convert into customers instead of leads that merely fill in a form. This is the
entire purpose of the product.

Why it is necessary: without ads_management AdsPro cannot see which datasets the
advertiser owns, and cannot deliver the conversion events that make Conversion Leads
optimisation work.

===============================================================================
6. pages_read_engagement
===============================================================================
AdsPro displays the connected Page's name alongside its subscription status, so the
advertiser can confirm at a glance that AdsPro is listening to the correct Page and that
their leads will arrive. This read-only Page information is shown on our Integration page
and Dashboard.

Meta's App Review flow also lists pages_read_engagement as a required dependency for
ads_management, which AdsPro needs in order to send lead-outcome events to the
advertiser's dataset through the Conversions API.

AdsPro does not read Page posts, comments, messages, or follower data, and does not use
Page content for any purpose.

===============================================================================
7. Marketing API Access Tier
===============================================================================
AdsPro is a multi-tenant SaaS product. Each customer connects their own Meta ad account,
and AdsPro sends that customer's lead-outcome events to that customer's own dataset
through the Conversions API, so Meta can optimise their campaigns toward leads that
convert.

Standard access limits the app to ad accounts it owns, which means AdsPro can serve only
its own advertising and no customers at all. Advanced access to the Marketing API is
required so that each advertiser who connects their own ad account can have their lead
outcomes synced back to Meta.

AdsPro's write access is confined to the Conversions API events endpoint. It does not
create, edit, pause or delete campaigns, ad sets, ads or creatives, and does not spend
budget on any account.

===============================================================================
8. public_profile
===============================================================================
ALREADY COMPLETE — shows a green tick and an "Edit" button. Nothing to do.
