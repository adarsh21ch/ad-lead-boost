CREATE UNIQUE INDEX IF NOT EXISTS leads_account_meta_leadgen_unique
ON public.leads (account_id, meta_leadgen_id)
WHERE meta_leadgen_id IS NOT NULL;