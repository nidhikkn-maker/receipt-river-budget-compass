export type Role = "employee" | "manager" | "finance";
export type Department = "Engineering" | "Sales" | "Marketing" | "Operations";
export const DEPARTMENTS: Department[] = ["Engineering", "Sales", "Marketing", "Operations"];
export const ROLES: Role[] = ["employee", "manager", "finance"];
export const ROLE_LABEL: Record<Role, string> = { employee: "Employee", manager: "Department manager", finance: "Finance" };
export const CATEGORIES = ["Travel", "Meals", "Software", "Equipment", "Training", "Office", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

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
  amount: number;
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
