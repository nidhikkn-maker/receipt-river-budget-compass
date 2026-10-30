import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEPARTMENTS, validateBudget, validateSubmission,
  type Budgets, type Category, type Department, type Expense, type HistoryAction, type Receipt, type Role, type Status, type Submission, type User,
} from "./expenses";

interface Ctx {
  user: User;
  people: Record<string, User>;
  expenses: Expense[];
  budgets: Budgets;
  loading: boolean;
  refresh: () => Promise<void>;
  submit: (s: Omit<Submission, "receiptCount">, files: File[]) => Promise<void>;
  review: (id: string, decision: "approve" | "reject" | "reimburse", note?: string) => Promise<void>;
  setBudget: (dept: Department, amount: number) => Promise<void>;
  signedUrl: (path: string) => Promise<string | null>;
}
const StoreCtx = createContext<Ctx | null>(null);

const EMPTY_BUDGETS: Budgets = { Engineering: 0, Sales: 0, Marketing: 0, Operations: 0 };

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [people, setPeople] = useState<Record<string, User>>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budgets>(EMPTY_BUDGETS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, r, e, h, b] = await Promise.all([
      supabase.from("profiles").select("id, full_name, department"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("expenses").select("*").order("created_at", { ascending: false }),
      supabase.from("expense_history").select("*").order("created_at"),
      supabase.from("department_budgets").select("department, amount"),
    ]);
    const roles: Record<string, Role> = {};
    const rank: Record<Role, number> = { employee: 0, manager: 1, finance: 2 };
    for (const x of r.data ?? []) {
      const cur = roles[x.user_id];
      if (!cur || rank[x.role] > rank[cur]) roles[x.user_id] = x.role;
    }
    const ppl: Record<string, User> = {};
    for (const x of p.data ?? []) ppl[x.id] = { id: x.id, name: x.full_name, department: x.department as Department, role: roles[x.id] ?? "employee" };
    const hist: Record<string, Expense["history"]> = {};
    for (const x of h.data ?? []) (hist[x.expense_id] ??= []).push({ at: x.created_at, by: x.actor_id, action: x.action as HistoryAction, note: x.note ?? undefined });
    setPeople(ppl);
    setExpenses(
      (e.data ?? []).map((x) => ({
        id: x.id, employeeId: x.employee_id, department: x.department as Department, title: x.title, merchant: x.merchant,
        category: x.category as Category, amount: Number(x.amount), date: x.expense_date, description: x.description,
        receipts: (x.receipts as unknown as Receipt[]) ?? [], status: x.status as Status, history: hist[x.id] ?? [],
      })),
    );
    const bud = { ...EMPTY_BUDGETS };
    for (const x of b.data ?? []) if (DEPARTMENTS.includes(x.department as Department)) bud[x.department as Department] = Number(x.amount);
    setBudgets(bud);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, userId]);

  const user: User = people[userId] ?? { id: userId, name: "", role: "employee", department: "Engineering" };

  const submit: Ctx["submit"] = async (s, files) => {
    validateSubmission({ ...s, receiptCount: files.length });
    const receipts: Receipt[] = [];
    for (const f of files) {
      const path = `${userId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("receipts").upload(path, f, { contentType: f.type });
      if (error) throw new Error(`Couldn't upload ${f.name}`);
      receipts.push({ name: f.name, type: f.type, path });
    }
    const { error } = await supabase.from("expenses").insert({
      employee_id: userId, department: user.department, title: s.title.trim(), merchant: s.merchant, category: s.category,
      amount: s.amount, expense_date: s.date, description: s.description, receipts: receipts as never, status: "pending_manager",
    });
    if (error) throw new Error(error.message);
    await refresh();
  };

  const review: Ctx["review"] = async (id, decision, note) => {
    const { error } = await supabase.rpc("review_expense", { _expense_id: id, _decision: decision, _note: note ?? "" });
    if (error) throw new Error(error.message);
    await refresh();
  };

  const setBudget: Ctx["setBudget"] = async (dept, amount) => {
    validateBudget(amount);
    const { error } = await supabase.from("department_budgets").upsert({ department: dept, amount, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await refresh();
  };

  const signedUrl = async (path: string) => {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  };

  return (
    <StoreCtx.Provider value={{ user, people, expenses, budgets, loading, refresh, submit, review, setBudget, signedUrl }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
