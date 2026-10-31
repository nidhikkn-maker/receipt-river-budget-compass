// Personal + family expense tracker domain logic (pure, tested).

/** Default categories for new accounts (the 18 from the requirements plus two business ones). Users can rename, merge, archive and add. */
export const CATEGORIES = [
  "Food and beverages", "Groceries", "Shopping", "Family and children", "Education", "Medical and healthcare",
  "Fuel and vehicle expenses", "Travel and accommodation", "Household expenses", "Utility bills", "Digital subscriptions",
  "Insurance", "Financial charges", "Gifts and occasions", "Domestic staff", "Entertainment", "Personal care", "Miscellaneous",
  "Office & Supplies", "Client & Business Meals",
] as const;
/** Category used for interest, late fees and other bank/card charges. */
export const CHARGES_CATEGORY = "Financial charges";
export type Category = string;

export const SCOPES = ["personal", "business"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE_LABEL: Record<Scope, string> = { personal: "Personal", business: "Business" };

export const PAYMENT_METHODS = ["cash", "upi", "credit_card", "debit_card", "forex_card", "company_card", "bank_transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash", upi: "UPI", credit_card: "Credit card", debit_card: "Debit card", forex_card: "Forex card",
  company_card: "Company card", bank_transfer: "Bank transfer", other: "Other",
};

/** Home currency every bill is converted into. */
export const BASE_CURRENCY = "INR";
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD", "THB", "MYR", "IDR", "ZAR", "SEK", "NZD", "KRW", "MXN", "BRL"] as const;

export interface Member { id: string; name: string; relation: string }

export interface Receipt { name: string; type: string; path: string }
export interface ReceiptDetails { tax?: number | null; items?: { name: string; quantity: number; amount: number }[]; text?: string }

export interface Expense {
  id: string;
  title: string;
  merchant: string | null;
  category: Category;
  scope: Scope;
  memberId: string | null; // null = myself
  /** Per-person shares in the bill currency; empty = all for memberId. */
  splits: Split[];
  /** Amount in the home currency (INR). */
  amount: number;
  currency: string;
  originalAmount: number;
  fxRate: number;
  paymentMethod: PaymentMethod;
  reconciledAt: string | null;
  statementRef: string | null;
  date: string;
  description: string;
  receipts: Receipt[];
  txnType?: import("./ledger").TxnType;
  accountId?: string | null;
  toAccountId?: string | null;
  tags?: string[];
  receiptDetails?: ReceiptDetails;
  reimbursementStatus?: ReimbursementStatus;
  /** Adjustments only: +1 raises the account balance, -1 lowers it. */
  adjustmentSign?: 1 | -1;
  /** Category split lines in INR; empty = whole amount uses `category`. */
  allocations?: Allocation[];
  reimbursement?: import("./reimbursements").ReimbursementInfo;
}

export interface Allocation { category: string; amount: number; tags?: string[]; memberId?: string | null; note?: string }

/** Validates category split lines: at least two, positive, and summing exactly to the transaction amount. */
export function validateAllocations(lines: Allocation[], total: number) {
  if (!lines.length) return;
  if (lines.length < 2) throw new Error("A split needs at least two lines");
  for (const l of lines) { if (!l.category) throw new Error("Choose a category for every line"); if (!Number.isFinite(l.amount) || l.amount <= 0 || Math.round(l.amount * 100) / 100 !== l.amount) throw new Error("Every line needs a positive amount with no more than two decimal places"); }
  const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100);
  if (sum !== Math.round(total * 100)) throw new Error(`Lines add up to ${money(sum / 100)}, but the transaction is ${money(total)}`);
}

/** Split percentages into amounts that sum exactly to total (rounding remainder goes to the last line). */
export function allocateByPercent(total: number, lines: { category: string; pct: number }[]): Allocation[] {
  const pctSum = lines.reduce((s, l) => s + l.pct, 0);
  if (Math.abs(pctSum - 100) > 0.001) throw new Error("Percentages must add up to 100");
  let used = 0;
  return lines.map((l, i) => {
    const amount = i === lines.length - 1 ? Math.round((total - used) * 100) / 100 : Math.round(total * l.pct) / 100;
    used += amount; return { category: l.category, amount };
  });
}

/** Category amounts for reporting: split transactions count once, through their lines, never also as the parent category. */
export function categoryParts(e: Pick<Expense, "category" | "amount" | "allocations">): { category: string; amount: number }[] {
  return e.allocations?.length ? e.allocations.map((a) => ({ category: a.category, amount: a.amount })) : [{ category: e.category, amount: e.amount }];
}
export function categoryTotals(list: Pick<Expense, "category" | "amount" | "allocations">[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const e of list) for (const p of categoryParts(e)) o[p.category] = Math.round(((o[p.category] ?? 0) + p.amount) * 100) / 100;
  return o;
}

export type ReimbursementStatus = "none" | "pending" | "received";
export const REIMBURSEMENT_LABEL: Record<ReimbursementStatus, string> = { none: "Not reimbursable", pending: "Reimbursement pending", received: "Reimbursed" };

export interface Split { memberId: string | null; amount: number }

export type Budgets = Partial<Record<Category, number>>;

export class ValidationError extends Error {}

export interface ExpenseInput {
  title: string;
  merchant: string | null;
  category: Category;
  scope: Scope;
  memberId: string | null;
  splits?: Split[];
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  date: string;
  description: string;
  txnType?: import("./ledger").TxnType;
  accountId?: string | null;
  toAccountId?: string | null;
  tags?: string[];
  receiptDetails?: ReceiptDetails;
  reimbursementStatus?: ReimbursementStatus;
  adjustmentSign?: 1 | -1;
}

export function validateExpense(s: ExpenseInput) {
  if (!s.title.trim()) throw new ValidationError("Add a title");
  if (!(s.amount > 0)) throw new ValidationError("Amount must be greater than zero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new ValidationError("Add the expense date");
  if (!SCOPES.includes(s.scope)) throw new ValidationError("Choose business or personal");
  if (s.txnType === "transfer") {
    if (!s.accountId || !s.toAccountId) throw new ValidationError("Pick both accounts for a transfer");
    if (s.accountId === s.toAccountId) throw new ValidationError("Choose two different accounts");
  }
  if (s.splits?.length) validateSplits(s.splits, s.amount);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Shares must be positive, one per person, and add up exactly to the bill total. */
export function validateSplits(splits: Split[], total: number) {
  if (splits.length < 2) throw new ValidationError("Pick at least two people to split with");
  const ids = new Set(splits.map((x) => x.memberId ?? "me"));
  if (ids.size !== splits.length) throw new ValidationError("Each person can appear only once");
  if (splits.some((x) => !(x.amount > 0))) throw new ValidationError("Every share must be more than zero");
  const sum = r2(splits.reduce((a, x) => a + x.amount, 0));
  if (Math.abs(sum - r2(total)) > 0.009) throw new ValidationError(`Shares add up to ${sum}, but the bill is ${r2(total)}`);
}

/** Splits total evenly; leftover paise go to the first people so it sums exactly. */
export function splitEvenly(total: number, ids: (string | null)[]): Split[] {
  const cents = Math.round(total * 100), n = ids.length;
  if (!n) return [];
  const base = Math.floor(cents / n), extra = cents - base * n;
  return ids.map((memberId, i) => ({ memberId, amount: (base + (i < extra ? 1 : 0)) / 100 }));
}

/** Each person's share of an expense in INR (home currency). */
export function memberShares(e: Pick<Expense, "memberId" | "splits" | "amount" | "originalAmount">): Split[] {
  if (!e.splits?.length) return [{ memberId: e.memberId, amount: e.amount }];
  const ratio = e.originalAmount > 0 ? e.amount / e.originalAmount : 1;
  const out = e.splits.map((x) => ({ memberId: x.memberId, amount: r2(x.amount * ratio) }));
  const drift = r2(e.amount - out.reduce((a, x) => a + x.amount, 0));
  out[0]!.amount = r2(out[0]!.amount + drift);
  return out;
}

/** Total INR per person ("me" for yourself), counting split shares. */
export function totalsByMember(list: Expense[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of list) for (const s of memberShares(e)) { const k = s.memberId ?? "me"; out[k] = r2((out[k] ?? 0) + s.amount); }
  return out;
}

export function validateBudget(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new ValidationError("Budget must be zero or more");
}

export const convert = (amount: number, rate: number) => Math.round(amount * rate * 100) / 100;

export interface Filters { scope?: Scope | "all"; memberId?: string | "all" | "me"; from?: string; to?: string; category?: Category | "all"; accountId?: string; paymentMethod?: string; tag?: string; query?: string; txnType?: string; merchant?: string; tagAll?: string[] }

export function applyFilters(list: Expense[], f: Filters): Expense[] {
  return list.filter((e) =>
    (!f.accountId || f.accountId === "all" || e.accountId === f.accountId || e.toAccountId === f.accountId) &&
    (!f.paymentMethod || f.paymentMethod === "all" || e.paymentMethod === f.paymentMethod) &&
    (!f.tag || f.tag === "all" || e.tags?.includes(f.tag)) &&
    (!f.tagAll?.length || f.tagAll.every((t) => e.tags?.includes(t))) &&
    (!f.merchant || f.merchant === "all" || (e.merchant ?? "").trim().toLowerCase() === f.merchant.trim().toLowerCase()) &&
    (!f.txnType || f.txnType === "all" || (e.txnType ?? "expense") === f.txnType) &&
    (!f.query || `${e.title} ${e.merchant ?? ""} ${e.description} ${(e.tags ?? []).join(" ")}`.toLowerCase().includes(f.query.toLowerCase())) &&
    (!f.scope || f.scope === "all" || e.scope === f.scope) &&
    (!f.memberId || f.memberId === "all" || memberShares(e).some((x) => (f.memberId === "me" ? x.memberId === null : x.memberId === f.memberId))) &&
    (!f.category || f.category === "all" || e.category === f.category) &&
    (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to));
}

export function totalsByScope(list: Expense[]) {
  const t = { personal: 0, business: 0, total: 0 };
  for (const e of list) { t[e.scope] += e.amount; t.total += e.amount; }
  return roundAll(t);
}

export function totalsBy<K extends string>(list: Expense[], key: (e: Expense) => K): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const e of list) { const k = key(e); out[k] = Math.round(((out[k] ?? 0) + e.amount) * 100) / 100; }
  return out;
}

const roundAll = <T extends Record<string, number>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100])) as T;

/** Month-to-date spend vs monthly budget per category (personal + business combined). */
export function budgetUsage(list: Expense[], budgets: Budgets, month: string /* YYYY-MM */) {
  const spent = categoryTotals(list.filter((e) => e.date.startsWith(month)));
  return [...new Set([...CATEGORIES, ...Object.keys(budgets), ...Object.keys(spent)])].map((c) => ({ category: c, spent: spent[c] ?? 0, budget: budgets[c] ?? 0 }))
    .filter((r) => r.budget > 0 || r.spent > 0);
}

export const money = (n: number, currency: string = BASE_CURRENCY) => {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
};
export const moneyIn = money;

// ---------- Bank statement reconciliation ----------
export interface StatementLine { ref: string; date: string; description: string; amount: number; direction?: "debit" | "credit" }
export interface Match { line: StatementLine; expense: Expense | null; score: number }

const dayDiff = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 864e5;
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** Score how well a statement line matches an expense (amount within 3%, date within 5 days, merchant words). */
export function matchScore(line: StatementLine, e: Expense, statementCurrency: string, accountId?: string): number {
  const kind=e.txnType??"expense";
  if (accountId) {
    const side = kind === "transfer" && line.direction === "credit" ? e.toAccountId : e.accountId;
    if (side !== accountId) return 0;
  } else if (kind === "transfer") return 0; // A transfer needs its statement-account side.
  if(line.direction==="credit" && !["income","refund","reimbursement","transfer"].includes(kind))return 0;
  if(line.direction!=="credit" && ["income","refund","reimbursement"].includes(kind))return 0;
  const target = statementCurrency === e.currency ? e.originalAmount : statementCurrency === BASE_CURRENCY ? e.amount : NaN;
  if (!Number.isFinite(target)) return 0;
  const diff = Math.abs(line.amount - target) / Math.max(target, 1);
  if (diff > 0.03) return 0;
  const days = dayDiff(line.date, e.date);
  if (days > 5) return 0;
  const m = new Set(words(`${e.merchant ?? ""} ${e.title}`));
  const nameScore = words(line.description).some((w) => m.has(w)) ? 1 : 0;
  return Math.round(((1 - diff / 0.03) * 0.5 + (1 - days / 5) * 0.3 + nameScore * 0.2) * 100) / 100;
}

/** Greedy one-to-one matching of statement lines to not-yet-reconciled expenses. */
export function autoMatch(lines: StatementLine[], expenses: Expense[], statementCurrency: string, min = 0.4, accountId?: string): Match[] {
  const pool = expenses.filter((e) => !e.reconciledAt);
  const pairs: { li: number; e: Expense; score: number }[] = [];
  lines.forEach((l, li) => pool.forEach((e) => {
    const score = matchScore(l, e, statementCurrency, accountId);
    if (score >= min) pairs.push({ li, e, score });
  }));
  pairs.sort((a, b) => b.score - a.score);
  const usedL = new Set<number>(), usedE = new Set<string>();
  const out: Match[] = lines.map((line) => ({ line, expense: null, score: 0 }));
  for (const p of pairs) {
    if (usedL.has(p.li) || usedE.has(p.e.id)) continue;
    if (pairs.some(other => other !== p && (other.li === p.li || other.e.id === p.e.id) && other.score >= p.score - 0.05)) continue;
    const line = lines[p.li];
    if (!line) continue;
    usedL.add(p.li); usedE.add(p.e.id);
    out[p.li] = { line, expense: p.e, score: p.score };
  }
  return out;
}

/** Parse a bank statement CSV. Detects date / description / debit (or amount) columns by header. */
export function parseStatementCsv(text: string, includeCredits = false): StatementLine[] {
  const rows = text.trim().split(/\r?\n/).map(splitCsvLine);
  if (rows.length < 2) return [];
  const h = rows[0]!.map((x) => x.toLowerCase().trim());
  const find = (...keys: string[]) => h.findIndex((c) => keys.some((k) => c.includes(k)));
  const di = find("date");
  const ni = find("description", "narration", "details", "particulars", "merchant", "payee", "remarks");
  const debit = find("debit", "withdrawal", "paid out");
  const credit = find("credit", "deposit", "paid in");
  const ai = debit >= 0 ? debit : find("amount", "value");
  if (di < 0 || ai < 0) throw new ValidationError("Couldn't find date and amount columns in this file");
  const num = (v: string | undefined) => Number((v ?? "").replace(/[^0-9.\-]/g, ""));
  const signed = debit < 0 && rows.slice(1).some((x) => num(x[ai]) < 0);
  const out: StatementLine[] = [];
  rows.slice(1).forEach((r, i) => {
    const raw = (r[ai] ?? "").trim();
    const amt = num(raw);
    const date = normalizeDate(r[di] ?? "");
    if (includeCredits && date && credit >= 0 && num(r[credit]) > 0 && (!raw || amt===0)) {
      out.push({ref:`L${i+1}`,date,description:(ni>=0?r[ni]:"")??"",amount:num(r[credit]),direction:"credit"});return;
    }
    if (!raw || !Number.isFinite(amt) || amt === 0 || !date) return;
    if (signed && amt > 0) {if(includeCredits)out.push({ref:`L${i+1}`,date,description:(ni>=0?r[ni]:"")??"",amount:amt,direction:"credit"});return;}
    out.push({ ref: `L${i + 1}`, date, description: (ni >= 0 ? r[ni] : "") ?? "", amount: Math.abs(amt) });
  });
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}

export function normalizeDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // DD/MM/YYYY (Indian bank exports)
  if (m) { const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`; }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** "Me" or "Me, Asha (split)" — who an expense is for. */
export function whoLabel(e: Pick<Expense, "memberId" | "splits">, name: (id: string | null) => string) {
  return e.splits?.length ? `${e.splits.map((s) => name(s.memberId)).join(", ")} (split)` : name(e.memberId);
}
