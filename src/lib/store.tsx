import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveExpense } from "./fx.functions";
import {
  validateBudget, validateExpense,
  type Budgets, type Category, type Expense, type ExpenseInput, type Member, type PaymentMethod, type Receipt, type Scope,
} from "./expenses";

interface Ctx {
  userId: string;
  name: string;
  members: Member[];
  memberName: (id: string | null) => string;
  expenses: Expense[];
  budgets: Budgets;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (s: ExpenseInput, opts?: { id?: string; files?: File[] }) => Promise<void>;
  remove: (e: Expense) => Promise<void>;
  setScope: (id: string, scope: Scope) => Promise<void>;
  reconcile: (id: string, ref: string | null) => Promise<void>;
  addMember: (name: string, relation: string) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  setBudget: (c: Category, amount: number) => Promise<void>;
  signedUrl: (path: string) => Promise<string | null>;
}
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budgets>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, m, e, b] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      supabase.from("family_members").select("id, name, relation").order("created_at"),
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("category_budgets").select("category, monthly_amount"),
    ]);
    setName(p.data?.full_name ?? "");
    setMembers(m.data ?? []);
    setExpenses(
      (e.data ?? []).map((x) => ({
        id: x.id, title: x.title, merchant: x.merchant, category: x.category as Category, scope: x.scope as Scope, memberId: x.member_id, splits: (x.splits as unknown as Split[]) ?? [],
        amount: Number(x.amount), currency: x.currency, originalAmount: Number(x.original_amount ?? x.amount), fxRate: Number(x.fx_rate),
        paymentMethod: x.payment_method as PaymentMethod, reconciledAt: x.reconciled_at, statementRef: x.statement_ref,
        date: x.expense_date, description: x.description, receipts: (x.receipts as unknown as Receipt[]) ?? [],
      })),
    );
    const bud: Budgets = {};
    for (const x of b.data ?? []) bud[x.category as Category] = Number(x.monthly_amount);
    setBudgets(bud);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const memberName = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? "Family" : "Me");

  const save: Ctx["save"] = async (s, opts) => {
    validateExpense(s);
    let receipts: Receipt[] | undefined;
    if (opts?.files?.length) {
      receipts = [];
      for (const f of opts.files) {
        const path = `${userId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("receipts").upload(path, f, { contentType: f.type });
        if (error) throw new Error(`Couldn't upload ${f.name}`);
        receipts.push({ name: f.name, type: f.type, path });
      }
    }
    const res = await saveExpense({ data: {
      id: opts?.id ?? null, title: s.title.trim(), merchant: s.merchant, category: s.category, scope: s.scope, memberId: s.memberId, splits: s.splits ?? [],
      currency: s.currency, originalAmount: s.amount, date: s.date, description: s.description, paymentMethod: s.paymentMethod,
      ...(receipts ? { receipts } : {}),
    } });
    if (!res.ok) throw new Error(res.error);
    await refresh();
  };

  const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

  const remove: Ctx["remove"] = async (e) => {
    check((await supabase.from("expenses").delete().eq("id", e.id)).error);
    if (e.receipts.length) await supabase.storage.from("receipts").remove(e.receipts.map((r) => r.path));
    await refresh();
  };
  const setScope: Ctx["setScope"] = async (id, scope) => {
    check((await supabase.from("expenses").update({ scope }).eq("id", id)).error);
    setExpenses((xs) => xs.map((x) => (x.id === id ? { ...x, scope } : x)));
  };
  const reconcile: Ctx["reconcile"] = async (id, ref) => {
    check((await supabase.from("expenses").update({ statement_ref: ref, reconciled_at: ref ? new Date().toISOString() : null }).eq("id", id)).error);
    await refresh();
  };
  const addMember: Ctx["addMember"] = async (n, relation) => {
    if (!n.trim()) throw new Error("Enter a name");
    check((await supabase.from("family_members").insert({ owner_id: userId, name: n.trim(), relation: relation.trim() })).error);
    await refresh();
  };
  const removeMember: Ctx["removeMember"] = async (id) => {
    check((await supabase.from("family_members").delete().eq("id", id)).error);
    await refresh();
  };
  const setBudget: Ctx["setBudget"] = async (category, amount) => {
    validateBudget(amount);
    check((await supabase.from("category_budgets").upsert({ owner_id: userId, category, monthly_amount: amount, updated_at: new Date().toISOString() })).error);
    await refresh();
  };
  const signedUrl = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  }, []);

  return (
    <StoreCtx.Provider value={{ userId, name, members, memberName, expenses, budgets, loading, refresh, save, remove, setScope, reconcile, addMember, removeMember, setBudget, signedUrl }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
