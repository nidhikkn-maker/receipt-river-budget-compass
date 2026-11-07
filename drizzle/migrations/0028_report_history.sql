CREATE TABLE public.report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL,
  title text NOT NULL,
  period_from date,
  period_to date,
  workspace text NOT NULL DEFAULT 'all',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','failed')),
  file_path text,
  file_size integer,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.report_history TO authenticated;
GRANT ALL ON public.report_history TO service_role;
ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read reports" ON public.report_history FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners add reports" ON public.report_history FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND (file_path IS NULL OR file_path LIKE auth.uid()::text || '/reports/%'));
CREATE POLICY "Owners delete reports" ON public.report_history FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE INDEX report_history_owner_idx ON public.report_history(owner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.delete_my_finance_data()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 DELETE FROM public.family_requests WHERE owner_id=uid OR requester_id=uid;
 DELETE FROM public.family_invites WHERE owner_id=uid;
 UPDATE public.family_invites SET accepted_by=NULL, accepted_at=NULL, revoked=true WHERE accepted_by=uid;
 DELETE FROM public.documents WHERE owner_id=uid;
 DELETE FROM public.asset_valuations WHERE owner_id=uid;
 DELETE FROM public.loans WHERE owner_id=uid;
 DELETE FROM public.expenses WHERE employee_id=uid;
 DELETE FROM public.commitments WHERE owner_id=uid;
 DELETE FROM public.goals WHERE owner_id=uid;
 DELETE FROM public.category_budgets WHERE owner_id=uid;
 DELETE FROM public.accounts WHERE owner_id=uid;
 DELETE FROM public.family_members WHERE owner_id=uid;
 DELETE FROM public.finance_preferences WHERE owner_id=uid;
 DELETE FROM public.push_subscriptions WHERE owner_id=uid;
 DELETE FROM public.push_reminder_log WHERE owner_id=uid;
 DELETE FROM public.transaction_audit WHERE owner_id=uid;
 DELETE FROM public.finance_operations WHERE owner_id=uid;
 DELETE FROM public.monthly_reviews WHERE owner_id=uid;
 DELETE FROM public.category_batches WHERE owner_id=uid;
 DELETE FROM public.statement_line_imports WHERE owner_id=uid;
 DELETE FROM public.expense_drafts WHERE owner_id=uid;
 DELETE FROM public.report_history WHERE owner_id=uid;
END $function$;