-- 0004_lead_enrichment.sql
-- Columns for lead enrichment via GET /{leadgen_id} (permission: leads_retrieval).
--
-- Meta's leadgen webhook delivers identifiers only. One Graph call per lead returns
-- the person's name plus the full ad hierarchy the webhook omits. This migration adds
-- somewhere to put that. It does NOT enable the feature — the app route is gated on
-- LEAD_ENRICHMENT_ENABLED (see LOVABLE_PROMPT_14_LEAD_NAMES.md).
--
-- PII policy, unchanged in spirit:
--   full_name  -> stored in plain text, because a name is what makes the Leads screen
--                 usable. Deleted by run_retention_purge() after 90 days like every
--                 other lead column.
--   phone/email -> NEVER stored raw. SHA-256 into the existing phone_hash / email_hash
--                 columns at ingest time, raw value discarded in-request.
--
-- Additive and nullable throughout: nothing that reads `leads` today can break.

alter table public.leads
  -- the visible win
  add column if not exists full_name text,

  -- ad hierarchy, free in the same response, currently NULL on every real lead
  -- because the webhook does not send it
  add column if not exists ad_name       text,
  add column if not exists adset_id      text,
  add column if not exists adset_name    text,
  add column if not exists campaign_name text,

  -- outcome of the enrichment attempt — failure must be visible, never silent
  add column if not exists enrichment_status text not null default 'not_attempted',
  add column if not exists enrichment_error  text,
  add column if not exists enriched_at       timestamptz,
  add column if not exists enrichment_attempts integer not null default 0;

do $$
begin
  alter table public.leads
    add constraint leads_enrichment_status_check
    check (enrichment_status in ('not_attempted','enriched','failed','unavailable'));
exception when duplicate_object then null;
end $$;

-- Leads that can never be enriched: manual test rows whose meta_leadgen_id is not a
-- real numeric Meta id. Marked up front so the backfill never wastes a Graph call
-- (and never shows a scary red 'failed' for something that was never a real lead).
update public.leads
set enrichment_status = 'unavailable',
    enrichment_error  = 'not a Meta leadgen id (manual test row)'
where enrichment_status = 'not_attempted'
  and (meta_leadgen_id is null or meta_leadgen_id !~ '^[0-9]+$');

-- Worklist index for the backfill route.
create index if not exists leads_enrichment_pending_idx
  on public.leads (account_id)
  where enrichment_status in ('not_attempted','failed');

comment on column public.leads.full_name is
  'Lead name from GET /{leadgen_id} field_data. PII: plain text by design, purged with the row at 90 days by run_retention_purge().';
comment on column public.leads.enrichment_status is
  'not_attempted | enriched | failed | unavailable. failed => Meta error is in enrichment_error verbatim; surface it, do not swallow it.';
comment on column public.leads.enrichment_attempts is
  'Incremented on every Graph attempt. The backfill must stop retrying a lead after 3 to avoid burning ad-account rate limit.';
