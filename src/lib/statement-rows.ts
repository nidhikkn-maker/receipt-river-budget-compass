import type { StatementLine } from "./expenses";
export function normalizeStatementRows(rows: { date: string; description: string; amount: number; direction: string }[]): StatementLine[] {
  return rows.flatMap((row, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0,10) !== row.date) return [];
    if (!Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 100000000 || !["debit", "credit"].includes(row.direction)) return [];
    return [{ ref: `OCR${i + 1}`, date: row.date, description: row.description.slice(0,300), amount: Math.round(row.amount*100)/100, direction: row.direction as "credit" | "debit" }];
  });
}