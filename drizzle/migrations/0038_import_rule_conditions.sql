ALTER TABLE public.import_rules ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.import_rules ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_rules ADD CONSTRAINT import_rules_conditions_object CHECK (jsonb_typeof(conditions) = 'object');
ALTER TABLE public.import_rules ADD CONSTRAINT import_rules_priority_range CHECK (priority BETWEEN 0 AND 100);
COMMENT ON COLUMN public.import_rules.conditions IS 'Optional literal description, direction, source-currency and inclusive source-amount bounds. Suggestions only; never approves or edits existing records.';
COMMENT ON COLUMN public.import_rules.priority IS 'Higher priority wins among matching rules; conflicting equal-priority mappings remain under review.';