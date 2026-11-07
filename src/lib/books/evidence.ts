/** Source-to-figure traceability for every register figure [v6.0 §20, §61]. Each figure resolves to the
 * document it came from — a direct document reference on the record, else a DocuRepo link to it, else a
 * linked ledger entry — or is reported as "no source". Read-only: nothing is ever filled in or changed. */
import type { Asset } from "../assets";
import type { BooksData } from "./types";

export interface EvidenceRef { kind: "document" | "entry"; id: string; title: string }
export interface FigureEvidence { register: string; recordId: string; label: string; amount: number; source: EvidenceRef | null; to: string }
interface Doc { id: string; title: string; docType?: string }

export type Resolver = (recordId: string, docId?: string, txId?: string) => EvidenceRef | null;
/** Shared source resolver: direct document reference, else a DocuRepo link, else a linked ledger entry. */
export function makeResolver(p: { books: BooksData; docs: Doc[]; entryTitle?: (id: string) => string | undefined }): Resolver {
  const docTitle = new Map(p.docs.map((d) => [d.id, d.title]));
  const linkOf = (targetId: string) => p.books.docLinks.find((l) => l.targetId === targetId && docTitle.has(l.docId))?.docId;
  return (recordId, docId, txId) => {
    const d = docId && docTitle.has(docId) ? docId : linkOf(recordId);
    if (d) return { kind: "document", id: d, title: docTitle.get(d) ?? "Source document" };
    if (txId && (!p.entryTitle || p.entryTitle(txId))) return { kind: "entry", id: txId, title: p.entryTitle?.(txId) ?? "Linked entry" };
    return null;
  };
}

export function registerEvidence(p: { assets: Asset[]; books: BooksData; docs: Doc[]; entryTitle?: (id: string) => string | undefined }): FigureEvidence[] {
  const resolve = makeResolver(p);
  const out: FigureEvidence[] = [];
  // A service/warranty document proves attachment, never the asset's acquisition cost.
  const acquisitionResolve = makeResolver({ ...p, docs: p.docs.filter(d => !d.docType || d.docType === "asset_invoice" || d.docType === "property_deed" || d.docType === "audited_financials" || d.docType === "depreciation_schedule") });
  for (const a of p.assets) {
    const costSource = a.docId && !p.docs.some(d => d.id === a.docId)
      ? (a.transactionId ? acquisitionResolve("", undefined, a.transactionId) : null)
      : acquisitionResolve(a.id, a.docId, a.transactionId);
    out.push({ register: "Asset register", recordId: a.id, label: `${a.name} · cost`, amount: a.cost, source: costSource, to: "/assets" });
    if (a.soldOn && a.saleValue != null) out.push({ register: "Asset register", recordId: a.id, label: `${a.name} · sale proceeds`, amount: a.saleValue, source: resolve(a.id, a.docId), to: "/assets" });
  }
  for (const l of p.books.leases) {
    out.push({ register: "Leases", recordId: l.id, label: `${l.tenant} · monthly rent`, amount: l.rent, source: resolve(l.id, l.docId), to: "/assets" });
    if (l.deposit != null) out.push({ register: "Leases", recordId: l.id, label: `${l.tenant} · deposit`, amount: l.deposit, source: resolve(l.id, l.docId), to: "/assets" });
  }
  for (const c of p.books.propertyCosts) out.push({ register: "Property costs", recordId: c.id, label: `${c.vendor || c.kind} · ${c.date}`, amount: c.amount, source: resolve(c.id, c.docId, c.transactionId), to: "/assets" });
  for (const g of p.books.gstInvoices) out.push({ register: "GST invoices", recordId: g.id, label: `${g.party} #${g.number}`, amount: g.taxable + g.igst + g.cgst + g.sgst + g.cess, source: resolve(g.id, g.docId, g.transactionId), to: "/tax" });
  for (const f of p.books.fyRecords) for (const [head, v] of Object.entries(f.audited)) if (typeof v === "number")
    out.push({ register: "Prior-year accounts", recordId: f.id, label: `FY ${f.fy} · ${head}`, amount: v, source: resolve(f.id, f.docIds.find((d) => resolve(f.id, d) !== null)), to: "/entities" });
  for (const b of p.books.loanBalances ?? []) out.push({ register: "Loan balances", recordId: b.id, label: `Outstanding ${b.asOf}`, amount: b.amount, source: resolve(b.id, b.docId), to: "/wealth" });
  for(const c of p.books.taxCredits??[])out.push({register:'Tax credits',recordId:c.id,label:`${c.entityId} · ${c.fy} · ${c.kind}`,amount:c.amount,source:resolve(c.id,c.docId,c.transactionId),to:'/tax'});
  for(const d of p.books.taxDeductions??[])out.push({register:'Tax deductions',recordId:d.id,label:`${d.entityId} · ${d.fy} · ${d.section} · ${d.evidence}`,amount:d.amount,source:resolve(d.id),to:'/tax'});
  for(const s of p.books.salaryEvidence??[])out.push({register:'Salary evidence',recordId:`${s.entityId}:${s.fy}`,label:`${s.entityId} · ${s.fy} · salary`,amount:s.amount,source:resolve(`${s.entityId}:${s.fy}`,s.docId),to:'/tax'});
  for(const y of p.books.entityTaxProfiles??[])for(const field of ['ownershipPct','capital','accumulatedProfits','bookProfit'] as const){const amount=y[field];if(amount!=null)out.push({register:'Company tax facts',recordId:y.id,label:`${y.entityId} · ${y.fy} · ${field}`,amount,source:resolve(y.id),to:'/entities'});}
  for(const h of p.books.holdings){
    out.push({register:'Investment holdings',recordId:h.id,label:`${h.name} · quantity`,amount:h.quantity,source:resolve(h.id),to:'/wealth'});
    if(h.costBasis!=null)out.push({register:'Investment holdings',recordId:h.id,label:`${h.name} · acquisition cost`,amount:h.costBasis,source:resolve(h.id),to:'/wealth'});
  }
  for(const q of p.books.quotes)out.push({register:'Market prices',recordId:q.key,label:`${q.key} · ${q.at} · ${q.provider}`,amount:q.price,source:resolve(q.key),to:'/wealth'});
  for(const o of p.books.priceOverrides??[])if(o.active)out.push({register:'Manual market prices',recordId:o.key,label:`${o.name} · ${o.priceDate} · ${o.source}`,amount:o.price,source:resolve(o.key),to:'/wealth'});
  for(const j of p.books.journals)out.push({register:'Depreciation journals',recordId:j.id,label:`${j.assetId} · ${j.period}`,amount:j.amount,source:resolve(j.assetId,p.assets.find(a=>a.id===j.assetId)?.docId,j.transactionId),to:'/assets'});
  for(const a of p.books.gstAdvances??[])out.push({register:'GST advances',recordId:a.id,label:`${a.party} · ${a.number} · ${a.date}`,amount:a.taxable+a.igst+a.cgst+a.sgst+a.cess,source:resolve(a.id,a.docId),to:'/tax'});
  return out;
}

export const unsourced = (rows: FigureEvidence[]) => rows.filter((r) => !r.source);

const cell = (v: string | number) => { const s = String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
export function evidenceCsv(rows: FigureEvidence[]): string {
  return [["Register", "Figure", "Amount", "Source type", "Source"], ...rows.map((r) => [r.register, r.label, r.amount, r.source?.kind ?? "none", r.source?.title ?? "No source"])].map((r) => r.map(cell).join(",")).join("\n");
}
