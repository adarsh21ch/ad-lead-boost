-- 0007_ad_performance_view.sql
-- PHASE B of ANALYTICS_ROADMAP.md — the join that is the actual product.
--
-- Delivered alongside Phase A because it is pure SQL and costs nothing, and because a
-- warehouse nobody can query is unfalsifiable. Treat the column list as PROVISIONAL:
-- build-order item 5 (the dashboard) should reshape it to what the UI actually needs.
-- Nothing outside this file depends on it yet.
--
-- Left table is spend, right table is outcomes. Everyone selling ad analytics has the
-- left. Only AdsPro has the right, because only AdsPro is wired into what happened to
-- the lead AFTER Meta handed it over.

-- ---------------------------------------------------------------------------
-- Ad-account timezone: needed before any lead can be bucketed into a day
-- ---------------------------------------------------------------------------
-- Meta reports insights in the AD ACCOUNT's timezone. leads.created_at is timestamptz
-- (UTC). Bucketing leads by UTC date against Meta's local dates silently misfiles every
-- lead that arrives between midnight and the UTC offset — for IST (+05:30) that is every
-- lead from 00:00 to 05:30 local, attributed to the wrong day and therefore to the wrong
-- day's spend. Fallback is UTC rather than a guessed 'Asia/Kolkata': an invented default
-- is how wrong numbers get to look right. The Insights fetcher populates the real value.
alter table public.accounts
  add column if not exists meta_ad_account_timezone text;

comment on column public.accounts.meta_ad_account_timezone is
  'timezone_name of the Meta ad account (e.g. Asia/Kolkata). Insights dates are in THIS zone; lead timestamps are UTC. Populated by the insights-sync Edge Function.';

-- ---------------------------------------------------------------------------
-- The joined metric
-- ---------------------------------------------------------------------------
drop view if exists public.ad_performance_daily;
create view public.ad_performance_daily
  with (security_invoker = true)
as
with lead_facts as (
  -- One row per lead, with its funnel outcomes flattened.
  -- "Ever reached" semantics: a lead that went contacted -> qualified -> purchased counts
  -- in all three. That is what a funnel means. Using only the LATEST status would erase
  -- every intermediate step and make qualification rate meaningless.
  select
    l.account_id,
    l.id                       as lead_id,
    l.ad_id, l.adset_id, l.campaign_id,
    (l.created_at at time zone coalesce(acc.meta_ad_account_timezone, 'UTC'))::date as lead_date,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'contacted')     as is_contacted,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'qualified')     as is_qualified,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'not_qualified') as is_disqualified,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'booked')        as is_booked,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'no_show')       as is_no_show,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'purchased')     as is_purchased
  from public.leads l
  join public.accounts acc on acc.id = l.account_id
),
lead_rollup as (
  -- Same aggregation at each level of the hierarchy. A lead carries all three ids, so it
  -- is counted once per level — never summed across levels.
  select account_id, 'campaign'::text as level, campaign_id as entity_id, lead_date,
         count(*) as leads,
         count(*) filter (where is_contacted)    as contacted,
         count(*) filter (where is_qualified)    as qualified,
         count(*) filter (where is_disqualified) as disqualified,
         count(*) filter (where is_booked)       as booked,
         count(*) filter (where is_no_show)      as no_show,
         count(*) filter (where is_purchased)    as purchased
    from lead_facts where campaign_id is not null
   group by account_id, campaign_id, lead_date
  union all
  select account_id, 'adset', adset_id, lead_date,
         count(*), count(*) filter (where is_contacted), count(*) filter (where is_qualified),
         count(*) filter (where is_disqualified), count(*) filter (where is_booked),
         count(*) filter (where is_no_show), count(*) filter (where is_purchased)
    from lead_facts where adset_id is not null
   group by account_id, adset_id, lead_date
  union all
  select account_id, 'ad', ad_id, lead_date,
         count(*), count(*) filter (where is_contacted), count(*) filter (where is_qualified),
         count(*) filter (where is_disqualified), count(*) filter (where is_booked),
         count(*) filter (where is_no_show), count(*) filter (where is_purchased)
    from lead_facts where ad_id is not null
   group by account_id, ad_id, lead_date
)
select
  i.account_id,
  i.level,
  i.entity_id,
  e.name              as entity_name,
  e.parent_id,
  e.effective_status,
  e.creative_thumbnail_url,
  i.stat_date,

  -- spend side (Meta)
  i.spend, i.impressions, i.clicks, i.ctr, i.cpc, i.cpm, i.reach, i.frequency,
  i.currency,
  i.meta_leads,

  -- outcome side (AdsPro) — these ARE the sample size, and are never optional
  coalesce(r.leads, 0)        as adspro_leads,
  coalesce(r.contacted, 0)    as contacted,
  coalesce(r.qualified, 0)    as qualified,
  coalesce(r.disqualified, 0) as disqualified,
  coalesce(r.booked, 0)       as booked,
  coalesce(r.no_show, 0)      as no_show,
  coalesce(r.purchased, 0)    as purchased,

  -- the four numbers nobody else can compute
  round(i.spend / nullif(r.leads, 0), 2)     as cost_per_lead,
  round(i.spend / nullif(r.qualified, 0), 2) as cost_per_qualified_lead,
  round(i.spend / nullif(r.booked, 0), 2)    as cost_per_booked,
  round(i.spend / nullif(r.purchased, 0), 2) as cost_per_purchase,
  round(r.qualified::numeric / nullif(r.leads, 0), 4) as qualification_rate,
  round(r.purchased::numeric / nullif(r.leads, 0), 4) as close_rate,

  -- Ranking guard. 30 is a convention, not a significance test — but a creative with 3
  -- leads must never be presented as beating one with 40, so the flag travels WITH the
  -- numbers rather than being left to the UI to remember.
  (coalesce(r.leads, 0) < 30) as low_sample,

  -- Diagnostic: Meta's own lead count vs what actually reached AdsPro. A persistent gap
  -- means leads are being lost between Meta and the webhook.
  coalesce(r.leads, 0) - coalesce(i.meta_leads, 0) as lead_delivery_gap,

  -- provenance, always visible — two rows under different windows are not comparable
  i.attribution_window,
  i.snapshot_at,
  i.last_seen_at
from public.ad_insights_current i
left join public.ad_entities e
       on e.account_id = i.account_id and e.entity_id = i.entity_id
left join lead_rollup r
       on r.account_id = i.account_id
      and r.level      = i.level
      and r.entity_id  = i.entity_id
      and r.lead_date  = i.stat_date;

comment on view public.ad_performance_daily is
  'PHASE B. Meta spend joined to AdsPro lead outcomes per entity per day. PROVISIONAL shape — item 5 (dashboard) should reshape it. Driven from the spend side: a lead whose ad_id is NULL appears nowhere here, which is the current state of every lead in the database.';

-- *** THE DEPENDENCY THAT DECIDES WHETHER ANY OF THIS SHOWS NUMBERS ***
-- This view joins on leads.ad_id / adset_id / campaign_id. As of 2026-08-29 all three are
-- NULL on every lead in the database. Two different things could populate them:
--   (a) the leadgen webhook, whose payload carries ad_id for a lead from a REAL ad
--       (Meta TEST leads carry no ad attribution, which is why they are NULL today), or
--   (b) lead enrichment via GET /{leadgen_id}, which is built and proven but switched
--       OFF behind LEAD_ENRICHMENT_ENABLED until Meta App Review returns.
-- If (a) works, Phase B produces real numbers without waiting for Meta. If it does not,
-- everything here stays at zero leads until the flag can be turned on. VERIFY THIS ON THE
-- FIRST REAL LEAD from the live ad — it is the single highest-value unknown in Phase A/B.
