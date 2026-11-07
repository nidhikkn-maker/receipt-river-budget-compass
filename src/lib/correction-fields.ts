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
/** V5.10.3 "What is this transaction?" — each intent maps onto an existing ledger treatment. */
export const TXN_INTENTS = [
  { id: "expense", label: "Expense", type: "expense", note: "Paid to a merchant or payee — no receiving bank account needed." },
  { id: "income", label: "Income", type: "income", note: "Money earned; choose the receiving account." },
  { id: "own_transfer", label: "Transfer between my accounts", type: "transfer", note: "Link both sides on the Moves between my accounts page so it counts once — not as spending or income." },
  { id: "third_party", label: "Payment to third party", type: "expense", note: "Goods or services from someone outside your accounts; pick them in Recipients." },
  { id: "card_bill", label: "Credit card bill payment", type: "card_payment", note: "Lowers the card’s amount owed; never another expense." },
  { id: "loan_given", label: "Loan given", type: "transfer", targets: ["other_asset"], note: "Moves money into a receivable account for that person — not spending." },
  { id: "loan_received", label: "Loan received", type: "transfer", sourceKinds: ["loan", "other_liability"], note: "Choose the borrowing account as source — not income." },
  { id: "advance_given", label: "Advance given", type: "transfer", targets: ["other_asset"], note: "Recoverable money held by someone else — not spending." },
  { id: "advance_received", label: "Advance received", type: "transfer", sourceKinds: ["other_liability"], note: "Money you owe back — not income." },
  { id: "refund", label: "Refund", type: "refund", note: "Reduces the original spending." },
  { id: "reimbursement", label: "Reimbursement", type: null, note: "Record money back from the claim itself so it links to the right expenses." },
  { id: "investment", label: "Investment", type: "investment", note: "Moves money into an investment account." },
  { id: "other", label: "Other financial movement", type: "transfer", note: "Between two of your own accounts; review carefully." },
] as const satisfies readonly { id: string; label: string; type: TxnType | null; note: string; targets?: readonly string[]; sourceKinds?: readonly string[] }[];
export type TxnIntent = (typeof TXN_INTENTS)[number];

export function intentAccounts(intent: TxnIntent | undefined, accounts: Account[]) {
  const active = accounts.filter(a => !a.archived);
  const t = intent && "targets" in intent ? intent.targets as readonly string[] : null;
  const s = intent && "sourceKinds" in intent ? intent.sourceKinds as readonly string[] : null;
  return {
    sources: s ? active.filter(a => s.includes(a.kind)) : active,
    destinations: intent?.type && isMove(intent.type) ? correctionDestinationAccounts(intent.type, active).filter(a => !t || t.includes(a.kind)) : [],
  };
}
