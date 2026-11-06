/** Source-to-figure traceability for every register figure [v6.0 §20, §61]. Each figure resolves to the
 * document it came from — a direct document reference on the record, else a DocuRepo link to it, else a
 * linked ledger entry — or is reported as "no source". Read-only: nothing is ever filled in or changed. */
import type { Asset } from "../assets";
import type { BooksData } from "./types";

export interface EvidenceRef { kind: "document" | "entry"; id: string; title: string }
export interface FigureEvidence { register: string; recordId: string; label: string; amount: number; source: EvidenceRef | null; to: string }
interface Doc { id: string; title: string }

export function registerEvidence(p: { assets: Asset[]; books: BooksData; docs: Doc[]; entryTitle?: (id: string) => string | undefined }): FigureEvidence[] {
  const docTitle = new Map(p.docs.map((d) => [d.id, d.title]));
  const linkOf = (targetId: string) => p.books.docLinks.find((l) => l.targetId === targetId && docTitle.has(l.docId))?.docId;
  const resolve = (recordId: string, docId?: string, txId?: string): EvidenceRef | null => {
    const d = docId && docTitle.has(docId) ? docId : linkOf(recordId);
    if (d) return { kind: "document", id: d, title: docTitle.get(d)! };
    if (txId) return { kind: "entry", id: txId, title: p.entryTitle?.(txId) ?? "Linked entry" };
    return null;
  };
  const out: FigureEvidence[] = [];
  for (const a of p.assets) {
    out.push({ register: "Asset register", recordId: a.id, label: `${a.name} · cost`, amount: a.cost, source: resolve(a.id, a.docId, a.transactionId), to: "/assets" });
    if (a.soldOn && a.saleValue != null) out.push({ register: "Asset register", recordId: a.id, label: `${a.name} · sale proceeds`, amount: a.saleValue, source: resolve(a.id, a.docId), to: "/assets" });
  }
  for (const l of p.books.leases) {
    out.push({ register: "Leases", recordId: l.id, label: `${l.tenant} · monthly rent`, amount: l.rent, source: resolve(l.id, l.docId), to: "/assets" });
    if (l.deposit != null) out.push({ register: "Leases", recordId: l.id, label: `${l.tenant} · deposit`, amount: l.deposit, source: resolve(l.id, l.docId), to: "/assets" });
  }
  for (const c of p.books.propertyCosts) out.push({ register: "Property costs", recordId: c.id, label: `${c.vendor || c.kind} · ${c.date}`, amount: c.amount, source: resolve(c.id, c.docId, c.transactionId), to: "/assets" });
  for (const g of p.books.gstInvoices) out.push({ register: "GST invoices", recordId: g.id, label: `${g.party} #${g.number}`, amount: g.taxable + g.igst + g.cgst + g.sgst + g.cess, source: resolve(g.id, g.docId, g.transactionId), to: "/tax" });
  for (const f of p.books.fyRecords) for (const [head, v] of Object.entries(f.audited)) if (typeof v === "number")
    out.push({ register: "Prior-year accounts", recordId: f.id, label: `FY ${f.fy} · ${head}`, amount: v, source: resolve(f.id, f.docIds.find((d) => docTitle.has(d))), to: "/entities" });
  for (const b of p.books.loanBalances ?? []) out.push({ register: "Loan balances", recordId: b.id, label: `Outstanding ${b.asOf}`, amount: b.amount, source: resolve(b.id, b.docId), to: "/wealth" });
  return out;
}

export const unsourced = (rows: FigureEvidence[]) => rows.filter((r) => !r.source);

const cell = (v: string | number) => { const s = String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
export function evidenceCsv(rows: FigureEvidence[]): string {
  return [["Register", "Figure", "Amount", "Source type", "Source"], ...rows.map((r) => [r.register, r.label, r.amount, r.source?.kind ?? "none", r.source?.title ?? "No source"])].map((r) => r.map(cell).join(",")).join("\n");
}
