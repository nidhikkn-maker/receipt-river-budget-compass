import type { ExpenseInput } from '../expenses';

/** Stored original money and reviewed identity must agree; ID existence alone is not a receipt. */
export function matchesSavedEntry(input: ExpenseInput, row: Record<string, unknown>): boolean {
  const type = input.txnType ?? 'expense';
  const destination = ['transfer', 'card_payment', 'loan_repayment', 'investment'].includes(type) ? input.toAccountId ?? null : null;
  return row.title === input.title.trim()
    && row.merchant === (input.merchant ?? null)
    && row.category === input.category && row.scope === input.scope
    && row.currency === input.currency && Number(row.original_amount) === input.amount
    && row.expense_date === input.date && row.txn_type === type
    && row.account_id === (input.accountId ?? null) && row.to_account_id === destination
    && row.description === input.description && row.payment_method === input.paymentMethod
    && Number.isFinite(Number(row.amount)) && Number(row.amount) > 0
    && Number.isFinite(Number(row.fx_rate)) && Number(row.fx_rate) > 0
    && JSON.stringify(row.splits ?? []) === JSON.stringify(input.splits ?? [])
    && JSON.stringify(row.workspace_allocations ?? []) === JSON.stringify(input.workspaceAllocations ?? [])
    && JSON.stringify(row.tags ?? []) === JSON.stringify(input.tags ?? [])
    && row.member_id === (input.memberId ?? null)
    && (row.principal ?? null) === (input.principal ?? null)
    && (row.interest ?? null) === (input.interest ?? null);
}

/** After a lost create response, confirm only the immutable reviewed input from an owner read. */
export async function saveWithRecovery(write: () => Promise<void>, read: () => Promise<Record<string, unknown> | null>, input: ExpenseInput): Promise<void> {
  try { await write(); }
  catch (error) {
    const saved = await read().catch(() => null);
    if (!saved || !matchesSavedEntry(input, saved)) throw error;
  }
}