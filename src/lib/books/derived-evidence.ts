/**
 * Derived calculation dependency chains [v6.0 §20, §61]: a computed figure (GST payable for a month,
 * a posted depreciation journal) lists every input it was calculated from, and each input carries its
 * own source through the shared resolver. Read-only; nothing is computed differently here than in the
 * calculators themselves — the chains reuse gstPayable and the saved journals.
 */
import type { Asset } from "../assets";
import type { BooksData } from "./types";
import { effectiveInvoices, gstPayable, periodOf, taxOf } from "./gst";
import { makeResolver, type EvidenceRef } from "./evidence";
import { itcReview } from './compliance';

export interface DerivedInput { label: string; amount: number; source: EvidenceRef | null }
export interface DerivedFigure { id: string; label: string; amount: number; to: string; inputs: DerivedInput[]; allInputs?: DerivedInput[]; unsourced: number; omittedInputs?: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const MAX_INPUTS = 100;

export function derivedEvidence(p: { assets: Asset[]; books: BooksData; docs: { id: string; title: string }[]; entryTitle?: (id: string) => string | undefined }): DerivedFigure[] {
  const resolve = makeResolver(p);
  const out: DerivedFigure[] = [];
  const push = (f: DerivedFigure) => { f.allInputs = [...f.inputs]; f.unsourced = f.inputs.filter((i) => !i.source).length; f.omittedInputs = Math.max(0,f.inputs.length-MAX_INPUTS); f.inputs = f.inputs.slice(0, MAX_INPUTS); out.push(f); };

  // GST net payable per registration and month, chained to the invoices and advances behind it.
  const periods = new Set<string>();
  for (const i of p.books.gstInvoices) periods.add(`${i.gstin}|${periodOf(i.date)}`);
  for (const a of p.books.gstAdvances ?? []) { periods.add(`${a.gstin}|${periodOf(a.date)}`); for (const x of a.adjustments) periods.add(`${a.gstin}|${periodOf(x.date)}`); }
  for (const key of [...periods].sort()) {
    const [gstin, period] = key.split("|") as [string, string];
    const eligible=new Set(itcReview(p.books.gstInvoices,gstin,period).lines.filter(l=>l.eligible).map(l=>`${l.invoice.partyGstin}|${l.invoice.number.trim().toUpperCase()}`));
    const payable = gstPayable(p.books.gstInvoices, gstin, period, eligible, undefined, p.books.gstAdvances ?? []);
    const inputs: DerivedInput[] = [];
    for (const i of effectiveInvoices(p.books.gstInvoices).filter((x) => x.gstin === gstin && periodOf(x.date) === period)) {
      const tax = taxOf(i);
      const held=i.kind==='purchase'&&i.treatment!=='reverse_charge'&&!i.note&&!eligible.has(`${i.partyGstin}|${i.number.trim().toUpperCase()}`);
      const reverse=i.treatment==='reverse_charge';
      inputs.push({ label: `${i.kind === "sales" ? "Sale" : "Purchase"} ${i.number} · ${i.party}${i.note ? ` (${i.note} note)` : ""}${held?' (credit held)':reverse?' (reverse-charge cash)':''}`, amount: i.kind === "sales"||reverse ? tax : held?0:-tax, source: resolve(i.id, i.docId, i.transactionId) });
      if(reverse&&i.rcmPaymentId&&i.rcmPaidOn?.startsWith(period))inputs.push({label:`Paid reverse-charge credit ${i.number}`,amount:-tax,source:resolve(i.id,i.docId,i.rcmPaymentId)});
    }
    for(const i of effectiveInvoices(p.books.gstInvoices).filter(i=>i.gstin===gstin&&i.treatment==='reverse_charge'&&!i.date.startsWith(period)&&i.rcmPaymentId&&i.rcmPaidOn?.startsWith(period)))inputs.push({label:`Paid reverse-charge credit ${i.number}`,amount:-taxOf(i),source:resolve(i.id,i.docId,i.rcmPaymentId)});
    for (const a of (p.books.gstAdvances ?? []).filter((x) => x.gstin === gstin && x.supply === "services")) {
      if (periodOf(a.date) === period) inputs.push({ label: `Advance ${a.number} · ${a.party}`, amount: r2(a.igst + a.cgst + a.sgst + a.cess), source: resolve(a.id, a.docId) });
      for (const x of a.adjustments.filter((x) => periodOf(x.date) === period)) {
        const inv = p.books.gstInvoices.find((i) => i.id === x.invoiceId);
        inputs.push({ label: `Advance ${a.number} adjusted against ${inv?.number ?? x.invoiceId}`, amount: -r2(x.igst + x.cgst + x.sgst + x.cess), source: resolve(a.id, a.docId) });
      }
    }
    push({ id: `gst:${key}`, label: `GST payable · ${gstin} · ${period}`, amount: payable.cashTotal, to: "/tax", inputs, unsourced: 0 });
  }

  // Posted depreciation journals, chained to the asset's cost evidence.
  for (const j of p.books.journals.filter((x) => x.status === "posted")) {
    const asset = p.assets.find((a) => a.id === j.assetId);
    push({
      id: `dep:${j.id}`, label: `Depreciation · ${asset?.name ?? j.assetId} · ${j.period}`, amount: j.amount, to: "/assets", unsourced: 0,
      inputs: [
        { label: `${asset?.name ?? "Asset"} · cost`, amount: asset?.cost ?? 0, source: resolve(j.assetId, asset?.docId, asset?.transactionId) },
        ...(j.transactionId ? [{ label: "Posted ledger entry", amount: j.amount, source: resolve(j.id, undefined, j.transactionId) }] : []),
      ],
    });
  }
  return out;
}
