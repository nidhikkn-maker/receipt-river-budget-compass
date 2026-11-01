import type { Expense } from './expenses';
import { isMove, MOVE_TARGET, type Account, type TxnType } from './ledger';

/** Display contract only: the existing financial preview/RPC remains authoritative. */
export function correctionFields(selected: TxnType | undefined, records: Expense[]) {
  const types = new Set(records.map(record => record.txnType ?? 'expense'));
  const type = selected ?? (types.size === 1 ? records[0]?.txnType ?? 'expense' : undefined);
  return {
    type,
    mixed: !selected && types.size > 1,
    accountLabel: type && ['income', 'refund', 'reimbursement', 'advance'].includes(type) ? 'Receiving account' : type === 'expense' ? 'Payment account/card' : 'Source account',
    destination: type != null && isMove(type),
    repayment: type === 'loan_repayment',
  };
}

export function correctionDestinationAccounts(type: TxnType | undefined, accounts: Account[]) {
  if (!type || !isMove(type)) return [];
  const allowed = MOVE_TARGET[type];
  return accounts.filter(account => !account.archived && (!allowed || allowed.includes(account.kind)));
}