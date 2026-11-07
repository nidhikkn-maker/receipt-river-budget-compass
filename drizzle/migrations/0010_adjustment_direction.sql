ALTER TABLE public.expenses ADD COLUMN adjustment_sign smallint NOT NULL DEFAULT 1;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_adjustment_sign_check CHECK (adjustment_sign IN (1, -1));
COMMENT ON COLUMN public.expenses.adjustment_sign IS 'For txn_type adjustment: +1 raises the account balance, -1 lowers it (amount itself is always positive)';