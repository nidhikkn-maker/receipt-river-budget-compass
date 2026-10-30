export type Role = "employee" | "manager" | "finance";
export type Department = "Engineering" | "Sales" | "Marketing" | "Operations";
export const DEPARTMENTS: Department[] = ["Engineering", "Sales", "Marketing", "Operations"];
export const ROLES: Role[] = ["employee", "manager", "finance"];
export const ROLE_LABEL: Record<Role, string> = { employee: "Employee", manager: "Department manager", finance: "Finance" };
export const CATEGORIES = ["Travel", "Meals", "Software", "Equipment", "Training", "Office", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PAYMENT_METHODS = ["cash", "upi", "credit_card", "debit_card", "forex_card", "company_card", "bank_transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash", upi: "UPI", credit_card: "Credit card", debit_card: "Debit card", forex_card: "Forex card",
  company_card: "Company card", bank_transfer: "Bank transfer", other: "Other",
};
export const BASE_CURRENCY = "USD";
export const CURRENCIES = ["USD", "INR", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD", "THB", "MYR", "IDR", "ZAR", "SEK", "NZD", "KRW", "MXN", "BRL"] as const;

export type Status = "pending_manager" | "pending_finance" | "approved" | "reimbursed" | "rejected";

export const STATUS_LABEL: Record<Status, string> = {
  pending_manager: "Awaiting manager",
  pending_finance: "Awaiting finance",
  approved: "Approved · to pay",
  reimbursed: "Reimbursed",
  rejected: "Rejected",
};

export interface User {
  id: string;
  name: string;
  role: Role;
  department: Department;
}

export type HistoryAction = "submitted" | "manager_approved" | "finance_approved" | "rejected" | "reimbursed";
export interface HistoryEntry {
  at: string;
  by: string;
  action: HistoryAction;
  note?: string | undefined;
}

/** A stored receipt file (path inside the private receipts bucket). */
export interface Receipt {
  name: string;
  type: string;
  path: string;
}

export interface Expense {
  id: string;
  employeeId: string;
  department: Department;
  title: string;
  merchant: string | null;
  category: Category;
  /** Amount in the base currency (USD), used for budgets & approvals. */
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
  status: Status;
  history: HistoryEntry[];
}

export type Budgets = Record<Department, number>;

export class WorkflowError extends Error {}

/** Can this user approve/reject the expense at its current stage? (Mirrors the database rule.) */
export function canReview(user: User, e: Expense): boolean {
  if (e.employeeId === user.id) return false;
  if (e.status === "pending_manager") return user.role === "manager" && user.department === e.department;
  if (e.status === "pending_finance") return user.role === "finance";
  return false;
}

export function canReimburse(user: User, e: Expense): boolean {
  return user.role === "finance" && e.status === "approved" && e.employeeId !== user.id;
}

export interface Submission {
  title: string;
  category: Category;
  amount: number;
  date: string;
  description: string;
  merchant: string | null;
  currency: string;
  paymentMethod: PaymentMethod;
  receiptCount: number;
}

export function validateSubmission(s: Submission) {
  if (!s.title.trim()) throw new WorkflowError("Add a title");
  if (!(s.amount > 0)) throw new WorkflowError("Amount must be greater than zero");
  if (!s.date) throw new WorkflowError("Add the expense date");
  if (s.receiptCount === 0) throw new WorkflowError("At least one receipt is required");
}

export function validateBudget(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new WorkflowError("Budget must be zero or more");
}

/** Spend counted against budget: everything not rejected. */
export function departmentSpend(expenses: Expense[], dept: Department, budgets: Budgets) {
  const list = expenses.filter((e) => e.department === dept && e.status !== "rejected");
  const committed = list.filter((e) => e.status === "approved" || e.status === "reimbursed").reduce((s, e) => s + e.amount, 0);
  const pending = list.filter((e) => e.status === "pending_manager" || e.status === "pending_finance").reduce((s, e) => s + e.amount, 0);
  const reimbursed = list.filter((e) => e.status === "reimbursed").reduce((s, e) => s + e.amount, 0);
  return { committed, pending, reimbursed, budget: budgets[dept] ?? 0 };
}

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export const moneyIn = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
};

export const convert = (amount: number, rate: number) => Math.round(amount * rate * 100) / 100;

// ---------- Bank statement reconciliation ----------
export interface StatementLine {
  ref: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive debit amount in the statement's currency
}

export interface Match {
  line: StatementLine;
  expense: Expense | null;
  score: number; // 0..1
}

const dayDiff = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 864e5;
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** Score how well a statement line matches an expense (amount, date window, merchant words). */
export function matchScore(line: StatementLine, e: Expense, statementCurrency: string): number {
  const target = statementCurrency === e.currency ? e.originalAmount : statementCurrency === BASE_CURRENCY ? e.amount : NaN;
  if (!Number.isFinite(target)) return 0;
  const diff = Math.abs(line.amount - target) / Math.max(target, 1);
  if (diff > 0.03) return 0; // allow 3% for card FX fees / rounding
  const days = dayDiff(line.date, e.date);
  if (days > 5) return 0;
  const amountScore = 1 - diff / 0.03;
  const dateScore = 1 - days / 5;
  const m = new Set(words(`${e.merchant ?? ""} ${e.title}`));
  const nameScore = words(line.description).some((w) => m.has(w)) ? 1 : 0;
  return Math.round((amountScore * 0.5 + dateScore * 0.3 + nameScore * 0.2) * 100) / 100;
}

/** Greedy one-to-one matching of statement lines to not-yet-reconciled expenses. */
export function autoMatch(lines: StatementLine[], expenses: Expense[], statementCurrency: string, min = 0.4): Match[] {
  const pool = expenses.filter((e) => !e.reconciledAt && e.status !== "rejected");
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

/** Parse a bank statement CSV. Detects date / description / amount (or debit) columns by header name. */
export function parseStatementCsv(text: string): StatementLine[] {
  const rows = text.trim().split(/\r?\n/).map(splitCsvLine);
  if (rows.length < 2) return [];
  const h = rows[0]!.map((x) => x.toLowerCase().trim());
  const find = (...keys: string[]) => h.findIndex((c) => keys.some((k) => c.includes(k)));
  const di = find("date");
  const ni = find("description", "narration", "details", "particulars", "merchant", "payee");
  const debit = find("debit", "withdrawal", "paid out");
  const ai = debit >= 0 ? debit : find("amount", "value");
  if (di < 0 || ai < 0) throw new WorkflowError("Couldn't find date and amount columns in this file");
  const out: StatementLine[] = [];
  rows.slice(1).forEach((r, i) => {
    const raw = (r[ai] ?? "").replace(/[^0-9.\-]/g, "");
    const amt = Number(raw);
    const date = normalizeDate(r[di] ?? "");
    if (!raw || !Number.isFinite(amt) || amt === 0 || !date) return;
    if (debit < 0 && amt > 0 && h[ai]!.includes("amount") && rows.slice(1).some((x) => Number((x[ai] ?? "").replace(/[^0-9.\-]/g, "")) < 0)) return; // credits when debits are negative
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
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // DD/MM/YYYY (common for bank exports)
  if (m) { const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`; }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
