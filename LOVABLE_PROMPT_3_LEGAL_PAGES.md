# Lovable Prompt — Privacy Policy, Terms, and Data Deletion pages

Build three public pages (no auth required), linked from the landing page footer.
These are hard requirements for Meta App Review and for saving App Domains in the
Meta app settings, so they must be real content — not lorem/boilerplate.

## Routes
- `/privacy` — Privacy Policy
- `/terms` — Terms of Service
- `/data-deletion` — Data Deletion Instructions

Add a footer to the landing page with links to all three. Style them to match the
existing site (same fonts/colors), simple readable prose layout, max ~720px column.
Include "Last updated: 26 August 2026" at the top of each.

## Legal entity (use verbatim)
- Trade name: **Nevorai Technologies** (product: **AdsPro**, adsproindia.com)
- Legal name / proprietor: **Adarsh Chaturvedi**
- Constitution: Sole proprietorship, registered in India
- GSTIN: **23CBCPC3986J1ZN**
- Registered address: Lakhera Tighadda, Seetaram Colony, Nandishwar Temple,
  Chetgiri Colony, Chhatarpur, District Chhatarpur, Madhya Pradesh 471001, India
- Contact email: **socialwiire@gmail.com**
- Governing law: India. Jurisdiction: courts at Chhatarpur, Madhya Pradesh.

## PRIVACY POLICY — required content

Be specific about lead data. Generic policies get rejected at Meta App Review.

**1. Who we are** — entity details above. Explain AdsPro is a tool that syncs lead
outcome data back to Meta's Conversions API on behalf of advertisers.

**2. Two kinds of people whose data we handle** — state this distinction clearly:
- **Customers** (advertisers who sign up for AdsPro): email, name, hashed password
  (managed by Supabase Auth), Meta ad account ID, Meta dataset/pixel ID, and an
  encrypted Meta access token.
- **Leads** (people who submit a Meta Lead Ad form belonging to our customer): for
  these, **the advertiser is the data fiduciary and AdsPro is a data processor**
  acting on the advertiser's instructions.

**3. What lead data we process** — name, email address, phone number, and the Meta
lead ID, plus technical signals (`fbc`, `fbp` click identifiers, IP address, browser
user agent) used solely for event matching. State that email and phone are **hashed
with SHA-256 before storage** and that we do not store them in readable form.

**4. Why** — the sole purpose is to send conversion events to Meta's Conversions API
so the advertiser's ad delivery optimizes toward leads that actually convert. We do
not sell data, do not use it for advertising of our own, and do not share it with any
third party other than Meta for this purpose.

**5. Meta access tokens** — stored encrypted at rest using pgcrypto; used only
server-side to call Meta's APIs; never exposed to any browser.

**6. Retention** — lead records and hashed identifiers are retained for **90 days**
from creation, then automatically deleted. Rationale to state: Meta's conversion
attribution windows do not exceed 28 days, so data older than 90 days serves no
purpose. Customer account data is retained while the account is active and deleted
within 30 days of account closure.

**7. Sub-processors** — name them: Supabase (database and auth, Mumbai region),
Cloudflare (hosting/CDN), Meta Platforms (recipient of conversion events).

**8. Your rights under the Digital Personal Data Protection Act, 2023 (India)** —
right to access, correction, erasure, grievance redressal, and to nominate. Explain
that a lead who wants their data removed should contact the advertiser who ran the ad
(the data fiduciary), and may also contact us directly and we will act on it.

**9. Grievance Officer** — name Adarsh Chaturvedi, email socialwiire@gmail.com,
and the registered address. DPDP requires a named contact.

**10. Children** — service is not directed at anyone under 18.

**11. Changes** — we will update the "Last updated" date and notify customers of
material changes by email.

## TERMS OF SERVICE — required content

- Acceptance, eligibility (18+, must be authorised to act for the ad account connected).
- Description of service; explicitly: AdsPro does not create, manage, or pay for ads,
  and does not guarantee any advertising outcome or performance improvement.
- Customer obligations: must have lawful basis and consent to process the lead data
  they send us; must comply with Meta's Business Tools Terms and Advertising Policies;
  must not send us data of anyone who has opted out.
- Customer is the data fiduciary for lead data; AdsPro is the processor.
- Meta connection: customer authorises AdsPro to access their Meta ad account and
  datasets via OAuth; may revoke at any time from Meta settings or from AdsPro.
- Acceptable use: no reverse engineering, no reselling, no sending fabricated events.
- Availability: provided "as is", no uptime guarantee at this stage.
- Fees: state that pricing and billing terms will be presented before any paid plan
  begins; the service is currently in early access. All fees, when charged, are
  inclusive of 18% GST.
- Limitation of liability capped at fees paid in the preceding 3 months (or ₹0 while
  the service is free). Exclude indirect and consequential loss.
- Termination by either party; effect of termination (data deleted per the policy).
- Governing law: India; jurisdiction Chhatarpur, Madhya Pradesh.

## DATA DELETION INSTRUCTIONS page

Meta requires a reachable URL explaining how a person gets their data deleted. Keep
it short and concrete:
- If you are an AdsPro customer: how to disconnect Meta and delete your account.
- If you are a lead: contact the business whose ad you responded to; or email
  socialwiire@gmail.com with the phone number or email you submitted, and we will
  locate the hashed record and delete it within 30 days.
- State that disconnecting AdsPro from your Meta account (Meta Settings → Business
  Integrations) immediately revokes our access token.

## Constraints
- Do NOT touch `/api/public/webhooks/meta-leadgen`, `/api/public/webhooks/status`,
  `/api/public/cron/capi-dispatcher`, or `/api/public/auth/meta/callback`.
- These pages must be publicly reachable with no login and return HTTP 200.
- Add a visible "Not legal advice / review before relying on it" note ONLY in your
  reply to me, not on the pages themselves.
