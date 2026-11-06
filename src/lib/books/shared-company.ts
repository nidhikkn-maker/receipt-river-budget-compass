import { csvCell } from "@/lib/csv-safe";

/** Rows another owner shared through a company grant. Only rows the database already allowed are passed in. */
export type SharedTxn = { id: string; employee_id: string; entity_id: string | null; title: string; merchant: string | null; category: string; amount: number; currency: string; expense_date: string; txn_type: string };
export type SharedDoc = { id: string; owner_id: string; entity_id: string | null; title: string; doc_type: string; doc_date: string | null; file_path: string };
export type SharedCompany = { grant_id: string; owner_id: string; entity_id: string; company_name: string; owner_email: string; can_write: boolean };

/** Keeps only rows belonging to this exact owner+company — a second guard on top of the database rules, never a replacement. */
export function rowsFor<T extends { entity_id: string | null }>(rows: T[], c: SharedCompany, ownerOf: (r: T) => string): T[] {
  return rows.filter((r) => r.entity_id === c.entity_id && ownerOf(r) === c.owner_id);
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
