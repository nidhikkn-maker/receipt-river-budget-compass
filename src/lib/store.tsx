import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveExpense } from "./fx.functions";
import {
  validateBudget, validateExpense,
  type Budgets, type Category, type Expense, type ExpenseInput, type Member, type PaymentMethod, type Receipt, type Scope,
  type Split,
} from "./expenses";
import type { Account, AccountKind, TxnType } from "./ledger";
import { defaultPreferences, type FinancePreferences } from "./preferences";
import { nextAfter, type Commitment, type CommitmentKind, type CommitmentStatus, type Frequency } from "./planning";

export interface Loan { id: string; name: string; principal: number; rate: number; emi: number; nextDue: string }
export interface Goal { id: string; name: string; target: number; saved: number; monthly: number; reserve: boolean }

interface Ctx {
  preferences: FinancePreferences;
  savePreferences: (p: FinancePreferences) => Promise<void>;
  moveCategory: (source: string, target: string) => Promise<void>;
  userId: string;
  name: string;
  members: Member[];
  memberName: (id: string | null) => string;
  /** Spending only (type expense) — used by budgets, family and expense reports. */
  expenses: Expense[];
  /** Every ledger entry: expenses, income, transfers, refunds, adjustments. */
  transactions: Expense[];
  accounts: Account[];
  commitments: Commitment[];
  loans: Loan[];
  goals: Goal[];
  saveCommitment: (c: Omit<Commitment, "id"> & { id?: string }) => Promise<void>;
  removeCommitment: (id: string) => Promise<void>;
  /** Records the actual payment/receipt as a transaction and moves the due date forward. */
  confirmCommitment: (c: Commitment, amount: number) => Promise<void>;
  saveLoan: (l: Omit<Loan, "id"> & { id?: string }) => Promise<void>;
  removeLoan: (id: string) => Promise<void>;
  saveGoal: (g: Omit<Goal, "id"> & { id?: string }) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
  updateAccount: (id: string, patch: { creditLimit?: number | null; dueDay?: number | null; minBalance?: number }) => Promise<void>;
  addAccount: (a: { name: string; kind: AccountKind; openingBalance: number }) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
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
  const [expenses, setExpensesAll] = useState<Expense[]>([]);
  const setExpenses = setExpensesAll;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budgets>({});
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<FinancePreferences>(defaultPreferences);

  const refresh = useCallback(async () => {
    const [p, m, e, b, a, c, l, g, pref] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      supabase.from("family_members").select("id, name, relation").order("created_at"),
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("category_budgets").select("category, monthly_amount"),
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("commitments").select("*").order("next_due"),
      supabase.from("loans").select("*").order("created_at"),
      supabase.from("goals").select("*").order("created_at"),
      supabase.from("finance_preferences").select("data").eq("owner_id", userId).maybeSingle(),
    ]);
    setPreferences({ ...defaultPreferences(), ...(pref.data?.data as unknown as Partial<FinancePreferences> ?? {}) });
    setCommitments((c.data ?? []).map((x) => ({ id: x.id, name: x.name, kind: x.kind as CommitmentKind, direction: x.direction as "in" | "out", amount: Number(x.amount),
      frequency: x.frequency as Frequency, intervalDays: x.interval_days, nextDue: x.next_due, accountId: x.account_id, category: x.category,
      confirmed: x.confirmed, essential: x.essential, status: x.status as CommitmentStatus })));
    setLoans((l.data ?? []).map((x) => ({ id: x.id, name: x.name, principal: Number(x.principal_outstanding), rate: Number(x.annual_rate), emi: Number(x.emi), nextDue: x.next_due })));
    setGoals((g.data ?? []).map((x) => ({ id: x.id, name: x.name, target: Number(x.target), saved: Number(x.saved), monthly: Number(x.monthly), reserve: x.reserve })));
    setAccounts((a.data ?? []).map((x) => ({ id: x.id, name: x.name, kind: x.kind as AccountKind, openingBalance: Number(x.opening_balance), archived: x.archived, creditLimit: x.credit_limit == null ? null : Number(x.credit_limit), dueDay: x.due_day, minBalance: Number(x.min_balance) })));
    setName(p.data?.full_name ?? "");
    setMembers(m.data ?? []);
    setExpenses(
      (e.data ?? []).map((x) => ({
        id: x.id, title: x.title, merchant: x.merchant, category: x.category as Category, scope: x.scope as Scope, memberId: x.member_id, splits: (x.splits as unknown as Split[]) ?? [],
        amount: Number(x.amount), currency: x.currency, originalAmount: Number(x.original_amount ?? x.amount), fxRate: Number(x.fx_rate),
        paymentMethod: x.payment_method as PaymentMethod, reconciledAt: x.reconciled_at, statementRef: x.statement_ref,
        date: x.expense_date, description: x.description, receipts: (x.receipts as unknown as Receipt[]) ?? [],
        txnType: x.txn_type as TxnType, accountId: x.account_id, toAccountId: x.to_account_id, tags: x.tags ?? [],
        receiptDetails: x.receipt_details as unknown as Expense["receiptDetails"],
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
      txnType: s.txnType ?? "expense", accountId: s.accountId ?? null, toAccountId: s.toAccountId ?? null, tags: s.tags ?? [],
      receiptDetails: s.receiptDetails,
      ...(receipts ? { receipts } : {}),
    } });
    if (!res.ok) throw new Error(res.error);
    await refresh();
  };

  const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
  const savePreferences: Ctx["savePreferences"] = async (p) => {
    check((await supabase.from("finance_preferences").upsert({ owner_id: userId, data: p as unknown as import("@/integrations/supabase/types").Json, updated_at: new Date().toISOString() })).error);
    setPreferences(p);
  };
  const moveCategory: Ctx["moveCategory"] = async (source, target) => {
    check((await supabase.rpc("move_expense_category", { source, target })).error);
    await refresh();
  };

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
  const addAccount: Ctx["addAccount"] = async (x) => {
    if (!x.name.trim()) throw new Error("Name the account");
    if (!Number.isFinite(x.openingBalance)) throw new Error("Enter an opening balance");
    check((await supabase.from("accounts").insert({ owner_id: userId, name: x.name.trim(), kind: x.kind, opening_balance: x.openingBalance })).error);
    await refresh();
  };
  const setArchived: Ctx["setArchived"] = async (id, archived) => {
    check((await supabase.from("accounts").update({ archived }).eq("id", id)).error);
    await refresh();
  };
  const pos = (n: number, what: string) => { if (!(n > 0)) throw new Error(`${what} must be greater than zero`); };
  const saveCommitment: Ctx["saveCommitment"] = async (x) => {
    if (!x.name.trim()) throw new Error("Give it a name");
    pos(x.amount, "Amount");
    const row = { owner_id: userId, name: x.name.trim(), kind: x.kind, direction: x.direction, amount: x.amount, frequency: x.frequency, interval_days: x.intervalDays,
      next_due: x.nextDue, account_id: x.accountId, category: x.category, confirmed: x.confirmed, essential: x.essential, status: x.status };
    check((x.id ? await supabase.from("commitments").update(row).eq("id", x.id) : await supabase.from("commitments").insert(row)).error);
    await refresh();
  };
  const removeCommitment: Ctx["removeCommitment"] = async (id) => { check((await supabase.from("commitments").delete().eq("id", id)).error); await refresh(); };
  const confirmCommitment: Ctx["confirmCommitment"] = async (c, amount) => {
    pos(amount, "Amount");
    await save({ title: c.name, merchant: c.name, category: (c.category as Category), scope: "personal", memberId: null, amount, currency: "INR",
      paymentMethod: "bank_transfer", date: new Date().toISOString().slice(0, 10), description: `Recurring: ${c.name}`,
      txnType: c.direction === "in" ? "income" : "expense", accountId: c.accountId, tags: ["recurring"] });
    check((await supabase.from("commitments").update({ next_due: nextAfter(c.nextDue, c.frequency, c.intervalDays) }).eq("id", c.id)).error);
    await refresh();
  };
  const saveLoan: Ctx["saveLoan"] = async (x) => {
    if (!x.name.trim()) throw new Error("Name the loan");
    pos(x.principal, "Outstanding amount"); pos(x.emi, "EMI");
    if (!(x.rate >= 0)) throw new Error("Enter the interest rate");
    const row = { owner_id: userId, name: x.name.trim(), principal_outstanding: x.principal, annual_rate: x.rate, emi: x.emi, next_due: x.nextDue };
    check((x.id ? await supabase.from("loans").update(row).eq("id", x.id) : await supabase.from("loans").insert(row)).error);
    await refresh();
  };
  const removeLoan: Ctx["removeLoan"] = async (id) => { check((await supabase.from("loans").delete().eq("id", id)).error); await refresh(); };
  const saveGoal: Ctx["saveGoal"] = async (x) => {
    if (!x.name.trim()) throw new Error("Name the goal");
    pos(x.target, "Target");
    if (x.saved < 0 || x.monthly < 0) throw new Error("Amounts can't be negative");
    const row = { owner_id: userId, name: x.name.trim(), target: x.target, saved: x.saved, monthly: x.monthly, reserve: x.reserve };
    check((x.id ? await supabase.from("goals").update(row).eq("id", x.id) : await supabase.from("goals").insert(row)).error);
    await refresh();
  };
  const removeGoal: Ctx["removeGoal"] = async (id) => { check((await supabase.from("goals").delete().eq("id", id)).error); await refresh(); };
  const updateAccount: Ctx["updateAccount"] = async (id, p) => {
    const row: { credit_limit?: number | null; due_day?: number | null; min_balance?: number } = {};
    if (p.creditLimit !== undefined) row.credit_limit = p.creditLimit;
    if (p.dueDay !== undefined) { if (p.dueDay !== null && !(p.dueDay >= 1 && p.dueDay <= 31)) throw new Error("Due day must be 1–31"); row.due_day = p.dueDay; }
    if (p.minBalance !== undefined) row.min_balance = p.minBalance;
    check((await supabase.from("accounts").update(row).eq("id", id)).error);
    await refresh();
  };
  const signedUrl = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  }, []);

  return (
    <StoreCtx.Provider value={{ preferences, savePreferences, moveCategory, userId, name, members, memberName, expenses: expenses.filter((x) => (x.txnType ?? "expense") === "expense"), transactions: expenses, accounts, addAccount, setArchived, commitments, loans, goals, saveCommitment, removeCommitment, confirmCommitment, saveLoan, removeLoan, saveGoal, removeGoal, updateAccount, budgets, loading, refresh, save, remove, setScope, reconcile, addMember, removeMember, setBudget, signedUrl }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
