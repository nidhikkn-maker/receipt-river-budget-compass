ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS entity_source text NOT NULL DEFAULT 'account';
ALTER TABLE public.expenses ADD CONSTRAINT expenses_entity_source_chk CHECK (entity_source IN ('account','manual'));