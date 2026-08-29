# AdsPro — what it is, what's built, what's left
Plain English. Written 2026-08-28.

===============================================================================
PART 1 — THE PROBLEM ADSPRO SOLVES
===============================================================================

A business runs Facebook/Instagram lead ads. People fill in a form. Leads arrive.

The problem: Meta has no idea which of those leads were any good.

Meta sees "50 people filled the form" and decides the ad is working. But the
business knows only 4 of those 50 ever answered the phone, and only 1 bought.
Meta never learns that. So it keeps finding more of the cheap, useless kind of
lead — because form-fills are all it can measure.

The advertiser ends up paying for volume instead of customers.

WHAT ADSPRO DOES

AdsPro closes that loop. When the sales team marks a lead as Qualified, Booked
or Purchased, AdsPro tells Meta. Meta then learns what a good lead actually
looks like for that business, and starts finding more people like the ones who
bought — not more people who merely fill in forms.

Same ad spend. Better leads. That is the whole product.

IN ONE SENTENCE
"AdsPro tells Facebook which of your leads actually turned into money, so
Facebook stops sending you time-wasters."

WHO IT'S FOR
Any business running Meta lead ads with a sales team that follows up by phone
or WhatsApp — coaching centres, gyms, real estate, insurance, clinics,
education, and the agencies that run ads for them.

===============================================================================
PART 2 — WHAT IS BUILT AND PROVEN WORKING
===============================================================================

Everything below has been tested on a real Meta lead, not just written.

1. SIGN UP AND CONNECT
   A customer signs up with email and password, clicks "Connect Meta", and logs
   in with Facebook. AdsPro reads which ad accounts and pixels they have and
   lets them pick one. Their access key is encrypted before it is stored.

2. CONNECT THEIR FACEBOOK PAGE
   They pick their Page from a dropdown and click connect. AdsPro automatically
   tells Meta to start sending leads from that Page. This used to need a
   technical person running commands by hand; now it is one click.

3. LEADS ARRIVE AUTOMATICALLY
   When someone fills in the customer's lead ad form, the lead appears in AdsPro
   within seconds. AdsPro checks Meta's security signature so nobody can fake a
   lead, and ignores duplicates.

4. THE SALES TEAM MARKS THE OUTCOME
   Two ways:
   - By hand, from a dropdown in the Leads screen
   - Automatically from their CRM or Zapier, by sending AdsPro a message
   Six outcomes are supported: Contacted, Qualified, Not qualified, Booked,
   No-show, Purchased.

5. ADSPRO TELLS META, AUTOMATICALLY
   Every two minutes a background job sends those outcomes to Meta. If Meta is
   down or the connection fails, it retries with increasing gaps, and gives up
   cleanly after a while instead of retrying forever.

6. PROOF IT WORKED
   A Delivery Log shows every message sent to Meta, whether it succeeded, and
   Meta's exact reply. Nothing is hidden. If something breaks, you can see it.

7. THE CUSTOMER STAYS IN CONTROL
   A Settings page lets them disconnect Meta (which properly revokes access on
   Meta's side, not just locally) or permanently delete their account and every
   record. Privacy policy, terms and data-deletion pages are all live.

8. BUILT FOR MANY CUSTOMERS FROM DAY ONE
   The database keeps each customer's data separated at the database level, so
   one customer can never see another's leads.

PRIVACY POSITION (a genuine strength)
AdsPro stores NO personal information. Not names, not emails, not phone numbers
— only Meta's internal ID numbers. Meta accepts those IDs as the best way to
match conversions, so everything works without holding anyone's private data.

===============================================================================
PART 3 — WHAT IS NOT BUILT YET
===============================================================================

*** THE BIG ONE ***

A. NO WAY TO TAKE MONEY
   There is no pricing page, no plans, no payment gateway, no subscriptions.
   Today a customer could use AdsPro completely free forever. Before selling to
   anyone, this has to exist. This is the single biggest gap.

THINGS THAT WILL BREAK QUIETLY IF LEFT

B. NOBODY IS WARNED WHEN A CONNECTION EXPIRES
   Meta access keys die after about 60 days. When that happens, lead syncing
   stops silently — no email, no warning banner. The customer would only find
   out by noticing their ads got worse. This needs an expiry check and an alert.

C. THE 90-DAY DELETION PROMISE IS NOT ENFORCED
   The privacy policy says lead records are deleted after 90 days. No job
   actually does this yet. It is a promise the software does not keep — worth
   fixing before it becomes a compliance problem.

FEATURES CUSTOMERS WILL ASK FOR

D. A REAL DASHBOARD
   Right now there are raw lists. There is no funnel view showing
   Submitted -> Contacted -> Qualified -> Booked -> Purchased, no cost per
   qualified lead, no comparison of which campaign produces real customers.
   This is what makes the value visible. It needs Meta spend data pulled in and
   a few weeks of real campaigns running before it shows anything.

E. LEAD NAMES
   The Leads screen shows ID numbers, not names. It works, but it looks
   unfinished to a customer. Adding names is a small change.

F. AGENCY MODE
   One login managing several clients' ad accounts. Metrol Media — the company
   that asked for this to be built — runs ads for their own clients, so they
   will need it. Deliberately postponed until the core was proven.

G. ONBOARDING POLISH
   Empty screens, guidance for a first-time user, better error messages.

WAITING ON META

H. APP REVIEW — SUBMITTED 2026-08-28, awaiting result
   Until approved, AdsPro only works on your own Facebook assets. No customer
   can connect. This is the wall between the product and revenue.

I. MARKETING API TIER — deliberately left for a second round
   Governs how many client ad accounts you can serve. Needs 500 API calls;
   300 are done. Requires a live ad running to finish quickly.

J. TECH PROVIDER STATUS — needed later to access other businesses' ad accounts.

===============================================================================
PART 4 — HONEST SUMMARY
===============================================================================

The hard part is finished. The thing that is difficult to build — leads flowing
in from Meta automatically, outcomes flowing back automatically, reliably,
unattended, with proof — works and has been proven on a real lead.

What remains is mostly ordinary product work: a way to charge money, a
dashboard, alerts, and polish. None of it is technically risky.

The order that makes sense:
   1. Meta approval          (waiting — blocks everything)
   2. Billing                (blocks revenue)
   3. Expiry alerts          (protects customers you already have)
   4. 90-day deletion job    (keeps the promise you published)
   5. Dashboard              (needs real campaign data first)
   6. Agency mode            (when Metrol Media needs it)
