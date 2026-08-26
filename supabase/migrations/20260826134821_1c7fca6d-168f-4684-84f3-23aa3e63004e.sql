alter table public.leads add column if not exists is_test boolean not null default false;
alter table public.capi_delivery_logs add column if not exists is_test boolean not null default false;