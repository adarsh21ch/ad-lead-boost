-- VERIFY_FIRST_REAL_LEAD.sql
-- Run the moment the live ad produces its first lead:
--   supabase db query --linked -f VERIFY_FIRST_REAL_LEAD.sql
--
-- Answers, in order of value:
--   1. Did Meta's webhook carry ad_id?  <- THE question. Decides whether
--      cost-per-qualified-lead works today or waits on App Review.
--   2. What keys did Meta ACTUALLY send? (raw envelope, stored verbatim — never inferred)
--   3. Did 0008 resolve the lead up to its adset and campaign?
--   4. Is spend flowing, and does the joined view now show real numbers?
select jsonb_pretty(jsonb_build_object(
 'now_utc', now(),

 -- 1 + 2. Every non-test lead, newest first, with what Meta really sent
 'real_leads', (select jsonb_agg(to_jsonb(x)) from (
    select l.created_at,
           acc.name as account,
           l.meta_leadgen_id,
           (l.ad_id       is not null) as has_ad_id,
           (l.adset_id    is not null) as has_adset_id,
           (l.campaign_id is not null) as has_campaign_id,
           l.ad_id, l.adset_id, l.campaign_id, l.form_id,
           l.enrichment_status,
           -- the decisive evidence: keys Meta's webhook actually delivered
           (select jsonb_agg(k order by k)
              from jsonb_object_keys(coalesce(l.raw_field_data->'webhook','{}'::jsonb)) k) as webhook_keys_meta_sent
      from public.leads l join public.accounts acc on acc.id = l.account_id
     where l.is_test = false
     order by l.created_at desc limit 20) x),

 -- 3. Does the hierarchy resolve? (0008 derivation, shown step by step)
 'hierarchy_resolution', (select jsonb_agg(to_jsonb(x)) from (
    select l.meta_leadgen_id,
           l.ad_id,
           ade.entity_id                            as ad_found_in_ad_entities,
           coalesce(l.adset_id, ade.parent_id)      as resolved_adset_id,
           coalesce(l.campaign_id, adse.parent_id)  as resolved_campaign_id,
           case
             when l.ad_id is null then 'NO ad_id — webhook carried no attribution; needs LEAD_ENRICHMENT_ENABLED'
             when ade.entity_id is null then 'ad_id present but ad not synced yet — resolves automatically after the next hourly sync'
             when adse.entity_id is null then 'ad found, adset chain incomplete — check ad_entities.parent_id'
             else 'RESOLVED to adset + campaign'
           end as verdict
      from public.leads l
      left join public.ad_entities ade
             on ade.account_id = l.account_id and ade.entity_id = l.ad_id and ade.level = 'ad'
      left join public.ad_entities adse
             on adse.account_id = l.account_id
            and adse.entity_id = coalesce(l.adset_id, ade.parent_id) and adse.level = 'adset'
     where l.is_test = false
     order by l.created_at desc limit 20) x),

 -- 4. Spend + the joined product metric
 'warehouse', jsonb_build_object(
    'ad_entities', (select count(*) from public.ad_entities),
    'ad_insights_daily', (select count(*) from public.ad_insights_daily),
    'ad_performance_daily_rows', (select count(*) from public.ad_performance_daily),
    'total_spend', (select coalesce(sum(spend),0) from public.ad_insights_current where level='campaign')),

 'performance_rows', (select jsonb_agg(to_jsonb(x)) from (
    select level, entity_id, entity_name, stat_date, spend, currency,
           meta_leads, adspro_leads, qualified,
           cost_per_lead, cost_per_qualified_lead, low_sample, lead_delivery_gap
      from public.ad_performance_daily
     where spend > 0 or adspro_leads > 0
     order by stat_date desc, level, spend desc nulls last limit 30) x),

 'last_sync', (select jsonb_agg(to_jsonb(x)) from (
    select account_id::text, status, started_at, meta_calls, entities_upserted,
           rows_written, left(coalesce(error,''),120) err
      from public.insights_sync_runs order by started_at desc nulls last limit 4) x)
));
