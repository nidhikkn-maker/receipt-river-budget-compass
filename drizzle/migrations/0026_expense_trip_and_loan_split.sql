ALTER TABLE public.expenses
  ADD COLUMN trip_id uuid NULL,
  ADD COLUMN principal numeric NULL,
  ADD COLUMN interest numeric NULL;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_loan_split_check CHECK (
    (principal IS NULL AND interest IS NULL)
    OR (principal >= 0 AND interest >= 0)
  );

COMMENT ON COLUMN public.expenses.trip_id IS 'Links an advance or settlement to a trip without relying on tags.';
COMMENT ON COLUMN public.expenses.principal IS 'Loan repayments: the principal part of the payment.';
COMMENT ON COLUMN public.expenses.interest IS 'Loan repayments: the interest part of the payment.';