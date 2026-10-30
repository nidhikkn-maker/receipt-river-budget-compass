import { whoLabel, CATEGORIES, PAYMENT_LABEL, SCOPE_LABEL, budgetUsage, totalsBy, type Budgets, type Expense } from "./expenses";

export type ReportKind = "expenses" | "business" | "categories";
export interface Report { title: string; headers: string[]; rows: (string | number)[][] }

const fmt = (n: number) => n.toFixed(2);

export function buildReport(kind: ReportKind, expenses: Expense[], memberName: (id: string | null) => string, budgets: Budgets): Report {
  const row = (e: Expense) => [e.date, e.title, e.merchant ?? "", e.category, SCOPE_LABEL[e.scope], whoLabel(e, memberName), PAYMENT_LABEL[e.paymentMethod],
    e.currency, fmt(e.originalAmount), fmt(e.fxRate), fmt(e.amount), e.reconciledAt ? "Yes" : "No"];
  const headers = ["Date", "Title", "Merchant", "Category", "Type", "For", "Paid with", "Currency", "Bill amount", "Rate", "Amount (INR)", "Bank matched"];
  if (kind === "expenses") return { title: "All expenses", headers, rows: expenses.map(row) };
  if (kind === "business") return { title: "Business expenses", headers, rows: expenses.filter((e) => e.scope === "business").map(row) };
  const biz = totalsBy(expenses.filter((e) => e.scope === "business"), (e) => e.category);
  const per = totalsBy(expenses.filter((e) => e.scope === "personal"), (e) => e.category);
  const month = new Date().toISOString().slice(0, 7);
  const usage = Object.fromEntries(budgetUsage(expenses, budgets, month).map((u) => [u.category, u]));
  return {
    title: "Spending by category",
    headers: ["Category", "Business (INR)", "Personal (INR)", "Total (INR)", "Monthly budget", "This month"],
    rows: CATEGORIES.filter((c) => biz[c] || per[c] || budgets[c]).map((c) => [c, fmt(biz[c] ?? 0), fmt(per[c] ?? 0), fmt((biz[c] ?? 0) + (per[c] ?? 0)),
      budgets[c] ? fmt(budgets[c]!) : "", fmt(usage[c]?.spent ?? 0)]),
  };
}

export function toCsv(r: Report): string {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [r.headers, ...r.rows].map((row) => row.map(esc).join(",")).join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function toPdf(r: Report, subtitle: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: r.headers.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(18); doc.text(`Ledgerline — ${r.title}`, 14, 18);
  doc.setFontSize(10); doc.text(subtitle, 14, 25);
  autoTable(doc, { startY: 30, head: [r.headers], body: r.rows.map((x) => x.map(String)), styles: { fontSize: 7.5 }, headStyles: { fillColor: [38, 72, 200] } });
  return doc.output("blob");
}
