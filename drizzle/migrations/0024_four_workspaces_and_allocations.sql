DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.expenses'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%scope%' LOOP
    EXECUTE format('ALTER TABLE public.expenses DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_scope_check CHECK (scope IN ('personal','family','business','official'));
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS workspace_allocations jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_workspace_allocations_array CHECK (jsonb_typeof(workspace_allocations) = 'array' AND jsonb_array_length(workspace_allocations) <= 4);