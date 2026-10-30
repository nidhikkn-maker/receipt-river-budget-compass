// Personal + family expense tracker domain logic (pure, tested).

export const CATEGORIES = [
  "Groceries", "Dining", "Travel", "Fuel & Transport", "Shopping", "Bills & Utilities", "Rent & Home",
  "Health", "Education", "Entertainment", "Software & Subscriptions", "Office & Supplies", "Client & Business Meals", "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

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
}

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
}

export function validateExpense(s: ExpenseInput) {
  if (!s.title.trim()) throw new ValidationError("Add a title");
  if (!(s.amount > 0)) throw new ValidationError("Amount must be greater than zero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new ValidationError("Add the expense date");
  if (!SCOPES.includes(s.scope)) throw new ValidationError("Choose business or personal");
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

export interface Filters { scope?: Scope | "all"; memberId?: string | "all" | "me"; from?: string; to?: string; category?: Category | "all" }

export function applyFilters(list: Expense[], f: Filters): Expense[] {
  return list.filter((e) =>
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
  const spent = totalsBy(list.filter((e) => e.date.startsWith(month)), (e) => e.category);
  return CATEGORIES.map((c) => ({ category: c, spent: spent[c] ?? 0, budget: budgets[c] ?? 0 }))
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
export interface StatementLine { ref: string; date: string; description: string; amount: number }
export interface Match { line: StatementLine; expense: Expense | null; score: number }

const dayDiff = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 864e5;
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** Score how well a statement line matches an expense (amount within 3%, date within 5 days, merchant words). */
export function matchScore(line: StatementLine, e: Expense, statementCurrency: string): number {
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
export function autoMatch(lines: StatementLine[], expenses: Expense[], statementCurrency: string, min = 0.4): Match[] {
  const pool = expenses.filter((e) => !e.reconciledAt);
  const pairs: { li: number; e: Expense; score: number }[] = [];
  lines.forEach((l, li) => pool.forEach((e) => {
    const score = matchScore(l, e, statementCurrency);
    if (score >= min) pairs.push({ li, e, score });
  }));
  pairs.sort((a, b) => b.score - a.score);
  const usedL = new Set<number>(), usedE = new Set<string>();
  const out: Match[] = lines.map((line) => ({ line, expense: null, score: 0 }));
  for (const p of pairs) {
    if (usedL.has(p.li) || usedE.has(p.e.id)) continue;
    usedL.add(p.li); usedE.add(p.e.id);
    out[p.li] = { line: lines[p.li]!, expense: p.e, score: p.score };
  }
  return out;
}

/** Parse a bank statement CSV. Detects date / description / debit (or amount) columns by header. */
export function parseStatementCsv(text: string): StatementLine[] {
  const rows = text.trim().split(/\r?\n/).map(splitCsvLine);
  if (rows.length < 2) return [];
  const h = rows[0]!.map((x) => x.toLowerCase().trim());
  const find = (...keys: string[]) => h.findIndex((c) => keys.some((k) => c.includes(k)));
  const di = find("date");
  const ni = find("description", "narration", "details", "particulars", "merchant", "payee", "remarks");
  const debit = find("debit", "withdrawal", "paid out");
  const ai = debit >= 0 ? debit : find("amount", "value");
  if (di < 0 || ai < 0) throw new ValidationError("Couldn't find date and amount columns in this file");
  const num = (v: string | undefined) => Number((v ?? "").replace(/[^0-9.\-]/g, ""));
  const signed = debit < 0 && rows.slice(1).some((x) => num(x[ai]) < 0);
  const out: StatementLine[] = [];
  rows.slice(1).forEach((r, i) => {
    const raw = (r[ai] ?? "").trim();
    const amt = num(raw);
    const date = normalizeDate(r[di] ?? "");
    if (!raw || !Number.isFinite(amt) || amt === 0 || !date) return;
    if (signed && amt > 0) return; // positive = credit when debits are negative
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
