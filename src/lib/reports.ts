import { DEPARTMENTS, STATUS_LABEL, departmentSpend, type Budgets, type Department, type Expense, type User } from "./expenses";

export type ReportKind = "expenses" | "reimbursements" | "departments";

export interface Report {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

const fmt = (n: number) => n.toFixed(2);

export function buildReport(kind: ReportKind, expenses: Expense[], people: Record<string, User>, budgets: Budgets, depts: Department[] = DEPARTMENTS): Report {
  const name = (id: string) => people[id]?.name ?? "";
  if (kind === "expenses")
    return {
      title: "Expenses",
      headers: ["Date", "Employee", "Department", "Title", "Merchant", "Category", "Status", "Amount (USD)"],
      rows: expenses.map((e) => [e.date, name(e.employeeId), e.department, e.title, e.merchant ?? "", e.category, STATUS_LABEL[e.status], fmt(e.amount)]),
    };
  if (kind === "reimbursements")
    return {
      title: "Reimbursements",
      headers: ["Paid on", "Employee", "Department", "Title", "Amount (USD)", "Paid by"],
      rows: expenses
        .filter((e) => e.status === "reimbursed" || e.status === "approved")
        .map((e) => {
          const paid = e.history.find((h) => h.action === "reimbursed");
          return [paid ? paid.at.slice(0, 10) : "Awaiting payment", name(e.employeeId), e.department, e.title, fmt(e.amount), paid ? name(paid.by) : ""];
        }),
    };
  return {
    title: "Department spending",
    headers: ["Department", "Budget", "Approved / paid", "Pending", "Remaining", "% used"],
    rows: depts.map((d) => {
      const s = departmentSpend(expenses, d, budgets);
      return [d, fmt(s.budget), fmt(s.committed), fmt(s.pending), fmt(s.budget - s.committed), s.budget ? `${Math.round((s.committed / s.budget) * 100)}%` : "—"];
    }),
  };
}

export function toCsv(r: Report): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [r.headers, ...r.rows].map((row) => row.map(esc).join(",")).join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function toPdf(r: Report, subtitle: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: r.headers.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(18);
  doc.text(`Ledgerline — ${r.title}`, 14, 18);
  doc.setFontSize(10);
  doc.text(subtitle, 14, 25);
  autoTable(doc, {
    startY: 30,
    head: [r.headers],
    body: r.rows.map((row) => row.map(String)),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [38, 84, 64] },
  });
  return doc.output("blob");
}
