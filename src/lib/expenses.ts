export type Role = "employee" | "manager" | "finance";
export type Department = "Engineering" | "Sales" | "Marketing" | "Operations";
export const DEPARTMENTS: Department[] = ["Engineering", "Sales", "Marketing", "Operations"];
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

export interface HistoryEntry {
  at: string;
  by: string;
  action: "submitted" | "manager_approved" | "finance_approved" | "rejected" | "reimbursed";
  note?: string;
}

export interface Receipt {
  name: string;
  type: string;
  dataUrl: string;
}

export interface Expense {
  id: string;
  employeeId: string;
  department: Department;
  title: string;
  category: Category;
  amount: number;
  date: string;
  description: string;
  receipts: Receipt[];
  status: Status;
  history: HistoryEntry[];
}

export const USERS: User[] = [
  { id: "u-emp-1", name: "Priya Raman", role: "employee", department: "Engineering" },
  { id: "u-emp-2", name: "Marcus Webb", role: "employee", department: "Sales" },
  { id: "u-emp-3", name: "Lena Ortiz", role: "employee", department: "Marketing" },
  { id: "u-mgr-1", name: "Daniel Cho", role: "manager", department: "Engineering" },
  { id: "u-mgr-2", name: "Aisha Bello", role: "manager", department: "Sales" },
  { id: "u-mgr-3", name: "Tom Fischer", role: "manager", department: "Marketing" },
  { id: "u-fin-1", name: "Grace Kim", role: "finance", department: "Operations" },
];

export const BUDGETS: Record<Department, number> = {
  Engineering: 25000,
  Sales: 18000,
  Marketing: 15000,
  Operations: 8000,
};

export const userById = (id: string) => USERS.find((u) => u.id === id);

export class WorkflowError extends Error {}

/** Can this user act (approve/reject) on the expense at its current stage? */
export function canReview(user: User, e: Expense): boolean {
  if (e.employeeId === user.id) return false;
  if (e.status === "pending_manager") return user.role === "manager" && user.department === e.department;
  if (e.status === "pending_finance") return user.role === "finance";
  return false;
}

export function approve(e: Expense, user: User, note?: string): Expense {
  if (!canReview(user, e)) throw new WorkflowError("Not allowed to approve at this stage");
  const at = new Date().toISOString();
  if (e.status === "pending_manager")
    return { ...e, status: "pending_finance", history: [...e.history, { at, by: user.id, action: "manager_approved", note }] };
  return { ...e, status: "approved", history: [...e.history, { at, by: user.id, action: "finance_approved", note }] };
}

export function reject(e: Expense, user: User, note: string): Expense {
  if (!canReview(user, e)) throw new WorkflowError("Not allowed to reject at this stage");
  if (!note.trim()) throw new WorkflowError("A reason is required to reject");
  return { ...e, status: "rejected", history: [...e.history, { at: new Date().toISOString(), by: user.id, action: "rejected", note }] };
}

export function reimburse(e: Expense, user: User): Expense {
  if (user.role !== "finance" || e.status !== "approved") throw new WorkflowError("Only finance can pay approved expenses");
  return { ...e, status: "reimbursed", history: [...e.history, { at: new Date().toISOString(), by: user.id, action: "reimbursed" }] };
}

export function createExpense(
  user: User,
  data: Pick<Expense, "title" | "category" | "amount" | "date" | "description" | "receipts">,
): Expense {
  if (!(data.amount > 0)) throw new WorkflowError("Amount must be greater than zero");
  if (data.receipts.length === 0) throw new WorkflowError("At least one receipt is required");
  return {
    ...data,
    id: `exp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    employeeId: user.id,
    department: user.department,
    status: "pending_manager",
    history: [{ at: new Date().toISOString(), by: user.id, action: "submitted" }],
  };
}

/** Spend counted against budget: everything not rejected. */
export function departmentSpend(expenses: Expense[], dept: Department) {
  const list = expenses.filter((e) => e.department === dept && e.status !== "rejected");
  const committed = list.filter((e) => e.status === "approved" || e.status === "reimbursed").reduce((s, e) => s + e.amount, 0);
  const pending = list.filter((e) => e.status === "pending_manager" || e.status === "pending_finance").reduce((s, e) => s + e.amount, 0);
  return { committed, pending, budget: BUDGETS[dept] };
}

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const placeholderReceipt: Receipt = {
  name: "receipt.svg",
  type: "image/svg+xml",
  dataUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='320'><rect width='100%' height='100%' fill='#fbf7ee'/><text x='20' y='40' font-family='monospace' font-size='16'>RECEIPT</text><line x1='20' y1='60' x2='220' y2='60' stroke='#999'/><text x='20' y='100' font-family='monospace' font-size='12'>Item ........ 1</text><text x='20' y='130' font-family='monospace' font-size='12'>Tax ......... 0</text><text x='20' y='280' font-family='monospace' font-size='14'>THANK YOU</text></svg>`,
    ),
};

function seed(
  id: string, emp: string, title: string, category: Category, amount: number, daysAgo: number, status: Status,
): Expense {
  const u = userById(emp)!;
  const d = new Date(Date.now() - daysAgo * 864e5);
  const mgr = USERS.find((x) => x.role === "manager" && x.department === u.department)!;
  const history: HistoryEntry[] = [{ at: d.toISOString(), by: emp, action: "submitted" }];
  const later = (h: number) => new Date(d.getTime() + h * 36e5).toISOString();
  if (status !== "pending_manager") {
    if (status === "rejected" && amount > 1000) history.push({ at: later(20), by: mgr.id, action: "rejected", note: "Needs pre-approval for purchases over $1,000." });
    else history.push({ at: later(20), by: mgr.id, action: "manager_approved" });
  }
  if (status === "approved" || status === "reimbursed") history.push({ at: later(40), by: "u-fin-1", action: "finance_approved" });
  if (status === "rejected" && amount <= 1000) history.push({ at: later(40), by: "u-fin-1", action: "rejected", note: "Receipt is illegible." });
  if (status === "reimbursed") history.push({ at: later(60), by: "u-fin-1", action: "reimbursed" });
  return { id, employeeId: emp, department: u.department, title, category, amount, date: d.toISOString().slice(0, 10), description: "", receipts: [placeholderReceipt], status, history };
}

export const SEED: Expense[] = [
  seed("exp-01", "u-emp-1", "AWS re:Invent flights", "Travel", 642.4, 3, "pending_manager"),
  seed("exp-02", "u-emp-1", "Mechanical keyboard", "Equipment", 189, 9, "pending_finance"),
  seed("exp-03", "u-emp-1", "Team lunch – sprint demo", "Meals", 236.75, 18, "reimbursed"),
  seed("exp-04", "u-emp-1", "JetBrains license", "Software", 249, 26, "approved"),
  seed("exp-05", "u-emp-2", "Client dinner – Acme", "Meals", 412.3, 2, "pending_manager"),
  seed("exp-06", "u-emp-2", "Chicago sales trip hotel", "Travel", 1280, 12, "pending_finance"),
  seed("exp-07", "u-emp-2", "Conference booth swag", "Marketing" as Category, 0, 0, "pending_manager"),
  seed("exp-08", "u-emp-3", "Figma annual seat", "Software", 540, 6, "pending_manager"),
  seed("exp-09", "u-emp-3", "Photo shoot equipment", "Equipment", 1650, 15, "rejected"),
  seed("exp-10", "u-emp-3", "Content strategy course", "Training", 399, 22, "reimbursed"),
  seed("exp-11", "u-emp-2", "Rental car – Denver", "Travel", 318.6, 30, "reimbursed"),
  seed("exp-12", "u-emp-1", "Taxi to datacenter", "Travel", 64.2, 34, "rejected"),
].filter((e) => e.amount > 0);
