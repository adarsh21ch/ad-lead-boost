-- AdsPro — inbound leadgen verification. SINGLE result set (Supabase SQL editor shows
-- only the LAST statement, so everything is unioned).
-- Run after Step 4 of INBOUND_LEADGEN_RUNBOOK.md.

select '1_page_id_saved' as section,
       a.name as k,
       case when a.meta_page_id is null
            then '*** NULL — STEP 1 NOT DONE, webhook cannot map any lead ***'
            else 'page_id=' || a.meta_page_id end as v
from public.accounts a

union all
select '2_lead_counts', 'total_leads', count(*)::text from public.leads
union all
select '2_lead_counts', 'REAL_leads (is_test=false)',
       case when count(*) = 0
            then '0  <-- no real lead has entered yet'
            else count(*)::text || '  <-- INBOUND PROVEN' end
from public.leads where coalesce(is_test,false) = false

union all
select '3_recent_leads',
       to_char(l.created_at,'YYYY-MM-DD HH24:MI:SS'),
       concat_ws(' | ',
         'leadgen_id=' || coalesce(l.meta_leadgen_id,'NULL'),
         'ad_id=' || coalesce(nullif(l.ad_id,''),'NULL'),
         'campaign_id=' || coalesce(nullif(l.campaign_id,''),'NULL'),
         'form_id=' || coalesce(nullif(l.form_id,''),'NULL'),
         'is_test=' || coalesce(l.is_test,false)::text,
         'has_raw=' || (l.raw_field_data is not null)::text)
from public.leads l
where l.created_at > now() - interval '2 days'

union all
select '4_status_events',
       to_char(s.created_at,'YYYY-MM-DD HH24:MI:SS'),
       concat_ws(' | ','status=' || s.status,
                       'dispatch=' || coalesce(s.dispatch_status,'NULL'),
                       'source=' || coalesce(s.source,'NULL'),
                       'next_attempt=' || coalesce(s.next_attempt_at::text,'-'))
from public.status_events s
where s.created_at > now() - interval '2 days'

union all
select '5_deliveries',
       to_char(d.delivered_at,'YYYY-MM-DD HH24:MI:SS'),
       concat_ws(' | ','event=' || coalesce(d.meta_event_name,'NULL'),
                       'http=' || coalesce(d.http_status::text,'NULL'),
                       'retry=' || coalesce(d.retry_count,0)::text,
                       'resp=' || coalesce(left(d.meta_response::text,110),''))
from public.capi_delivery_logs d
where d.delivered_at > now() - interval '2 days'

union all
select '6_cron_health',
       to_char(j.start_time,'YYYY-MM-DD HH24:MI:SS'),
       'status=' || j.status || ' | ' || coalesce(left(j.return_message,40),'')
from cron.job_run_details j
where j.start_time > now() - interval '20 minutes'
order by 1, 2 desc;
