import type { Expense } from "./expenses";
import type { Account, TxnType } from "./ledger";
import type { InboxItem } from "./inbox";

export const REVIEW_GROUPS = {
  ready: "Ready for bulk approval",
  type: "Confirm transaction type",
  category: "Assign categories",
  missing: "Missing information",
  conflict: "Possible duplicates and conflicts",
} as const;
export type ReviewGroup = keyof typeof REVIEW_GROUPS;
export interface FinancialReview {
  transaction: Expense;
  issues: InboxItem[];
  group: ReviewGroup;
  status: "Ready for Review" | "Suggested Correction" | "Needs Information" | "Possible Duplicate" | "Unresolved";
  confidence: "high" | "medium" | "low";
  suggestedType?: TxnType | undefined;
  suggestedCategory?: string | undefined;
  targetAccountIds: string[];
  evidence: string[];
}
const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const kind = (e: Expense) => e.txnType ?? "expense";

/** Account tokens are clues, never proof of purpose or organisation responsibility. */
export function financialReview(items: InboxItem[], transactions: Expense[], accounts: Account[], activeCategories: string[]): FinancialReview[] {
  const grouped = new Map<string, InboxItem[]>();
  for (const item of items) if (item.transactionId && item.type !== "pending_reimbursement") {
    grouped.set(item.transactionId, [...(grouped.get(item.transactionId) ?? []), item]);
  }
  return transactions.filter(e => grouped.has(e.id)).map(e => {
    const issues = grouped.get(e.id) ?? [];
    const text = normal(`${e.title} ${e.description} ${e.merchant ?? ""}`);
    const source = accounts.find(a => a.id === e.accountId && !a.archived);
    const evidence: string[] = [];
    let suggestedType: TxnType | undefined;
    let targets: Account[] = [];
    if (kind(e) === "expense" && /\b(amexbillpayment|amexcard|card settlement|credit card payment|card bill payment)\b/.test(text)) {
      suggestedType = "card_payment";
      targets = accounts.filter(a => !a.archived && a.kind === "credit_card" && a.id !== e.accountId && (
        (a.lastFour && new RegExp(`\\b${a.lastFour}\\b`).test(text)) ||
        (/amex/.test(text) && /amex|american express/.test(normal(`${a.name} ${a.issuer ?? ""}`)))
      ));
      evidence.push("Statement narration suggests a card bill payment; it is not conclusive proof.");
    }
    if (!suggestedType && kind(e) === "expense" && source) {
      targets = accounts.filter(a => !a.archived && a.id !== source.id && a.lastFour && new RegExp(`\\b${a.lastFour}\\b`).test(text));
      targets = targets.filter(a => transactions.some(other => other.id !== e.id && other.accountId === a.id &&
        ["income", "refund", "reimbursement"].includes(kind(other)) && other.currency === e.currency &&
        Math.abs(other.originalAmount - e.originalAmount) < 0.005 &&
        Math.abs(Date.parse(other.date) - Date.parse(e.date)) <= 2 * 86400000 &&
        !!source.lastFour && new RegExp(`\\b${source.lastFour}\\b`).test(normal(`${other.description} ${other.title}`))));
      if (targets.length) {
        suggestedType = targets.every(a => a.kind === "credit_card") ? "card_payment" : "transfer";
        evidence.push("Opposite-side entry matches amount, currency and date, with reciprocal configured account identifiers.");
      }
    }
    let suggestedCategory: string | undefined;
    if (!suggestedType && e.merchant && normal(e.merchant).length >= 3 && !/^(upi|imps|neft|payment|transfer)$/.test(normal(e.merchant))) {
      const peers = transactions.filter(p => p.id !== e.id && p.reconciledAt && kind(p) === kind(e) &&
        normal(p.merchant ?? "") === normal(e.merchant ?? "") && p.accountId === e.accountId &&
        p.currency === e.currency && p.scope === e.scope && p.department === e.department &&
        p.memberId === e.memberId && (p.reimbursementStatus ?? "none") === (e.reimbursementStatus ?? "none") &&
        !p.workspaceAllocations?.length && !e.workspaceAllocations?.length && !p.allocations?.length);
      const categories = new Set(peers.map(p => p.category));
      if (peers.length >= 2 && categories.size === 1 && activeCategories.includes(peers[0]?.category ?? "") && peers[0]?.category !== "Miscellaneous") {
        suggestedCategory = peers[0]?.category;
        evidence.push(`${peers.length} verified entries for this exact merchant, account, workspace and responsibility use ${suggestedCategory}. This is a suggestion, not a saved rule.`);
      } else if (categories.size > 1) evidence.push("This merchant has different confirmed purposes; no category is inferred.");
    }
    const conflict = issues.some(i => i.type === "duplicate" || i.type === "inconsistency");
    const invalidAccount = !source;
    const incompleteMove = ["transfer", "card_payment", "loan_repayment", "investment"].includes(kind(e)) &&
      (!e.toAccountId || e.toAccountId === e.accountId || !accounts.some(a => a.id === e.toAccountId && !a.archived));
    const uncategorised = issues.some(i => i.type === "uncategorised");
    const group: ReviewGroup = conflict ? "conflict" : suggestedType ? "type" : invalidAccount || incompleteMove ? "missing" : uncategorised ? "category" : "ready";
    if (invalidAccount) evidence.push("Source account is missing, archived or no longer configured.");
    if (incompleteMove) evidence.push("Receiving account requires confirmation.");
    if (targets.length !== 1 && suggestedType) evidence.push(targets.length ? "Several receiving accounts match; choose one." : "Receiving card is not identified; choose it manually.");
    if (!evidence.length) evidence.push(...issues.map(i => i.description));
    return { transaction: e, issues, group, suggestedType, suggestedCategory, targetAccountIds: targets.map(a => a.id), evidence,
      confidence: group === "ready" ? "high" : suggestedType || suggestedCategory ? "medium" : "low",
      status: conflict ? "Possible Duplicate" : invalidAccount || incompleteMove ? "Needs Information" : suggestedType || suggestedCategory ? "Suggested Correction" : group === "ready" ? "Ready for Review" : "Unresolved" };
  });
}

/** Preview captures exact records; category-only correction cannot alter money or reconciliation. */
export function categoryReviewPreview(rows: FinancialReview[], category: string) {
  if (!category || category === "Miscellaneous") throw new Error("Choose a specific active category.");
  if (!rows.length) throw new Error("Select transactions first.");
  if (rows.some(r => kind(r.transaction) !== "expense" || r.group !== "category" || r.transaction.allocations?.length)) {
    throw new Error("Resolve transaction type, missing information and conflicts before bulk categorisation.");
  }
  return {
    category,
    records: rows.map(r => ({ ...r.transaction })),
    fingerprint: JSON.stringify(rows.map(r => r.transaction).sort((a, b) => a.id.localeCompare(b.id))),
    amount: Math.round(rows.reduce((sum, r) => sum + r.transaction.amount, 0) * 100) / 100,
    balanceChange: 0, spendingChange: 0, incomeChange: 0,
  };
}

export function previewStillCurrent(preview: ReturnType<typeof categoryReviewPreview>, transactions: Expense[]) {
  const ids = new Set(preview.records.map(e => e.id));
  return JSON.stringify(transactions.filter(e => ids.has(e.id)).sort((a, b) => a.id.localeCompare(b.id))) === preview.fingerprint;
}