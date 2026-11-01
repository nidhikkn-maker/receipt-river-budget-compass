import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Expense } from "./expenses";
import { accountBalance, type Account } from "./ledger";
import { assistantFacts, type PositionInput } from "./position";
import { freshnessSummary } from "./inbox";
import type { FinancePreferences } from "./preferences";

/** Authenticated RLS reads only; paginate so long histories are not silently truncated. */
export async function readAssistantFacts(sb: SupabaseClient<Database>, owner: string, prefs: FinancePreferences) {
  const transactions: Expense[] = [];
  for (let start = 0; ; start += 500) {
    const r = await sb.from("expenses").select("*").eq("employee_id", owner).order("id").range(start, start + 499);
    if (r.error) throw new Error("Couldn't read financial records");
    for (const x of r.data) transactions.push({
      id: x.id, title: x.title, merchant: x.merchant, category: x.category, scope: x.scope as Expense["scope"], memberId: x.member_id,
      splits: x.splits as unknown as Expense["splits"], amount: Number(x.amount), originalAmount: Number(x.original_amount ?? x.amount), currency: x.currency, fxRate: Number(x.fx_rate),
      paymentMethod: x.payment_method as Expense["paymentMethod"], date: x.expense_date, description: x.description, receipts: [],
      txnType: x.txn_type as Expense["txnType"], accountId: x.account_id, toAccountId: x.to_account_id, reconciledAt: x.reconciled_at, statementRef: x.statement_ref,
      adjustmentSign: x.adjustment_sign === -1 ? -1 : 1, tags: x.tags ?? [], reimbursementStatus: x.reimbursement_status as Expense["reimbursementStatus"],
      reimbursement: x.reimbursement as Expense["reimbursement"], allocations: x.allocations as unknown as Expense["allocations"],
      principal: x.principal == null ? null : Number(x.principal), interest: x.interest == null ? null : Number(x.interest),
    });
    if (r.data.length < 500) break;
  }
  const [a, c, l, g, v, b] = await Promise.all([
    sb.from("accounts").select("*").eq("owner_id", owner).order("id"),
    sb.from("commitments").select("*").eq("owner_id", owner).order("id"),
    sb.from("loans").select("*").eq("owner_id", owner).order("id"),
    sb.from("goals").select("*").eq("owner_id", owner).order("id"),
    sb.from("asset_valuations").select("*").eq("owner_id", owner).order("id"),
    sb.from("category_budgets").select("*").eq("owner_id", owner).order("id"),
  ]);
  for (const result of [a, c, l, g, v, b]) {
    if (result.error || (result.data?.length ?? 0) >= 1000) throw new Error("Financial records could not be read completely");
  }
  const accounts: Account[] = (a.data ?? []).map((x) => ({ id: x.id, name: x.name, kind: x.kind as Account["kind"], openingBalance: Number(x.opening_balance), archived: x.archived, creditLimit: x.credit_limit, dueDay: x.due_day, statementDay: x.statement_day, minBalance: Number(x.min_balance), includeInCash: x.include_in_cash }));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const input: PositionInput = {
    accounts, transactions, today, days: 30, includeUnconfirmed: false, cardAlertPct: prefs.cardAlertPct,
    commitments: (c.data ?? []).map((x) => ({ id: x.id, name: x.name, kind: x.kind as PositionInput["commitments"][number]["kind"], direction: x.direction as "in" | "out", amount: Number(x.amount), frequency: x.frequency as PositionInput["commitments"][number]["frequency"], intervalDays: x.interval_days, nextDue: x.next_due, accountId: x.account_id, category: x.category, confirmed: x.confirmed, essential: x.essential, status: x.status as PositionInput["commitments"][number]["status"] })),
    goals: (g.data ?? []).map((x) => ({ name: x.name, target: Number(x.target), saved: Number(x.saved), monthly: Number(x.monthly), reserve: x.reserve })),
    loans: (l.data ?? []).map((x) => {
      const account = accounts.find((a) => a.id === x.account_id);
      const payments = x.payments as unknown as NonNullable<PositionInput["loans"][number]["payments"]>;
      const principal = x.loan_type === "credit_card_emi" ? Math.max(0, Number(x.original_principal ?? x.principal_outstanding) - (payments ?? []).reduce((s, p) => s + p.principal, 0)) : account ? Math.max(0, accountBalance(account, transactions)) : Number(x.principal_outstanding);
      return { id: x.id, name: x.name, principal, rate: Number(x.annual_rate), emi: Number(x.emi), nextDue: x.next_due, accountId: x.account_id, loanType: x.loan_type, original: Number(x.original_principal ?? x.principal_outstanding), sourceTransactionId: x.source_transaction_id, startDate: x.start_date, payments: payments ?? [], status: x.status };
    }),
    valuations: (v.data ?? []).map((x) => ({ accountId: x.account_id, value: Number(x.value), valuedOn: x.valued_on, source: x.source })),
    budgets: Object.fromEntries((b.data ?? []).map((x) => [x.category, Number(x.monthly_amount)])),
  };
  const f = freshnessSummary(accounts, transactions, prefs, today);
  return { ...assistantFacts(input), dataFreshness: { summary: f.label, outdatedAccounts: f.outdatedCritical, lowConfidence: f.lowConfidence, accounts: f.rows.map((r) => ({ name: r.name, status: r.status, lastReconciled: r.lastReconciliation })) } };
}