/** GSTR-2B supplier-filed invoices vs your business bills. Pure, read-only. */
import type { Expense } from "./expenses";

export interface G2bInvoice { gstin: string; supplier: string; number: string; date: string; value: number; tax: number }

const toIso = (d: string) => { const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : d; };
const n = (v: unknown) => Number(v) || 0;

/** Read the GST portal's GSTR-2B JSON (data.docdata.b2b or docdata.b2b). */
export function parseGstr2b(json: unknown): G2bInvoice[] {
  const root = json as { data?: { docdata?: { b2b?: unknown[] } }; docdata?: { b2b?: unknown[] } };
  const b2b = (root?.data?.docdata?.b2b ?? root?.docdata?.b2b ?? []) as { ctin?: string; trdnm?: string; inv?: { inum?: string; dt?: string; val?: number; igst?: number; cgst?: number; sgst?: number; cess?: number; items?: { igst?: number; cgst?: number; sgst?: number; cess?: number }[] }[] }[];
  const out: G2bInvoice[] = [];
  for (const s of b2b) for (const i of s.inv ?? []) {
    const parts = i.items?.length ? i.items : [i];
    const tax = parts.reduce((t, p) => t + n(p.igst) + n(p.cgst) + n(p.sgst) + n(p.cess), 0);
    out.push({ gstin: String(s.ctin ?? "").toUpperCase(), supplier: String(s.trdnm ?? s.ctin ?? ""), number: String(i.inum ?? ""), date: toIso(String(i.dt ?? "")), value: n(i.val), tax: Math.round(tax * 100) / 100 });
  }
  return out;
}

export interface G2bMatch { invoice: G2bInvoice; entryId: string | null; state: "matched" | "amount-differs" | "not-in-books" }

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["pvt", "ltd", "private", "limited", "the", "and"].includes(w));

/** One-to-one: same supplier name word, date within 7 days, value within ₹1 (matched) or 5% (differs). */
export function matchGstr2b(invoices: G2bInvoice[], entries: Expense[]): { rows: G2bMatch[]; booksOnly: Expense[] } {
  const pool = entries.filter((e) => (!e.txnType || e.txnType === "expense") && e.scope === "business");
  const used = new Set<string>();
  const rows = invoices.map((inv): G2bMatch => {
    const w = words(inv.supplier);
    const cands = pool.filter((e) => !used.has(e.id) && Math.abs(Date.parse(e.date) - Date.parse(inv.date)) <= 7 * 864e5 && words(`${e.merchant ?? ""} ${e.title}`).some((x) => w.includes(x)));
    const exact = cands.find((e) => Math.abs(e.amount - inv.value) <= 1);
    const near = exact ?? cands.find((e) => Math.abs(e.amount - inv.value) <= inv.value * 0.05);
    if (near) used.add(near.id);
    return { invoice: inv, entryId: near?.id ?? null, state: exact ? "matched" : near ? "amount-differs" : "not-in-books" };
  });
  const months = new Set(invoices.map((i) => i.date.slice(0, 7)));
  const booksOnly = pool.filter((e) => !used.has(e.id) && months.has(e.date.slice(0, 7)) && (e.receiptDetails?.tax ?? 0) > 0);
  return { rows, booksOnly };
}
