import { csvCell } from "@/lib/csv-safe";
import { roundMoney, sumMoney } from '@/lib/money';

/** Rows another owner shared through a company grant. Only rows the database already allowed are passed in. */
export type SharedTxn = { id: string; employee_id: string; entity_id: string | null; title: string; merchant: string | null; category: string; amount: number; currency: string; expense_date: string; txn_type: string };
export type SharedDoc = { id: string; owner_id: string; entity_id: string | null; title: string; doc_type: string; doc_date: string | null; file_path: string; file_name?: string | null; mime_type?: string | null; size_bytes?: number | null };
export type SharedCompany = { grant_id: string; owner_id: string; entity_id: string; company_name: string; owner_email: string; can_write: boolean };

/** Keeps only rows belonging to this exact owner+company — a second guard on top of the database rules, never a replacement. */
export function rowsFor<T extends { entity_id: string | null }>(rows: T[], c: SharedCompany, ownerOf: (r: T) => string): T[] {
  return rows.filter((r) => r.entity_id === c.entity_id && ownerOf(r) === c.owner_id);
}

/** Case-insensitive search over shared rows; matches any of the given text fields. Empty query returns every row. */
export function filterShared<T>(rows: T[], query: string, text: (r: T) => (string | null | undefined)[]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => text(r).some((v) => (v ?? "").toLowerCase().includes(q)));
}

/** Pure data for the shared-company PDF so the content is testable without a renderer. */
export function sharedCompanyPdfData(c: SharedCompany, txns: SharedTxn[], docs: SharedDoc[]) {
  const t = rowsFor(txns, c, (r) => r.employee_id).sort((a, b) => a.expense_date.localeCompare(b.expense_date));
  const d = rowsFor(docs, c, (r) => r.owner_id);
  const inr = (n: number) => `INR ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(roundMoney(n))}`;
  const total = sumMoney(t.filter((r) => r.txn_type === "expense").map(r=>r.amount));
  return {
    title: `${c.company_name} — shared records`,
    lines: [`Shared by: ${c.owner_email}`, `Access: ${c.can_write ? "Can edit" : "View only"}`],
    entries: { headers: ["Date", "Type", "Description", "Shop/party", "Category", "Amount"], rows: t.map((r) => [r.expense_date, r.txn_type, r.title, r.merchant ?? "", r.category, inr(r.amount)]) },
    documents: { headers: ["Date", "Type", "Title"], rows: d.map((r) => [r.doc_date ?? "", r.doc_type, r.title]) },
    totalSpend: inr(total),
    counts: { entries: t.length, documents: d.length },
  };
}

/** Builds the shared-company PDF in the browser; jsPDF loads only when asked. */
export async function sharedCompanyPdf(c: SharedCompany, txns: SharedTxn[], docs: SharedDoc[]): Promise<Blob> {
  const data = sharedCompanyPdfData(c, txns, docs);
  const { loadPdfFonts, withUnicode, textU, cell } = await import("@/lib/pdf-unicode");
  await loadPdfFonts();
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), M = 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); textU(doc, data.title, M, 20);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 70, 70);
  let y = 27;
  for (const line of [...data.lines, `Entries: ${data.counts.entries} · Documents: ${data.counts.documents} · Spending total: ${data.totalSpend}`]) { textU(doc, line, M, y); y += 4.5; }
  autoTable(doc, withUnicode(doc, { startY: y + 2, margin: { left: M, right: M }, head: [data.entries.headers], body: data.entries.rows.map((r) => r.map(cell)), theme: "grid", styles: { fontSize: 8 }, headStyles: { fontStyle: "bold" }, columnStyles: { 5: { halign: "right" } } }));
  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  autoTable(doc, withUnicode(doc, { startY: y2, margin: { left: M, right: M }, head: [data.documents.headers], body: data.documents.rows.map((r) => r.map(cell)), theme: "grid", styles: { fontSize: 8 }, headStyles: { fontStyle: "bold" } }));
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text("Shared company export — only records tagged to this company are included.", M, doc.internal.pageSize.getHeight() - 8);
  void W;
  return doc.output("blob");
}

/** Amounts are stored INR; money in is shown positive, spending negative only by type, never recomputed. */
export function sharedCompanyCsv(c: SharedCompany, txns: SharedTxn[], docs: SharedDoc[]): string {
  const t = rowsFor(txns, c, (r) => r.employee_id), d = rowsFor(docs, c, (r) => r.owner_id);
  const lines = [
    [`Company`, c.company_name], [`Shared by`, c.owner_email], [],
    ["Date", "Type", "Description", "Shop/party", "Category", "Amount (INR)"],
    ...t.sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map((r) => [r.expense_date, r.txn_type, r.title, r.merchant ?? "", r.category, r.amount]),
    [], ["Documents"], ["Date", "Type", "Title"],
    ...d.map((r) => [r.doc_date ?? "", r.doc_type, r.title]),
  ];
  return lines.map((l) => l.map((v) => csvCell(v as string | number)).join(",")).join("\n");
}
/** Separate literal-cell sheets preserve visible entry/document IDs without leaking other owners. */
export async function sharedCompanyExcel(c:SharedCompany,txns:SharedTxn[],docs:SharedDoc[]):Promise<Blob>{
 const {utils,write}=await import('xlsx');const w=utils.book_new();
 utils.book_append_sheet(w,utils.aoa_to_sheet([['Company',c.company_name],['Shared by',c.owner_email],['Access',c.can_write?'Can edit':'View only']]),'Company');
 utils.book_append_sheet(w,utils.aoa_to_sheet([['Entry ID','Date','Type','Description','Party','Category','Amount (INR)'],...rowsFor(txns,c,r=>r.employee_id).map(r=>[r.id,r.expense_date,r.txn_type,r.title,r.merchant??'',r.category,r.amount])]),'Entries');
 utils.book_append_sheet(w,utils.aoa_to_sheet([['Document ID','Date','Type','Title','Original filename'],...rowsFor(docs,c,r=>r.owner_id).map(r=>[r.id,r.doc_date??'',r.doc_type,r.title,r.file_name??''])]),'Documents');
 return new Blob([write(w,{type:'array',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
