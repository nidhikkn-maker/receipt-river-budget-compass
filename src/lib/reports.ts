import { receiptRoundOffFor } from "./receipt-reading";
import { whoLabel, PAYMENT_LABEL, SCOPE_LABEL, budgetUsage, totalsBy, categoryTotals, type Budgets, type Expense } from "./expenses";
import { workspaceParts } from "./workspaces";

export type ReportKind = "expenses" | "business" | "categories" | "reimbursements" | "reimbursement-payments" | "departments";
export interface Report { title: string; headers: string[]; rows: (string | number)[][] }

const fmt = (n: number) => n.toFixed(2);

export function buildReport(kind: ReportKind, transactions: Expense[], memberName: (id: string | null) => string, budgets: Budgets, options: { departmentBudgets?: Record<string, number>; budgetMonth?: string; claims?: Expense[]; accountName?: (id: string | null) => string; companyOf?: (e: Expense) => string } = {}): Report {
  const expenses = transactions.filter((e) => (e.txnType ?? "expense") === "expense");
  if (kind === "reimbursement-payments") {
    const claims = options.claims ?? transactions;
    return { title: "Reimbursement payments", headers: ["Date received", "Payment", "Payer", "Claim / expense", "Department", "Received into", "Currency", "Original amount", "Amount (INR)", "Payment ID"], rows: transactions.filter((e) => e.txnType === "reimbursement").map((e) => {
      const linked = claims.filter((c) => c.reimbursement?.receipts?.some((r) => r.txnId === e.id || r.id === e.id) || (e.description ?? '').includes(c.id));
      return [e.date, e.title, e.merchant ?? linked.map((c) => c.reimbursement?.payer ?? "").filter(Boolean).join("; "), linked.map((c) => c.title).join("; "), e.department ?? linked.map((c) => c.department).filter(Boolean).join("; "), options.accountName?.(e.accountId ?? null) ?? e.accountId ?? "Unassigned", e.currency, fmt(e.originalAmount), fmt(e.amount), e.id];
    }) };
  }
  if (kind === "departments") {
    const limits = options.departmentBudgets ?? {};
    const month = options.budgetMonth ?? new Date().toISOString().slice(0, 7);
    const names = [...new Set([...expenses.map((e) => e.department?.trim() || "Unassigned"), ...Object.keys(limits)])].sort();
    return { title: "Department budgets - your spending", headers: ["Department", "Your expenses in range", "Your spending in range (INR)", "Budget month", "Monthly department limit (INR)", "Your filtered monthly spending (INR)", "Remaining balance (INR)", "Budget used (%)", "Status"], rows: names.map((name) => {
      const entries = expenses.filter((e) => (e.department?.trim() || "Unassigned") === name);
      const sum = (list: Expense[]) => list.reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100;
      const spent = sum(entries.filter((e) => e.date.startsWith(month)));
      const limit = limits[name];
      return [name, entries.length, fmt(sum(entries)), month, limit === undefined ? "" : fmt(limit), fmt(spent), limit === undefined ? "" : fmt(limit - spent), limit && limit > 0 ? fmt(spent / limit * 100) : "", limit === undefined ? "No limit" : spent > limit ? "Over budget" : "Within budget"];
    }) };
  }
  const opt = (v: number | null | undefined) => (v == null ? "" : fmt(v));
  const row = (e: Expense) => [e.date, e.title, e.merchant ?? "", e.category, SCOPE_LABEL[e.scope], whoLabel(e, memberName), PAYMENT_LABEL[e.paymentMethod],
     e.currency, fmt(e.originalAmount), fmt(e.fxRate), fmt(e.amount), e.reconciledAt ? "Yes" : "No", e.reimbursementStatus ?? "none",
     opt(e.receiptDetails?.subtotal), opt(e.receiptDetails?.tax), opt(e.receiptDetails?.tip), (() => { const r = receiptRoundOffFor(e).amount; return r ? fmt(r) : ""; })(), (e.receiptDetails?.charges ?? []).map((c) => `${c.label} ${fmt(c.amount)}`).join("; "), (e.receiptDetails?.taxParts ?? []).map((t) => `${t.label}${t.rate != null ? ` ${t.rate}%` : ""} ${fmt(t.amount)}`).join("; ")];
  const headers = ["Date", "Title", "Merchant", "Category", "Type", "For", "Paid with", "Currency", "Bill amount", "Rate", "Amount (INR)", "Bank matched", "Reimbursement", "Subtotal", "Tax", "Tip", "Round-off", "Charges", "Tax parts", ...(options.companyOf ? ["Company"] : [])];
  const baseRow = row; const rowC = (e: Expense) => options.companyOf ? [...baseRow(e), options.companyOf(e)] : baseRow(e);
  if (kind === "expenses") return { title: "All expenses", headers, rows: expenses.map(rowC) };
  const inWorkspace = (scope: Expense["scope"]) => expenses.flatMap((e) => {
    const share = workspaceParts(e).find((p) => p.workspace === scope);
    if (!share || share.amount <= 0) return [];
    const ratio = e.amount > 0 ? share.amount / e.amount : 0;
    return [{ ...e, scope, amount: share.amount, originalAmount: e.originalAmount * ratio,
      allocations: (e.allocations ?? []).map((a) => ({ ...a, amount: a.amount * ratio })) }];
  });
  if (kind === "business") return { title: "Business expenses", headers, rows: inWorkspace("business").map(rowC) };
  if (kind === "reimbursements") return { title: "Reimbursements", headers, rows: expenses.filter(e=>e.reimbursementStatus && e.reimbursementStatus!=="none").map(rowC) };
  const biz = categoryTotals(inWorkspace("business"));
  const per = categoryTotals(inWorkspace("personal"));
  const month = options.budgetMonth ?? new Date().toISOString().slice(0, 7);
  const usage = Object.fromEntries(budgetUsage(expenses, budgets, month).map((u) => [u.category, u]));
  return {
    title: "Spending by category",
    headers: ["Category", "Business (INR)", "Personal (INR)", "Total (INR)", "Monthly budget", "This month"],
    rows: [...new Set([...Object.keys(biz), ...Object.keys(per), ...Object.keys(budgets)])].map((c) => [c, fmt(biz[c] ?? 0), fmt(per[c] ?? 0), fmt((biz[c] ?? 0) + (per[c] ?? 0)),
      budgets[c] ? fmt(budgets[c] ?? 0) : "", fmt(usage[c]?.spent ?? 0)]),
  };
}

export function toCsv(r: Report): string {
  const esc = (v: string | number) => { const raw = String(v); const s = typeof v === "string" && /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [r.headers, ...r.rows].map((row) => row.map(esc).join(",")).join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function deliverFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if ((e as DOMException).name === "AbortError") return; }
  }
  downloadBlob(blob, filename);
}

export async function toPdf(r: Report, subtitle: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: r.headers.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(18); doc.text(`Ledgerline - ${r.title}`, 14, 18);
  doc.setFontSize(10); doc.text(subtitle, 14, 25);
  autoTable(doc, { startY: 30, head: [r.headers], body: r.rows.map((x) => x.map(String)), styles: { fontSize: 7.5 }, headStyles: { fillColor: [38, 72, 200] } });
  return doc.output("blob");
}
