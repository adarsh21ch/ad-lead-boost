-- 0008_lead_hierarchy_derivation.sql
-- Derive a lead's adset_id / campaign_id from ad_entities when the lead only carries ad_id.
--
-- WHY THIS EXISTS
-- Meta's leadgen webhook does NOT deliver the full hierarchy. The only real (non-test)
-- webhook this app has ever received carried exactly four keys:
--     created_time, form_id, leadgen_id, page_id
-- (stored verbatim in leads.raw_field_data->'webhook' — checked, not assumed).
-- Meta adds ad_id/adgroup_id for a lead sourced from a PAID ad; it never sends adset_id,
-- and the webhook handler does not map adset_id at all. campaign_id is read by the handler
-- but is not a documented leadgen webhook field.
--
-- So the BEST realistic outcome from the first live ad is: ad_id populated, adset_id and
-- campaign_id NULL. Under 0007 that means the ad level shows correct numbers while the
-- adset and campaign levels show spend against ZERO leads — and campaign is the level a
-- user looks at first. Correct arithmetic, broken-looking product.
--
-- ad_entities already holds the chain (ad.parent_id = adset, adset.parent_id = campaign),
-- populated hourly from Insights by the insights-sync function using ads_management, which
-- is already granted. So the hierarchy is recoverable with a lookup and NO dependency on
-- Meta App Review and no lead enrichment.
--
-- Derivation happens at QUERY time, not write time. A lead that arrives before its ad has
-- been synced simply has nothing to resolve against; once the next hourly sync lands the
-- entity, that lead's campaign and adset attribution appears retroactively. Nothing has to
-- be backfilled and no lead is permanently mis-filed.
--
-- The lead's OWN column always wins (coalesce order). If LEAD_ENRICHMENT_ENABLED is ever
-- turned on and enrichment writes real ids, those are used and this derivation stands down
-- on its own — there is nothing to undo later.
--
-- Column list is UNCHANGED from 0007 (36 columns). The only difference is which leads land
-- in the adset/campaign rollups. Verified column-for-column after applying.

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
    l.ad_id,
    -- The lead's own value wins; ad_entities is only consulted where Meta left a gap.
    coalesce(l.adset_id,    ade.parent_id)  as adset_id,
    coalesce(l.campaign_id, adse.parent_id) as campaign_id,
    (l.created_at at time zone coalesce(acc.meta_ad_account_timezone, 'UTC'))::date as lead_date,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'contacted')     as is_contacted,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'qualified')     as is_qualified,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'not_qualified') as is_disqualified,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'booked')        as is_booked,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'no_show')       as is_no_show,
    exists (select 1 from public.status_events s where s.lead_id = l.id and s.status = 'purchased')     as is_purchased
  from public.leads l
  join public.accounts acc on acc.id = l.account_id
  -- ad -> its adset. Scoped by account_id: entity ids are unique only within Meta, and two
  -- AdsPro accounts currently point at the SAME Meta ad account.
  left join public.ad_entities ade
         on ade.account_id = l.account_id
        and ade.entity_id  = l.ad_id
        and ade.level      = 'ad'
  -- adset -> its campaign. Chains off the derived adset when the lead had none of its own.
  left join public.ad_entities adse
         on adse.account_id = l.account_id
        and adse.entity_id  = coalesce(l.adset_id, ade.parent_id)
        and adse.level      = 'adset'
),
lead_rollup as (
  -- Same aggregation at each level of the hierarchy. A lead counts once per level —
  -- never summed across levels.
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
  'PHASE B. Meta spend joined to AdsPro lead outcomes per entity per day. A lead carrying only ad_id (all Meta''s leadgen webhook ever supplies for a paid lead) is resolved up to its adset and campaign through ad_entities.parent_id, so all three levels report outcomes without waiting on lead enrichment or App Review. Resolution happens at query time: attribution appears retroactively once the hourly sync has seen the ad.';
