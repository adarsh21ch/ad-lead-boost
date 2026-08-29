# PROMPT 16 — Ad performance dashboard (the screen the whole product exists for)

Paste everything below the line into Lovable.

---

Every ad tool on earth can tell an advertiser what a lead COST. None of them can tell them
what the lead was WORTH, because none of them know what happened after the lead arrived.
AdsPro knows — it has the statuses. This screen is where that difference becomes visible.

The numbers that matter here are **cost per qualified lead**, **cost per booked**, and
**cost per purchase**. Everything else on the screen is supporting cast.

## *** DO NOT CREATE MIGRATIONS. DO NOT CREATE TABLES. THIS IS A UI-ONLY TASK. ***

Claude applied `0006_insights_warehouse.sql` and `0007_ad_performance_view.sql` to the live
database and deployed the sync that fills them. A pg_cron job pulls Meta Ads Insights every
hour on its own. **Read these. Do not recreate, "fix", or duplicate any of it.**

```
public.ad_performance_daily          -- THE VIEW YOU WANT. One row per entity per day.
  account_id, level ('campaign'|'adset'|'ad'), entity_id, entity_name,
  parent_id, effective_status, creative_thumbnail_url, stat_date,
  spend, impressions, clicks, ctr, cpc, cpm, reach, frequency, currency,
  meta_leads,                        -- Meta's own lead count, for cross-check
  adspro_leads, contacted, qualified, disqualified, booked, no_show, purchased,
  cost_per_lead, cost_per_qualified_lead, cost_per_booked, cost_per_purchase,
  qualification_rate, close_rate,    -- rates are 0..1, format as %
  low_sample,                        -- true when adspro_leads < 30
  lead_delivery_gap,                 -- adspro_leads - meta_leads
  attribution_window, snapshot_at, last_seen_at

public.ad_insights_current           -- latest raw snapshot per entity/day, no lead join
public.ad_entities                   -- campaign/adset/ad hierarchy, names, thumbnails
public.insights_sync_runs            -- one row per sync attempt (status, error, meta_calls)
```

**Read them with the logged-in user's Supabase session, NOT the service role.** All three
views are `security_invoker` over RLS-protected tables, so a normal client read is already
scoped to that user's own account. You do not need a server route for any of this, and you
must not add one that bypasses RLS.

## TASK 1 — Sync health strip (top of the page, always visible)

From `insights_sync_runs`, newest row: `status`, `started_at`, `error`.

- `ok` → quiet one-liner: "Ad data last updated 14 minutes ago."
- `failed` / `partial` → **loud red banner** showing Meta's `error` text VERBATIM. Never
  rewrite it into something friendly; the raw message is what makes it debuggable.
- no rows at all → "Ad data has not synced yet."

This project has been burned repeatedly by broken things that looked fine. A silent
dashboard is worse than no dashboard.

## TASK 2 — Date range

Last 7 days (default), Last 28 days, and a custom range. Everything below respects it.

## TASK 3 — The funnel

Leads → Contacted → Qualified → Booked → Purchased, with the conversion % between each step.

**Source the funnel from `leads` + `status_events` directly, NOT from
`ad_performance_daily`.** The view only contains leads that are linked to an ad, and right
now no lead is. If you build the funnel off the view it will read zero and look broken when
it is actually correct.

Use "ever reached" counting: a lead that went contacted → qualified → purchased counts in
all three steps. Do not use only the latest status.

If some leads in the range are not linked to an ad, say so under the funnel in plain words:
"12 of 40 leads are not yet linked to an ad, so they appear here but not in the table below."

## TASK 4 — Summary tiles

Over the selected range, across all ads: **Spend**, **Leads**, **Cost per lead**,
**Cost per qualified lead**. Format spend with the `currency` from the data — it is INR
here, so ₹. Never hardcode a currency symbol.

## TASK 5 — The table (the actual product)

A level selector — **Campaign / Ad Set / Ad** — and a sortable table of entities aggregated
over the date range.

Columns: name (+ thumbnail at Ad level), `effective_status`, spend, leads, qualified,
cost per lead, cost per qualified lead, qualification rate, purchased, cost per purchase.

### *** AGGREGATION RULE — GET THIS WRONG AND EVERY NUMBER IS WRONG ***

The view gives you one row per DAY. To show a date range you must **sum the ingredients and
then divide**. You must NOT average the per-day ratio columns.

```
CORRECT:   sum(spend) / nullif(sum(qualified), 0)
WRONG:     avg(cost_per_qualified_lead)
```

Averaging a ratio weights a day with ₹50 spend the same as a day with ₹5000. Same rule for
`cost_per_lead`, `cost_per_booked`, `cost_per_purchase`, `qualification_rate`, `close_rate`.

Recompute `low_sample` on the AGGREGATE too — `sum(adspro_leads) < 30` — not from any single
day's flag.

### Sample size is never hidden

Show the lead count on every row, always, and mark `low_sample` rows visibly (a muted badge
reading "low sample"). An ad with 3 leads must never be presented as beating an ad with 40.
This column is not hideable and not sortable-away.

## TASK 6 — Provenance footer

"Attribution: {attribution_window} · Meta revises these figures for up to 28 days · Last
updated {newest snapshot_at}."

Two numbers fetched under different attribution windows are not comparable, and Meta
genuinely changes the past. Showing this is what turns "your numbers changed" from a support
argument into a footnote.

## TASK 7 — Empty states, and they matter more than usual

The warehouse is **empty right now** and stays empty until a live ad spends. This screen will
be seen empty far more often than full in the near term. Three distinct states:

1. **No insights rows at all** → "No ad data yet. Once an ad starts spending, AdsPro begins
   collecting automatically and this fills in within an hour." Show the empty state, NOT a
   grid of zeros. A zero is a measurement; absence is not.
2. **Spend exists but zero leads are linked to an ad** → show the spend columns normally and
   add one explanatory line: "Spend is being tracked, but no leads are linked to an ad yet."
   Do not render `cost_per_qualified_lead` as ₹0 or ∞ — show "—".
3. **Sync failing** → Task 1's red banner, and do not silently show stale numbers as if
   they were current.

Any divide-by-zero already comes back as NULL from the view. Render NULL as "—", never as 0.

## *** BEFORE YOU PUBLISH ***

`LEAD_ENRICHMENT_ENABLED` must be `"false"` when you publish. Meta App Review is open and the
submitted Data Handling text states AdsPro does not store lead names; Lovable secrets are
project-wide, so publishing while it is `"true"` puts names on the live site and contradicts
the submission in writing. Check the value, then publish.

Do not add a Name column to this screen. This screen is about ads, not people.

## DEFINITION OF DONE — answer each one individually

Previous prompts came back with "build is clean" and nothing else, and the work had to be
re-verified from the database by hand. Answer these as a numbered list, with what you
actually observed:

1. Which exact table/view does each section read from? (funnel, tiles, table, health strip)
2. Paste the aggregation expression you used for `cost_per_qualified_lead` over a date range.
3. Did you create, alter, or drop ANY database object? (The correct answer is no.)
4. Do the reads use the logged-in user's session, or the service role? Which, and where?
5. What does the screen render today, with the warehouse empty — screenshot or describe it.
6. How is a NULL ratio rendered? What about a `low_sample` row?
7. What is the stored value of `LEAD_ENRICHMENT_ENABLED` right now, and did you publish?
