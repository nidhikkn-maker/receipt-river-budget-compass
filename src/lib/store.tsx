import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { queueEntry, pendingEntries, removePending, putSnapshot, getSnapshot } from "./offline";
import { deleteFinanceData } from "./delete-data";
import { saveExpense } from "./fx.functions";
import {
  CHARGES_CATEGORY, validateAllocations, validateBudget, validateExpense, type Allocation,
  type Budgets, type Category, type Expense, type ExpenseInput, type Member, type PaymentMethod, type Receipt, type ReceiptDetails, type ReimbursementStatus, type Scope, type Split,
} from "./expenses";
import { accountBalance, adjustmentToMatch, type Account, type AccountDetails, type AccountKind, type TxnType, type Valuation } from "./ledger";
import { statusColumn, validateReceipt, type ReimbursementInfo } from "./reimbursements";
import { normalizePreferences, defaultPreferences, validateActiveCategory, type FinancePreferences } from "./preferences";
import { addMonths, emiFor, emiSplit, nextAfter, type Commitment, type CommitmentKind, type CommitmentStatus, type Frequency, type LoanType } from "./planning";
import { lastStatementDate, nextEmiInstalment, statementShift, type LoanPayment } from "./cards";
import { validateDocument, type DocType, type VaultDoc } from "./documents";

export interface Loan {
  id: string; name: string;
  /** Outstanding principal: the linked loan account's ledger balance, or the instalment log for card EMIs. */
  principal: number;
  rate: number; emi: number; nextDue: string;
  provider: string; loanType: LoanType; original: number; startDate: string | null; prepaymentTerms: string; foreclosurePct: number;
  accountId: string | null; sourceTransactionId: string | null; payments: LoanPayment[]; status: "active" | "closed";
}
export interface LoanInput {
  id?: string; name: string; principal: number; rate: number; emi: number; nextDue: string;
  provider: string; loanType: LoanType; original?: number | null; startDate?: string | null; prepaymentTerms: string; foreclosurePct: number;
}
export interface Goal { id: string; name: string; target: number; saved: number; monthly: number; reserve: boolean }
export interface AuditEntry { id: string; action: "created" | "updated" | "deleted"; changes: Record<string, unknown>; summary: string; createdAt: string }
export interface CategoryBatch { id: string; category: string; createdAt: string; undoneAt: string | null; entries: { id: string; title: string; from: string; allocations: Allocation[]; revision: number }[] }
export interface AccountPatch {
  name?: string; creditLimit?: number | null; dueDay?: number | null; minBalance?: number; issuer?: string; lastFour?: string | null;
  statementDay?: number | null; interestRate?: number | null; includeInCash?: boolean; details?: AccountDetails;
}
export interface NewAccount { name: string; kind: AccountKind; openingBalance: number; issuer?: string; lastFour?: string | null; creditLimit?: number | null; statementDay?: number | null; dueDay?: number | null; interestRate?: number | null; details?: AccountDetails }
export interface DocumentMeta { title: string; docType: DocType; docDate: string | null; amount: number | null; currency: string; merchant: string | null; notes: string; text?: string; transactionId: string | null; accountId: string | null; loanId: string | null; expiresOn: string | null }

interface Snapshot { name: string; members: Member[]; expenses: Expense[]; accounts: Account[]; commitments: Commitment[]; rawLoans: Loan[]; goals: Goal[]; budgets: Budgets; preferences: FinancePreferences; valuations: Valuation[]; documents: VaultDoc[] }

interface Ctx {
  departmentBudgets: Record<string, number>;
  departmentBudgetError: boolean;
  pendingCount: number;
  preferences: FinancePreferences;
  savePreferences: (p: FinancePreferences) => Promise<void>;
  ensureCategory: (name: string) => Promise<void>;
  moveCategory: (source: string, target: string) => Promise<void>;
  /** Recategorises many entries at once; clears any category split so it can't contradict the new category. */
  bulkSetCategory: (ids: string[], category: string, batchId: string) => Promise<string>;
  categoryHistory: () => Promise<CategoryBatch[]>;
  undoCategoryBatch: (id: string) => Promise<void>;
  userId: string;
  name: string;
  updateName: (name: string) => Promise<void>;
  members: Member[];
  memberName: (id: string | null) => string;
  /** Spending only (type expense) — used by budgets, family and expense reports. */
  expenses: Expense[];
  /** Every ledger entry: expenses, income, transfers, refunds, reimbursements, adjustments. */
  transactions: Expense[];
  accounts: Account[];
  commitments: Commitment[];
  loans: Loan[];
  goals: Goal[];
  valuations: Valuation[];
  documents: VaultDoc[];
  saveCommitment: (c: Omit<Commitment, "id"> & { id?: string }) => Promise<void>;
  confirmIrregular: (c: { key: string; name: string; category: string; everyMonths: number }, amount: number, date: string) => Promise<void>;
  removeCommitment: (id: string) => Promise<void>;
  /** Records the actual payment/receipt as a transaction and moves the due date forward. */
  confirmCommitment: (c: Commitment, amount: number, accountId?: string | null) => Promise<void>;
  saveLoan: (l: LoanInput) => Promise<void>;
  removeLoan: (id: string) => Promise<void>;
  /** Records one EMI: principal as a transfer to the loan account, interest as a financial charge. */
  recordLoanPayment: (l: Loan, p: { fromAccountId: string | null; date: string; principal?: number; interest?: number }) => Promise<void>;
  convertToEmi: (e: Expense, o: { months: number; rate: number; fee: number }) => Promise<void>;
  saveGoal: (g: Omit<Goal, "id"> & { id?: string }) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
  updateAccount: (id: string, patch: AccountPatch) => Promise<void>;
  addAccount: (a: NewAccount) => Promise<string>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  adjustBalance: (a: Account, actual: number, date: string) => Promise<boolean>;
  addValuation: (v: Omit<Valuation, "id">) => Promise<void>;
  removeValuation: (id: string) => Promise<void>;
  addDocument: (file: File, meta: DocumentMeta) => Promise<string>;
  updateDocument: (id: string, meta: Partial<DocumentMeta>) => Promise<void>;
  removeDocument: (d: VaultDoc) => Promise<void>;
  history: (transactionId: string) => Promise<AuditEntry[]>;
  setReimbursement: (id: string, status: ReimbursementStatus) => Promise<void>;
  recordReimbursement: (ids: string[], accountId: string | null, date: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  budgets: Budgets;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (s: ExpenseInput, opts?: { id?: string; files?: File[]; createId?: string; noRefresh?: boolean }) => Promise<void>;
  remove: (e: Expense) => Promise<void>;
  setScope: (id: string, scope: Scope) => Promise<void>;
  /** Changes labels only — amount, currency and stored exchange rate are untouched. */
  setTags: (id: string, tags: string[]) => Promise<void>;
  reconcile: (id: string, ref: string | null, opts?: { noRefresh?: boolean }) => Promise<void>;
  addMember: (name: string, relation: string) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  setBudget: (c: Category, amount: number) => Promise<void>;
  signedUrl: (path: string) => Promise<string | null>;
  setAllocations: (e: Expense, lines: Allocation[]) => Promise<void>;
  updateReimbursement: (e: Expense, info: ReimbursementInfo) => Promise<void>;
  addReimbursementReceipt: (e: Expense, r: { amount: number; date: string; accountId: string | null; note?: string; operationId: string }) => Promise<void>;
  listReviews: () => Promise<SavedReview[]>;
  saveReview: (r: Omit<SavedReview, "id" | "generatedAt">) => Promise<void>;
}
export interface SavedReview { id: string; month: string; figures: unknown; dataHash: string; narrative: string; dataCutoff: string; generatedAt: string }
const StoreCtx = createContext<Ctx | null>(null);
const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const safeName = (n: string) => n.replace(/[^\w.-]/g, "_").slice(-120);

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [rawLoans, setLoans] = useState<Loan[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [documents, setDocuments] = useState<VaultDoc[]>([]);
  const [budgets, setBudgets] = useState<Budgets>({});
  const [departmentBudgets, setDepartmentBudgets] = useState<Record<string, number>>({});
  const [departmentBudgetError, setDepartmentBudgetError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const syncing = useRef(false);
  const deleting = useRef(false);
  const [preferences, setPreferences] = useState<FinancePreferences>(defaultPreferences);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) {
      const cached = await getSnapshot<Snapshot>(userId).catch(() => undefined);
      if (cached) {
        setName(cached.name); setMembers(cached.members); setExpenses(cached.expenses); setAccounts(cached.accounts); setCommitments(cached.commitments);
        setLoans(cached.rawLoans ?? []); setGoals(cached.goals); setBudgets(cached.budgets); setPreferences(normalizePreferences(cached.preferences));
        setValuations(cached.valuations ?? []); setDocuments(cached.documents ?? []);
      }
      setLoading(false); return;
    }
    const [p, m, e, b, a, c, l, g, pref, v, d, db] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      supabase.from("family_members").select("id, name, relation").order("created_at"),
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("category_budgets").select("category, monthly_amount"),
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("commitments").select("*").order("next_due"),
      supabase.from("loans").select("*").order("created_at"),
      supabase.from("goals").select("*").order("created_at"),
      supabase.from("finance_preferences").select("data").eq("owner_id", userId).maybeSingle(),
      supabase.from("asset_valuations").select("*").order("valued_on", { ascending: false }),
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
      supabase.from("department_budgets").select("department,amount"),
    ]);
    const firstError = [e, a, c, l, g, v, d].find((x) => x.error)?.error;
    setDepartmentBudgetError(!!db.error);
    setDepartmentBudgets(Object.fromEntries((db.data ?? []).map((x) => [x.department, Number(x.amount)])));
    if (firstError) toast.error("Some records couldn't load — pull to refresh or try again");
    setPreferences(normalizePreferences(pref.data?.data as unknown as Partial<FinancePreferences>));
    setCommitments((c.data ?? []).map((x) => ({ id: x.id, name: x.name, kind: x.kind as CommitmentKind, direction: x.direction as "in" | "out", amount: Number(x.amount),
      frequency: x.frequency as Frequency, intervalDays: x.interval_days, nextDue: x.next_due, accountId: x.account_id, category: x.category,
      confirmed: x.confirmed, essential: x.essential, status: x.status as CommitmentStatus })));
    setLoans((l.data ?? []).map((x) => ({
      id: x.id, name: x.name, principal: Number(x.principal_outstanding), rate: Number(x.annual_rate), emi: Number(x.emi), nextDue: x.next_due,
      provider: x.provider, loanType: x.loan_type as LoanType, original: Number(x.original_principal ?? x.principal_outstanding), startDate: x.start_date,
      prepaymentTerms: x.prepayment_terms, foreclosurePct: Number(x.foreclosure_pct), accountId: x.account_id, sourceTransactionId: x.source_transaction_id,
      payments: (x.payments as unknown as LoanPayment[]) ?? [], status: x.status === "closed" ? "closed" : "active",
    })));
    setGoals((g.data ?? []).map((x) => ({ id: x.id, name: x.name, target: Number(x.target), saved: Number(x.saved), monthly: Number(x.monthly), reserve: x.reserve })));
    setAccounts((a.data ?? []).map((x) => ({
      id: x.id, name: x.name, kind: x.kind as AccountKind, openingBalance: Number(x.opening_balance), archived: x.archived,
      creditLimit: x.credit_limit == null ? null : Number(x.credit_limit), dueDay: x.due_day, minBalance: Number(x.min_balance),
      issuer: x.issuer, lastFour: x.last_four, statementDay: x.statement_day, interestRate: x.interest_rate == null ? null : Number(x.interest_rate),
      includeInCash: x.include_in_cash, details: (x.details as unknown as AccountDetails) ?? {},
    })));
    setValuations((v.data ?? []).map((x) => ({ id: x.id, accountId: x.account_id, value: Number(x.value), valuedOn: x.valued_on, source: x.source, note: x.note })));
    setDocuments((d.data ?? []).map((x) => ({
      id: x.id, title: x.title, docType: x.doc_type as DocType, filePath: x.file_path, fileName: x.file_name, mimeType: x.mime_type, size: x.size_bytes,
      docDate: x.doc_date, amount: x.amount == null ? null : Number(x.amount), currency: x.currency, merchant: x.merchant, notes: x.notes, text: x.extracted_text,
      transactionId: x.transaction_id, accountId: x.account_id, loanId: x.loan_id, expiresOn: x.expires_on, createdAt: x.created_at,
    })));
    setName(p.data?.full_name ?? "");
    setMembers(m.data ?? []);
    setExpenses((e.data ?? []).map((x) => ({
      id: x.id, categoryRevision: x.category_revision, department: x.department, title: x.title, merchant: x.merchant, category: x.category as Category, scope: x.scope as Scope, memberId: x.member_id, splits: (x.splits as unknown as Split[]) ?? [],
      amount: Number(x.amount), currency: x.currency, originalAmount: Number(x.original_amount ?? x.amount), fxRate: Number(x.fx_rate),
      paymentMethod: x.payment_method as PaymentMethod, reconciledAt: x.reconciled_at, statementRef: x.statement_ref,
      date: x.expense_date, description: x.description, receipts: (x.receipts as unknown as Receipt[]) ?? [],
      txnType: x.txn_type as TxnType, accountId: x.account_id, toAccountId: x.to_account_id, paymentInstrumentId: x.payment_instrument_id, tags: x.tags ?? [],
      receiptDetails: x.receipt_details as unknown as ReceiptDetails, reimbursementStatus: x.reimbursement_status as ReimbursementStatus,
      adjustmentSign: x.adjustment_sign === -1 ? -1 : 1,
      allocations: (x.allocations as unknown as Allocation[]) ?? [], reimbursement: (x.reimbursement as unknown as ReimbursementInfo) ?? {},
    })));
    const bud: Budgets = {};
    for (const x of b.data ?? []) bud[x.category as Category] = Number(x.monthly_amount);
    setBudgets(bud);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!loading && navigator.onLine) void putSnapshot(userId, { name, members, expenses, accounts, commitments, rawLoans, goals, budgets, preferences, valuations, documents } satisfies Snapshot).catch(() => {});
  }, [loading, userId, name, members, expenses, accounts, commitments, rawLoans, goals, budgets, preferences, valuations, documents]);

  // Loan principal comes from the linked loan account's ledger, so EMI transfers keep it right.
  const loans = useMemo(() => rawLoans.map((l) => {
    const acc = accounts.find((a) => a.id === l.accountId);
    if (l.loanType !== "credit_card_emi" && acc && (acc.kind === "loan" || acc.kind === "other_liability")) return { ...l, principal: Math.max(0, accountBalance(acc, expenses)) };
    return l;
  }), [rawLoans, accounts, expenses]);

  const memberName = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? "Family" : "Me");
  const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

  const save: Ctx["save"] = async (s, opts) => {
    if (deleting.current) throw new Error("Please wait until data deletion finishes.");
    validateExpense(s);
    validateActiveCategory(preferences.categories, s.category, !!opts?.id);
    if (!navigator.onLine) {
      if (opts?.id) throw Error("Reconnect to edit an existing transaction");
      await queueEntry({ id: opts?.createId ?? crypto.randomUUID(), owner: userId, input: s, files: opts?.files ?? [], createdAt: new Date().toISOString() });
      setPendingCount((await pendingEntries(userId)).length);
      toast.message("Saved offline — waiting to sync"); return;
    }
    let receipts: Receipt[] | undefined;
    if (opts?.files?.length) {
      const existing = opts.id ? expenses.find((x) => x.id === opts.id)?.receipts ?? [] : [];
      receipts = [...existing];
      for (const f of opts.files) {
        const path = `${userId}/${crypto.randomUUID()}-${safeName(f.name)}`;
        const { error } = await supabase.storage.from("receipts").upload(path, f, { contentType: f.type });
        if (error) throw new Error(`Couldn't upload ${f.name}`);
        receipts.push({ name: f.name, type: f.type, path });
      }
    }
    const res = await saveExpense({ data: {
      id: opts?.id ?? null, ...(opts?.createId ? { createId: opts.createId } : {}), title: s.title.trim(), merchant: s.merchant, category: s.category, scope: s.scope, memberId: s.memberId, splits: s.splits ?? [],
      currency: s.currency, originalAmount: s.amount, date: s.date, description: s.description, paymentMethod: s.paymentMethod,
      txnType: s.txnType ?? "expense", accountId: s.accountId ?? null, toAccountId: s.toAccountId ?? null, paymentInstrumentId: s.paymentInstrumentId ?? null, tags: s.tags ?? [],
      receiptDetails: s.receiptDetails, reimbursementStatus: s.reimbursementStatus ?? "none", adjustmentSign: s.adjustmentSign ?? 1,
      ...(receipts ? { receipts } : {}),
    } });
    if (!res.ok) throw new Error(res.error);
    if (!opts?.noRefresh) await refresh();
  };

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const entries = await pendingEntries(userId).catch(() => []);
      if (active) setPendingCount(entries.length);
      if (!navigator.onLine || syncing.current || deleting.current || !entries.length) return;
      syncing.current = true;
      try {
        for (const entry of entries) {
          if (!navigator.onLine || deleting.current) break;
          await save(entry.input, { createId: entry.id, files: entry.files });
          if (!navigator.onLine) break;
          await removePending(entry.id);
        }
        if (active) setPendingCount((await pendingEntries(userId)).length);
        toast.success("Offline entries synced");
      } catch { toast.error("Offline entry is still waiting — reconnect to retry"); } finally { syncing.current = false; }
    };
    void sync(); window.addEventListener("online", sync);
    return () => { active = false; window.removeEventListener("online", sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const savePreferences: Ctx["savePreferences"] = async (p) => {
    const previous=preferences;
    setPreferences(p);
    try { check((await supabase.from("finance_preferences").upsert({ owner_id: userId, data: p as unknown as Json, updated_at: new Date().toISOString() })).error); }
    catch(e){setPreferences(previous);throw e;}
  };
  const ensureCategory: Ctx["ensureCategory"] = async (cat) => {
    if (preferences.categories.some((c) => c.name === cat)) return;
    await savePreferences({ ...preferences, categories: [...preferences.categories, { name: cat, archived: false }] });
  };
  const moveCategory: Ctx["moveCategory"] = async (source, target) => {
    check((await supabase.rpc("move_expense_category", { source, target })).error);
    await refresh();
  };
  const bulkSetCategory: Ctx["bulkSetCategory"] = async (ids, category, batchId) => {
    validateActiveCategory(preferences.categories, category, false);
    const selected = expenses.filter(e => ids.includes(e.id));
    if (!selected.length) throw new Error("Nothing selected");
    const { data, error } = await supabase.rpc("bulk_category_change", { batch_id: batchId, target: category, items: selected.map(e => ({ id: e.id, revision: e.categoryRevision ?? 0 })) });
    check(error);
    await refresh();
    return data ?? batchId;
  };
  const categoryHistory: Ctx["categoryHistory"] = async () => {
    const { data, error } = await supabase.from("category_batches").select("*").order("created_at", { ascending: false });
    check(error);
    return (data ?? []).map(b => ({ id: b.id, category: b.category, createdAt: b.created_at, undoneAt: b.undone_at, entries: b.entries as unknown as CategoryBatch["entries"] }));
  };
  const undoCategoryBatch: Ctx["undoCategoryBatch"] = async id => {
    check((await supabase.rpc("undo_category_change", { batch_id: id })).error);
    await refresh();
  };
  const updateName: Ctx["updateName"] = async (n) => {
    const v = n.trim();
    if (!v) throw new Error("Enter your name");
    if (v.length > 80) throw new Error("Keep your name under 80 characters");
    check((await supabase.from("profiles").update({ full_name: v }).eq("id", userId)).error);
    setName(v);
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
  const setTags: Ctx["setTags"] = async (id, tags) => {
    check((await supabase.from("expenses").update({ tags }).eq("id", id)).error);
    setExpenses((xs) => xs.map((x) => (x.id === id ? { ...x, tags } : x)));
  };
  const setReimbursement: Ctx["setReimbursement"] = async (id, status) => {
    check((await supabase.from("expenses").update({ reimbursement_status: status }).eq("id", id)).error);
    setExpenses((xs) => xs.map((x) => (x.id === id ? { ...x, reimbursementStatus: status } : x)));
  };
  const setAllocations: Ctx["setAllocations"] = async (e, lines) => {
    validateAllocations(lines, e.amount);
    for (const l of lines) validateActiveCategory(preferences.categories, l.category, false);
    check((await supabase.from("expenses").update({ allocations: lines as unknown as Json }).eq("id", e.id)).error);
    setExpenses((xs) => xs.map((x) => (x.id === e.id ? { ...x, allocations: lines } : x)));
  };
  const updateReimbursement: Ctx["updateReimbursement"] = async (e, info) => {
    if (info.reimbursable != null && !(info.reimbursable > 0 && info.reimbursable <= e.amount)) throw new Error("Reimbursable amount must be above zero and no more than the expense");
    const received = (e.reimbursement?.receipts ?? []).reduce((sum, r) => sum + r.amount, 0);
    if ((info.reimbursable ?? e.amount) < received) throw new Error("Claimable amount cannot be less than money already received");
    info = { ...info, receipts: e.reimbursement?.receipts ?? [] };
    const next = { ...e, reimbursement: info };
    const status = statusColumn(next);
    check((await supabase.from("expenses").update({ reimbursement: info as unknown as Json, reimbursement_status: status }).eq("id", e.id)).error);
    setExpenses((xs) => xs.map((x) => (x.id === e.id ? { ...x, reimbursement: info, reimbursementStatus: status } : x)));
  };
  const addReimbursementReceipt: Ctx["addReimbursementReceipt"] = async (e, r) => {
    validateReceipt(e, r.amount);
    await operation("claim_receipt", { id: e.id, ...r });
    await refresh();
  };
  const listReviews: Ctx["listReviews"] = async () => {
    const { data, error } = await supabase.from("monthly_reviews").select("*").order("generated_at", { ascending: false }).limit(60);
    check(error);
    return (data ?? []).map((x) => ({ id: x.id, month: x.month, figures: x.figures, dataHash: x.data_hash, narrative: x.narrative, dataCutoff: x.data_cutoff, generatedAt: x.generated_at }));
  };
  const saveReview: Ctx["saveReview"] = async (r) => {
    check((await supabase.from("monthly_reviews").insert({ owner_id: userId, month: r.month, figures: r.figures as Json, data_hash: r.dataHash, narrative: r.narrative, data_cutoff: r.dataCutoff })).error);
  };
  const operation = async (action: string, payload: Record<string, unknown>) => {
    if (!navigator.onLine) throw Error("Reconnect to record this payment");
    const { data, error } = await supabase.rpc("finance_operation", { action, payload: payload as Json });
    check(error); return data;
  };
  const recordReimbursement: Ctx["recordReimbursement"] = async (ids, accountId, date) => {
    const unique=[...new Set(ids)].sort();
    await operation("reimbursement", { ids:unique, accountId, date, operationId: unique.join(":") });
    await refresh();
  };
  const confirmIrregular: Ctx["confirmIrregular"] = async (c, amount, date) => {
    await operation("confirm_irregular", { operationId: c.key, candidateKey: c.key, name: c.name, category: c.category, amount, nextDue: date, frequency: c.everyMonths === 12 ? "yearly" : "half_yearly", kind: c.category === "Insurance" ? "insurance" : c.category === "Education" ? "school_fee" : "other" });
    await refresh();
  };
  const reconcile: Ctx["reconcile"] = async (id, ref, opts) => {
    check((await supabase.from("expenses").update({ statement_ref: ref, reconciled_at: ref ? new Date().toISOString() : null }).eq("id", id)).error);
    if (!opts?.noRefresh) await refresh();
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
  const validateCard = (x: { lastFour?: string | null; statementDay?: number | null; dueDay?: number | null; creditLimit?: number | null; interestRate?: number | null }) => {
    if (x.lastFour && !/^\d{4}$/.test(x.lastFour)) throw new Error("Last four digits must be 4 numbers");
    if (x.statementDay != null && !(x.statementDay >= 1 && x.statementDay <= 31)) throw new Error("Statement day must be 1–31");
    if (x.dueDay != null && !(x.dueDay >= 1 && x.dueDay <= 31)) throw new Error("Due day must be 1–31");
    if (x.creditLimit != null && !(x.creditLimit >= 0)) throw new Error("Credit limit can't be negative");
    if (x.interestRate != null && !(x.interestRate >= 0 && x.interestRate <= 100)) throw new Error("Interest rate must be 0–100%");
  };
  const addAccount: Ctx["addAccount"] = async (x) => {
    if (!x.name.trim()) throw new Error("Name the account");
    if (!Number.isFinite(x.openingBalance)) throw new Error("Enter an opening balance");
    validateCard(x);
    const { data, error } = await supabase.from("accounts").insert({
      owner_id: userId, name: x.name.trim(), kind: x.kind, opening_balance: x.openingBalance, issuer: x.issuer?.trim() ?? "", last_four: x.lastFour || null,
      credit_limit: x.creditLimit ?? null, statement_day: x.statementDay ?? null, due_day: x.dueDay ?? null, interest_rate: x.interestRate ?? null, details: (x.details ?? {}) as Json,
    }).select("id").single();
    check(error);
    await refresh();
    if (!data) throw new Error("Account wasn't saved — try again");
    return data.id;
  };
  const setArchived: Ctx["setArchived"] = async (id, archived) => {
    check((await supabase.from("accounts").update({ archived }).eq("id", id)).error);
    await refresh();
  };
  const updateAccount: Ctx["updateAccount"] = async (id, p) => {
    validateCard(p);
    const row: Database["public"]["Tables"]["accounts"]["Update"] = {};
    if (p.name !== undefined) { if (!p.name.trim()) throw new Error("Name the account"); row["name"] = p.name.trim(); }
    if (p.creditLimit !== undefined) row["credit_limit"] = p.creditLimit;
    if (p.dueDay !== undefined) row["due_day"] = p.dueDay;
    if (p.minBalance !== undefined) { if (!(p.minBalance >= 0)) throw new Error("Minimum balance can't be negative"); row["min_balance"] = p.minBalance; }
    if (p.issuer !== undefined) row["issuer"] = p.issuer.trim();
    if (p.lastFour !== undefined) row["last_four"] = p.lastFour || null;
    if (p.statementDay !== undefined) row["statement_day"] = p.statementDay;
    if (p.interestRate !== undefined) row["interest_rate"] = p.interestRate;
    if (p.includeInCash !== undefined) row["include_in_cash"] = p.includeInCash;
    if (p.details !== undefined) row["details"] = p.details as Json;
    check((await supabase.from("accounts").update(row).eq("id", id)).error);
    await refresh();
  };
  const adjustBalance: Ctx["adjustBalance"] = async (a, actual, date) => {
    if (!Number.isFinite(actual)) throw new Error("Enter the balance you see at the bank");
    const adj = adjustmentToMatch(a, expenses.filter((t) => t.date <= date), actual);
    if (!adj) return false;
    await save({ title: `Balance adjustment — ${a.name}`, merchant: null, category: "Adjustment", scope: "personal", memberId: null, amount: adj.amount, currency: "INR",
      paymentMethod: "other", date, description: `Set balance to ₹${actual} on ${date} to match the statement`, txnType: "adjustment", accountId: a.id, adjustmentSign: adj.sign });
    return true;
  };
  const pos = (n: number, what: string) => { if (!(n > 0)) throw new Error(`${what} must be greater than zero`); };
  const saveCommitment: Ctx["saveCommitment"] = async (x) => {
    if (!x.name.trim()) throw new Error("Give it a name");
    pos(x.amount, "Amount");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.nextDue)) throw new Error("Pick the date");
    if (x.frequency === "custom" && !((x.intervalDays ?? 0) >= 1)) throw new Error("Repeat every 1 day or more");
    const row = { owner_id: userId, name: x.name.trim(), kind: x.kind, direction: x.direction, amount: x.amount, frequency: x.frequency, interval_days: x.intervalDays,
      next_due: x.nextDue, account_id: x.accountId, category: x.category, confirmed: x.confirmed, essential: x.essential, status: x.status };
    check((x.id ? await supabase.from("commitments").update(row).eq("id", x.id) : await supabase.from("commitments").insert(row)).error);
    await refresh();
  };
  const removeCommitment: Ctx["removeCommitment"] = async (id) => { check((await supabase.from("commitments").delete().eq("id", id)).error); await refresh(); };
  const confirmCommitment: Ctx["confirmCommitment"] = async (c, amount, accountId) => {
    await operation("commitment", { id: c.id, expectedDue: c.nextDue, amount, accountId: accountId ?? c.accountId, date: today() });
    await refresh();
  };
  const saveLoan: Ctx["saveLoan"] = async (x) => {
    if (!x.name.trim()) throw new Error("Name the loan");
    pos(x.emi, "EMI");
    if (!(x.rate >= 0 && x.rate <= 60)) throw new Error("Interest rate must be 0–60%");
    if (!(x.foreclosurePct >= 0 && x.foreclosurePct <= 20)) throw new Error("Foreclosure charge must be 0–20%");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.nextDue)) throw new Error("Pick the next EMI date");
    const row = { name: x.name.trim(), annual_rate: x.rate, emi: x.emi, next_due: x.nextDue, provider: x.provider.trim(), loan_type: x.loanType,
      start_date: x.startDate || null, prepayment_terms: x.prepaymentTerms.trim(), foreclosure_pct: x.foreclosurePct, original_principal: x.original ?? null };
    if (x.id) {
      const existing = rawLoans.find((l) => l.id === x.id);
      check((await supabase.from("loans").update(row).eq("id", x.id)).error);
      if (existing?.accountId && existing.loanType !== "credit_card_emi") await supabase.from("accounts").update({ name: x.name.trim() }).eq("id", existing.accountId);
    } else {
      await operation("create_loan", { ...x, operationId: crypto.randomUUID(), date: today() });
    }
    await refresh();
  };
  const removeLoan: Ctx["removeLoan"] = async (id) => {
    const l = rawLoans.find((x) => x.id === id);
    check((await supabase.from("loans").delete().eq("id", id)).error);
    if (l?.accountId && l.loanType !== "credit_card_emi") await supabase.from("accounts").update({ archived: true }).eq("id", l.accountId);
    await refresh();
  };
  const recordLoanPayment: Ctx["recordLoanPayment"] = async (l, p) => {
    await operation("loan_payment", { id: l.id, expectedDue: l.nextDue, ...p });
    await refresh();
  };
  const convertToEmi: Ctx["convertToEmi"] = async (e, o) => {
    await operation("convert_emi", { id: e.id, ...o, date: today() });
    await refresh();
  };
  const saveGoal: Ctx["saveGoal"] = async (x) => {
    if (!x.name.trim()) throw new Error("Name the goal");
    pos(x.target, "Target");
    if (x.saved < 0 || x.monthly < 0) throw new Error("Amounts can't be negative");
    const row = { owner_id: userId, name: x.name.trim(), target: x.target, saved: x.saved, monthly: x.monthly, reserve: x.reserve };
    check((x.id ? await supabase.from("goals").update(row).eq("id", x.id) : await supabase.from("goals").insert(row)).error);
    await refresh();
  };
  const removeGoal: Ctx["removeGoal"] = async (id) => { check((await supabase.from("goals").delete().eq("id", id)).error); await refresh(); };
  const addValuation: Ctx["addValuation"] = async (v) => {
    if (!(v.value >= 0)) throw new Error("Value can't be negative");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.valuedOn)) throw new Error("Pick the valuation date");
    if (v.valuedOn > today()) throw new Error("Valuation date can't be in the future");
    check((await supabase.from("asset_valuations").insert({ owner_id: userId, account_id: v.accountId, value: v.value, valued_on: v.valuedOn, source: v.source.slice(0, 80) || "manual", note: (v.note ?? "").slice(0, 300) })).error);
    await refresh();
  };
  const removeValuation: Ctx["removeValuation"] = async (id) => { check((await supabase.from("asset_valuations").delete().eq("id", id)).error); await refresh(); };
  const addDocument: Ctx["addDocument"] = async (file, meta) => {
    validateDocument({ title: meta.title, size: file.size, docType: meta.docType, amount: meta.amount });
    const path = `${userId}/docs/${crypto.randomUUID()}-${safeName(file.name)}`;
    const up = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (up.error) throw new Error(`Couldn't upload ${file.name}`);
    const docId = crypto.randomUUID();
    const { error } = await supabase.from("documents").insert({
      id: docId, owner_id: userId, title: meta.title.trim(), doc_type: meta.docType, file_path: path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size,
      doc_date: meta.docDate || null, amount: meta.amount, currency: meta.currency, merchant: meta.merchant?.trim() || null, notes: meta.notes.slice(0, 2000), extracted_text: (meta.text ?? "").slice(0, 20000),
      transaction_id: meta.transactionId, account_id: meta.accountId, loan_id: meta.loanId, expires_on: meta.expiresOn || null,
    });
    if (error) { await supabase.storage.from("receipts").remove([path]); throw new Error(error.message); }
    await refresh();
    return docId;
  };
  const updateDocument: Ctx["updateDocument"] = async (id, m) => {
    const row: Database["public"]["Tables"]["documents"]["Update"] = {};
    if (m.title !== undefined) { if (!m.title.trim()) throw new Error("Give the document a title"); row["title"] = m.title.trim(); }
    if (m.docType !== undefined) row["doc_type"] = m.docType;
    if (m.docDate !== undefined) row["doc_date"] = m.docDate || null;
    if (m.amount !== undefined) row["amount"] = m.amount;
    if (m.currency !== undefined) row["currency"] = m.currency;
    if (m.merchant !== undefined) row["merchant"] = m.merchant?.trim() || null;
    if (m.notes !== undefined) row["notes"] = m.notes.slice(0, 2000);
    if (m.transactionId !== undefined) row["transaction_id"] = m.transactionId;
    if (m.accountId !== undefined) row["account_id"] = m.accountId;
    if (m.loanId !== undefined) row["loan_id"] = m.loanId;
    if (m.expiresOn !== undefined) row["expires_on"] = m.expiresOn || null;
    check((await supabase.from("documents").update(row).eq("id", id)).error);
    await refresh();
  };
  const removeDocument: Ctx["removeDocument"] = async (d) => {
    check((await supabase.from("documents").delete().eq("id", d.id)).error);
    await supabase.storage.from("receipts").remove([d.filePath]);
    await refresh();
  };
  const history: Ctx["history"] = useCallback(async (id) => {
    const { data, error } = await supabase.from("transaction_audit").select("*").eq("transaction_id", id).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((x) => ({ id: x.id, action: x.action as AuditEntry["action"], changes: (x.changes as Record<string, unknown>) ?? {}, summary: x.summary, createdAt: x.created_at }));
  }, []);
  const deleteAll: Ctx["deleteAll"] = async () => {
    if (deleting.current) return;
    if (syncing.current) throw new Error("Offline entries are still syncing. Wait for them to finish, then retry deletion.");
    deleting.current = true;
    try {
      await deleteFinanceData(userId);
      setPendingCount(0);
    } finally {
      try { await refresh(); } finally { deleting.current = false; }
    }
  };
  const signedUrl = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  }, []);

  return (
    <StoreCtx.Provider value={{
      departmentBudgets, departmentBudgetError,
      pendingCount, setTags, preferences, savePreferences, ensureCategory, moveCategory, bulkSetCategory, categoryHistory, undoCategoryBatch, userId, name, updateName, members, memberName,
      expenses: expenses.filter((x) => (x.txnType ?? "expense") === "expense"), transactions: expenses, accounts, addAccount, setArchived, adjustBalance,
      commitments, loans, goals, valuations, documents, saveCommitment, confirmIrregular, removeCommitment, confirmCommitment, saveLoan, removeLoan, recordLoanPayment, convertToEmi,
      saveGoal, removeGoal, updateAccount, addValuation, removeValuation, addDocument, updateDocument, removeDocument, history, setReimbursement, recordReimbursement, deleteAll,
      budgets, loading, refresh, save, remove, setScope, reconcile, addMember, removeMember, setBudget, signedUrl,
      setAllocations, updateReimbursement, addReimbursementReceipt, listReviews, saveReview,
    }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
