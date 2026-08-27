ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS meta_page_id text;
CREATE INDEX IF NOT EXISTS accounts_meta_page_id_idx ON public.accounts (meta_page_id) WHERE meta_page_id IS NOT NULL;