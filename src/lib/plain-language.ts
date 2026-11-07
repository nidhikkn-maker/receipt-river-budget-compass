// Everyday wording for screens. Display-only: never used for saving, exports,
// statutory labels or calculations, which keep their exact accounting names.
import { isLiability, type Account, type AccountKind, type Txn, type TxnType } from "./ledger";

export interface PlainTerm { plain: string; explain: string; technical: string }

/** Technical term → everyday label + one-sentence explanation. The technical name stays available under "Accounting details". */
export const PLAIN_TERMS = {
  contra: { plain: "Money moved between my accounts", explain: "Money went from one of your own accounts to another. It is not spending or income.", technical: "Contra entry" },
  reconciliation: { plain: "Check my balances", explain: "Compare what your bank or card says with what Ledgerline has, and fix any difference.", technical: "Reconciliation" },
  matching: { plain: "Match transactions", explain: "Find the same payment in two places so it is counted once.", technical: "Transaction matching" },
  receivable: { plain: "Money others owe me", explain: "Money someone has promised or is expected to pay you.", technical: "Receivable" },
  payable: { plain: "Money I need to pay", explain: "Bills or amounts you still have to pay someone.", technical: "Payable" },
  posting: { plain: "Add to financial records", explain: "Save it to your records so it counts in balances and reports.", technical: "Post to ledger" },
  unallocated: { plain: "Needs identification", explain: "Ledgerline does not yet know what this money was for.", technical: "Unallocated / suspense" },
  unmatched: { plain: "No matching payment found", explain: "Nothing in your records looks like the same payment yet.", technical: "Unmatched" },
  openingBalance: { plain: "Balance when I started tracking", explain: "How much was in the account on the day you began using Ledgerline for it.", technical: "Opening balance" },
  allocation: { plain: "Split or assign this expense", explain: "Divide one payment across categories, people or purposes.", technical: "Expense allocation" },
  provenance: { plain: "Where this figure came from", explain: "The document, statement line or entry this number is based on.", technical: "Provenance" },
  auditTrail: { plain: "History of changes", explain: "Every change, who made it and when, so nothing is lost.", technical: "Audit trail" },
  depreciation: { plain: "Change in recorded asset value", explain: "Things like laptops and cars are recorded as losing value over time. No money leaves your account.", technical: "Depreciation" },
  liabilities: { plain: "What I owe", explain: "Card dues, loans and other money you have to pay back.", technical: "Liabilities" },
  assets: { plain: "What I own", explain: "Money, investments and valuable things you own.", technical: "Assets" },
  netWorth: { plain: "My total financial position", explain: "What you own minus what you owe.", technical: "Net worth" },
  accrual: { plain: "Earned or owed, not yet paid", explain: "Counted for the period it belongs to, even though the money has not moved yet.", technical: "Accrual" },
  ledger: { plain: "My financial records", explain: "Everything you have saved in Ledgerline.", technical: "Ledger" },
  capitalisation: { plain: "Record as something I own", explain: "A big purchase that lasts years is kept as an item you own instead of one-off spending.", technical: "Asset capitalisation" },
  inputCredit: { plain: "GST I can claim back", explain: "GST you paid on business purchases that can reduce the GST you owe.", technical: "GST input tax credit (ITC)" },
  settlement: { plain: "Settled up", explain: "Everyone has paid back what they owed for this.", technical: "Settlement" },
  outstanding: { plain: "Still to be paid", explain: "The part that has not been paid yet.", technical: "Outstanding" },
  cashBalance: { plain: "Money available", explain: "Money in your bank accounts, cash and wallets right now.", technical: "Cash and bank balance" },
  investments: { plain: "Investments", explain: "Mutual funds, deposits and other investments at their latest recorded value.", technical: "Investments at valuation" },
} satisfies Record<string, PlainTerm>;
export type PlainTermKey = keyof typeof PLAIN_TERMS;
export const plain = (k: PlainTermKey) => PLAIN_TERMS[k].plain;

/** Plain names for transaction types in pickers. The stored type is unchanged. */
export const PLAIN_TXN_LABEL: Record<TxnType, string> = {
  expense: "Money spent", income: "Money received", transfer: "Move between my accounts", refund: "Refund",
  reimbursement: "Money paid back to me", adjustment: "Balance correction", card_payment: "Card bill payment",
  loan_repayment: "Loan payment", investment: "Money put into an investment", advance: "Travel advance", advance_settlement: "Advance returned",
};

export const PLAIN_ACCOUNT_LABEL: Record<AccountKind, string> = {
  savings: "Savings account", current: "Current account", cash: "Cash", credit_card: "Credit card", wallet: "Wallet",
  investment: "Investment", fixed_deposit: "Fixed deposit", loan: "Loan", other_asset: "Something I own or am owed", other_liability: "Money I owe someone",
};

export interface MovementWording { title: string; explain: string; direction: "in" | "out" | "move" | "unknown"; countsAsSpending: boolean; technical: string }

/**
 * Context-sensitive description of what happened to the money. Uses the
 * saved type and the real account kinds; an unknown or inconsistent record is
 * never guessed — it is described as needing identification.
 */
export function describeMovement(t: Pick<Txn, "txnType" | "accountId" | "toAccountId" | "transferCounterpartOf">, accounts: Pick<Account, "id" | "kind" | "name">[]): MovementWording {
  const from = accounts.find(a => a.id === t.accountId);
  const to = accounts.find(a => a.id === t.toAccountId);
  const type = t.txnType;
  const tech = (s: string) => s;
  if (!type) return { title: "Needs identification", explain: "I couldn't tell what kind of payment this is. Please confirm it.", direction: "unknown", countsAsSpending: false, technical: tech("Unclassified entry") };
  switch (type) {
    case "transfer":
      if (from && to) return { title: "Money moved between my accounts", explain: `From ${from.name} to ${to.name}. This is not spending or income.`, direction: "move", countsAsSpending: false, technical: tech("Contra / internal transfer") };
      return { title: "Transfer — other account not confirmed", explain: "I can see money moved, but not which of your accounts received it. Confirm the other account so it isn't counted as spending.", direction: "unknown", countsAsSpending: false, technical: tech("Transfer (one side unlinked)") };
    case "card_payment":
      return { title: "Card bill payment", explain: `${to ? `Paid off ${to.name}` : "Paid off a credit card"}${from ? ` from ${from.name}` : ""}. The purchases were already counted when you made them, so this is not new spending.`, direction: "move", countsAsSpending: false, technical: tech("Credit card settlement (liability reduction)") };
    case "loan_repayment":
      return { title: "Loan payment", explain: "Reduces what you owe on the loan. Any interest part is a cost.", direction: "move", countsAsSpending: false, technical: tech("Loan repayment (principal + interest)") };
    case "investment":
      return { title: "Money put into an investment", explain: "You still own this money — it moved into an investment.", direction: "move", countsAsSpending: false, technical: tech("Investment transfer") };
    case "income":
      return { title: "Money in", explain: from ? `Received into ${from.name}.` : "Money you received.", direction: "in", countsAsSpending: false, technical: tech("Income") };
    case "refund":
      return { title: "Refund", explain: "Money returned for something you bought. It reduces that spending.", direction: "in", countsAsSpending: false, technical: tech("Refund (expense reversal)") };
    case "reimbursement":
      return { title: "Money paid back to me", explain: "Someone repaid an expense you covered. This is not income.", direction: "in", countsAsSpending: false, technical: tech("Reimbursement receipt") };
    case "adjustment":
      return { title: "Balance correction", explain: "Brings the balance in line with your bank. It is not spending or income.", direction: "move", countsAsSpending: false, technical: tech("Balance adjustment") };
    case "advance":
      return { title: "Travel advance", explain: "Money given ahead of a trip, to be accounted for later.", direction: "out", countsAsSpending: false, technical: tech("Advance (receivable)") };
    case "advance_settlement":
      return { title: "Advance returned", explain: "Unused advance money that came back.", direction: "in", countsAsSpending: false, technical: tech("Advance settlement") };
    case "expense":
      if (from?.kind === "credit_card") return { title: "Card charge", explain: `Spent on ${from.name}. You'll pay it when the card bill is due.`, direction: "out", countsAsSpending: true, technical: tech("Expense (credit card liability)") };
      if (to && from && to.id !== from.id) return { title: "Needs identification", explain: "This is saved as spending but also names a second account of yours. It may be a transfer — please check.", direction: "unknown", countsAsSpending: true, technical: tech("Expense with destination account") };
      return { title: "Money out", explain: from ? `Spent from ${from.name}.` : "Money you spent.", direction: "out", countsAsSpending: true, technical: tech("Expense") };
    default:
      return { title: "Needs identification", explain: "I couldn't tell what kind of payment this is. Please confirm it.", direction: "unknown", countsAsSpending: false, technical: tech(String(type)) };
  }
}

export interface StatusGuidance { label: string; meaning: string; action: string | null }
const STATUS: Record<string, StatusGuidance> = {
  draft: { label: "Draft — not saved yet", meaning: "Only you can see this. It doesn't count in balances.", action: "Finish and save it" },
  pending: { label: "Waiting", meaning: "Not yet counted. Someone, or something, still needs to act.", action: "See what's needed" },
  needs_review: { label: "Needs your review", meaning: "I wasn't sure about some details.", action: "Check the details" },
  ready: { label: "Ready to confirm", meaning: "I've filled everything in. Nothing is saved until you confirm.", action: "Confirm" },
  approved: { label: "Approved", meaning: "Accepted. It now counts in your records.", action: null },
  matched: { label: "Matched", meaning: "Found in both your records and the bank statement, so it's counted once.", action: null },
  failed: { label: "Didn't finish", meaning: "Something stopped this from completing. Nothing was half-saved.", action: "Try again" },
  exception: { label: "Possible duplicate or conflict", meaning: "This may be the same payment as another one.", action: "Compare them" },
  reopened: { label: "Changed after saving", meaning: "This was edited after it was saved and needs another look.", action: "Check the changes" },
  interrupted: { label: "Stopped part-way", meaning: "The connection dropped. I'm checking what was actually saved.", action: "Check what was saved" },
};
export function statusGuidance(status: string): StatusGuidance {
  const k = status.toLowerCase().replace(/[\s-]+/g, "_").replace(/^ready_to_confirm$/, "ready");
  return STATUS[k] ?? { label: status, meaning: "I don't have a plain explanation for this status yet.", action: null };
}

/** Statement Desk stages. A stage is only "done" when the real status says so. */
export const STATEMENT_STAGES = ["Received", "Reading", "Organised", "Needs your review", "Saved"] as const;
export type StatementStage = (typeof STATEMENT_STAGES)[number];
export function statementStage(s: { files: number; reading: boolean; planned: boolean; pendingDecisions: number; confirmedSaved: boolean }): StatementStage | null {
  if (s.confirmedSaved) return "Saved";
  if (!s.files) return null;
  if (s.reading) return "Reading";
  if (!s.planned) return "Received";
  return s.pendingDecisions > 0 ? "Needs your review" : "Organised";
}

/** Honest count phrases: "I couldn't match these 3 payments". */
export const countPhrase = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const couldNotMatch = (n: number) => n === 0 ? "Every payment matched." : `I couldn't match ${n === 1 ? "this payment" : `these ${n} payments`}.`;

/** Position summary wording: each figure says what it is and when it's estimated. */
export function positionWording(p: { cash: number | null; owed: number; investments: number; stale?: boolean; estimated?: boolean }) {
  return [
    { key: "cash", label: plain("cashBalance"), explain: PLAIN_TERMS.cashBalance.explain, value: p.cash },
    { key: "owed", label: plain("liabilities"), explain: PLAIN_TERMS.liabilities.explain, value: p.owed },
    { key: "investments", label: plain("investments"), explain: PLAIN_TERMS.investments.explain + (p.stale ? " Some values are out of date." : ""), value: p.investments },
  ];
}

export const accountKindNote = (k: AccountKind) => isLiability(k) ? "Money I owe" : k === "investment" || k === "fixed_deposit" ? "Investment" : k === "other_asset" ? "Something I own or am owed" : "Money available";
