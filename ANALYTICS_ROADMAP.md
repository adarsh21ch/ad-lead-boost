# AdsPro — Analytics & AI Advisor Roadmap

Status: PLANNED, not approved for build. Standing decision (2026-08-26): finish the core
product first. This document exists so the design is settled when the time comes.

## Is it buildable?

Yes, all of it. Every feature discussed needs only two data sources, both already
available:

| Source | What it gives | Permission | Have it? |
|---|---|---|---|
| Meta Ads Insights API | spend, impressions, clicks, CPC, CPM, CTR, reach, frequency — per campaign/adset/ad/creative, per day | `ads_management` (superset of `ads_read`) | YES |
| AdsPro's own DB | leads, status_events (qualified/booked/purchased), delivery logs | — | YES |

**The entire product is the JOIN of those two, on `ad_id` / `campaign_id`.**
That join is what nobody else has, because competitors only have the first table.

## The hard prerequisite nobody can code around

None of this has value until **real ads are running, spending real money, generating real
leads that actually get status-updated**. The analytics layer is a lens; with no data
underneath it shows nothing.

Concretely, before Phase A is worth starting:
- inbound leadgen webhook live (PROMPT 10 — in progress)
- at least one live campaign with meaningful daily spend
- leads arriving with `ad_id` / `campaign_id` populated
- statuses actually being set (manually via Leads page, or via CRM/Zapier)
- ~2-4 weeks of that accumulating

Building the dashboard before this is building a window with nothing outside it.

---

# PHASE A — Metrics warehouse (foundation, unglamorous, everything depends on it)

Pull Meta Ads Insights on a schedule into local tables. Do NOT query Meta live per page
view — rate limits, latency, and it makes historical comparison impossible.

### Schema sketch

```sql
-- the campaign > adset > ad > creative hierarchy, synced from Meta
create table ad_entities (
  id text primary key,               -- Meta's id
  account_id uuid references accounts(id),
  level text check (level in ('campaign','adset','ad','creative')),
  parent_id text,
  name text,
  status text,                       -- ACTIVE / PAUSED / etc
  creative_thumbnail_url text,
  synced_at timestamptz not null default now()
);

-- daily metrics per entity. one row per entity per day per snapshot.
create table ad_insights_daily (
  entity_id text not null,
  account_id uuid references accounts(id),
  level text not null,
  date date not null,
  spend numeric, impressions bigint, clicks bigint,
  cpc numeric, cpm numeric, ctr numeric, reach bigint, frequency numeric,
  meta_leads int,                    -- Meta's own reported lead count
  attribution_window text not null,  -- e.g. '7d_click,1d_view'
  snapshot_at timestamptz not null default now(),
  primary key (entity_id, date, snapshot_at)
);
```

### Rules
- **Always store `attribution_window` + `snapshot_at`.** Meta retroactively revises spend
  and conversions as late attributions land. Same query next week returns different
  numbers. Storing the snapshot is what makes "our numbers are accurate" defensible
  instead of a support nightmare. Display both in the UI.
- Re-sync a rolling trailing window (last 28 days), not just yesterday — that is when
  revisions land.
- Use Meta's **async insights jobs** for large accounts; synchronous calls will hit rate
  limits at agency scale.
- Handle pagination. Handle rate-limit backoff. Reuse the existing retry pattern.

---

# PHASE B — The joined metric (this is the actual product)

A view/materialised view joining spend to outcomes. Pure SQL. No AI anywhere near it.

Per ad / adset / campaign / creative, per date range:

| Metric | Formula | Who else has it |
|---|---|---|
| Cost per lead | spend / leads | everyone |
| **Qualification rate** | qualified / leads | **nobody** |
| **Cost per qualified lead** | spend / qualified | **nobody** |
| **Cost per booked** | spend / booked | **nobody** |
| **Cost per purchase** | spend / purchased | **nobody** |
| **Close rate** | purchased / leads | **nobody** |
| Sample size | leads, qualified counts | — |
| Confidence | is the difference significant yet? | almost nobody |

The right-hand column is the whole business case. Everything in Phase C/D just displays
and explains these.

**Always compute and expose sample size next to every ranking.** A creative with 3 leads
must never be presented as beating one with 40. See design principle 3 in STATUS.md.

---

# PHASE C — The explorer UI (the dropdowns you described)

A pivot-table style explorer. Well-understood pattern, no novel UX risk.

- **Level selector**: Campaign / Ad Set / Ad / Creative
- **Metric multi-select**: any combination of Phase B metrics
- **Date range** + optional comparison period (vs previous period)
- **Sort** by any metric, **filter** by status/spend threshold/minimum leads
- **Table + chart**, creative thumbnails on the creative view
- **Confidence/sample-size column always visible, never hideable**
- Compare mode: select 2+ entities side by side

Flexible, as you wanted — with the one guardrail that low-sample rows are visually marked
rather than silently ranked.

---

# PHASE D — AI advisor layer

Runs over Phase B OUTPUT, never over raw data.

**Architecture rule (non-negotiable):** SQL computes every number and ranking. The LLM
receives a compact, already-computed summary and writes the narrative. It never does
arithmetic. Matches the Nev AI rule: numbers always tool-sourced.

What it produces:
- **Weekly/daily digest**: what changed, what is working, what to cut
- **Pattern spotting across creatives**: "your three best performers all use testimonial
  hooks; product-demo angles underperform in every ad set" — genuine LLM strength, and
  the thing Ads Manager will never do
- **Recommendations with reasoning shown**, each tied to the numbers that triggered it
- **Explicit uncertainty**: "not enough data yet — need ~N more conversions"

Cheap to run if Phase B does the aggregation: you send the LLM a small summary, not
thousands of rows.

---

# PHASE E — Actions (recommend -> apply -> automate)

Uses `ads_management`, already granted.

1. **Recommend only** — advisor suggests, human acts in Ads Manager
2. **One-click apply** — pause / scale budget / duplicate winner, from inside AdsPro
3. **True automation** — behind explicit per-account opt-in, with:
   - minimum spend AND minimum conversion thresholds before any auto-action
   - full audit log of every automated change
   - one-click undo
   - hard daily cap on number of automated changes

Never skip to 3. An automated bad call on a client's account is a relationship, not a bug.

---

# PHASE F — Audience automation

Same hashed-PII infrastructure as CAPI, different endpoint (Custom Audiences API).

- **Outcome-based Custom Audiences** — auto-build and refresh a "Qualified" / "Purchased"
  audience from status data
- **Lookalikes** seeded from those — the natural next step after CAPI: CAPI tells Meta who
  converted, Lookalikes go find more of them
- **Suppression audiences** — exclude already-contacted / in-pipeline leads from
  prospecting so you stop paying to reach your own funnel
- **Nurture segments** — "contacted but not qualified", "no_show" are standard high-ROI
  retargeting pools, already captured in `status_events`

NOTE: requires PII (phone/email hashes), so this is gated on `leads_retrieval` approval.
Phases A-E are not.

---

# YOUR CHECKLIST (things only Adarsh can do)

Split from what Lovable builds, because these are the actual blockers.

### Now — unblock inbound leads
- [ ] Paste PROMPT 10 (done / in progress)
- [ ] In Meta App Dashboard → Webhooks → Page, subscribe to the `leadgen` field
- [ ] Point it at `https://adsproindia.com/api/public/webhooks/meta-leadgen`
      with `META_VERIFY_TOKEN` = `b862a6dc60f1bf56f76e04cd193e3ae2`
- [ ] Subscribe your actual Page to the app (needs a page token; as app admin you can do
      this on your own Page via Graph API Explorer without App Review)
- [ ] Submit a real test lead through Meta's Lead Ads Testing Tool
- [ ] Confirm it lands in the Leads tab WITH campaign/ad IDs populated

### Then — generate the data the analytics needs
- [ ] Run at least one live lead-gen campaign with real budget
- [ ] Set statuses on incoming leads (Leads page, or wire Zapier from a CRM)
- [ ] Let 2-4 weeks accumulate
- [ ] Confirm `ads_read` works: pull one Insights call for your ad account

### Decision point (revisit after the above)
- [ ] Ask Metrol Media's marketer which analysis they do MANUALLY today, and how long it
      takes. Build those first. That converts guesswork into a spec.
- [ ] Decide: build analytics for your own accounts first (fast, no App Review), or wait
      for multi-tenant

### Only then — build Phase A onward

---

# Honest effort sizing

- Phase A: the biggest single chunk. Sync jobs, pagination, rate limits, backfill, and
  the snapshot discipline. Not a weekend.
- Phase B: small if A is right. It is mostly one good SQL view.
- Phase C: medium. Standard UI work, no novel risk.
- Phase D: small-to-medium, and the most impressive per unit of effort — because A and B
  did the hard part.
- Phase E: small to build, large in responsibility.
- Phase F: medium, gated on `leads_retrieval`.

The order matters more than the speed. A and B are the moat. C and D are what people see.
Building C/D on a weak A is how these products end up confidently wrong.


## CORRECTION 2026-08-27 — `ads_read` is NOT needed

`ads_management` is a superset of `ads_read` and grants Ads Insights API access on its
own. Meta's Marketing API Access Tier description states it plainly: "At a minimum,
ads_read or ads_management permission is required."

`ads_read` was therefore REMOVED from App Review submission 1773424157411237 rather than
carried along with no demonstrable use (a documented Meta rejection reason — there is
nothing to show a reviewer, since no campaigns have run yet). Phase A Insights sync is
unaffected and should be built against `ads_management`.

Also removed from that submission for the same reason: `pages_manage_ads` (only needed if
AdsPro ever creates ads) and `pages_read_engagement` (only needed to read Page content or
Page insights). Neither is on any AdsPro roadmap.

Advanced Access approvals do not expire, so anything genuinely needed later can be added
in a separate round without risking the six that matter now.
