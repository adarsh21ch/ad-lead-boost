-- AdsPro — run BEFORE scheduling the capi-dispatcher cron.
-- Part A is a read-only check. Part B is the backfill (safe, idempotent).

-- ============ PART A: what does the new schema look like, and what would fire? ============
select * from (
  select 1 as ord, 'column' as section,
         column_name || ' ' || data_type as detail,
         coalesce('default ' || column_default, 'no default') as extra
  from information_schema.columns
  where table_name = 'status_events'
    and column_name in ('dispatch_status','next_attempt_at')

  union all
  -- Every status_event and whether the dispatcher would re-send it.
  select 2, 'event',
         'id=' || left(se.id::text,8)
           || ' status=' || se.status
           || ' dispatch=' || se.dispatch_status
           || ' next_attempt=' || se.next_attempt_at::text,
         case
           when se.dispatch_status = 'pending'
                and exists (select 1 from capi_delivery_logs l
                            where l.status_event_id = se.id and l.delivered_at is not null)
             then '*** WOULD RE-SEND an already-delivered event — BACKFILL NEEDED ***'
           when se.dispatch_status = 'pending' then 'will dispatch (correct if never sent)'
           else 'ok'
         end
  from status_events se

  union all
  select 3, 'delivery_log',
         'event=' || left(l.status_event_id::text,8)
           || ' ' || l.meta_event_name
           || ' http=' || coalesce(l.http_status::text,'null')
           || ' retry=' || l.retry_count,
         case when l.delivered_at is not null then 'DELIVERED' else 'not delivered' end
  from capi_delivery_logs l
) x order by ord, detail;

-- ============ PART B: BACKFILL — run this, then re-run Part A to confirm clean ============
-- Marks any status_event that already has a successful delivery log as 'delivered',
-- so the dispatcher does not re-send it on the first cron tick.
update status_events se
set dispatch_status = 'delivered'
where se.dispatch_status = 'pending'
  and exists (
    select 1 from capi_delivery_logs l
    where l.status_event_id = se.id and l.delivered_at is not null
  );
