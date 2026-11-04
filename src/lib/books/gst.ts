/** GSTIN-wise invoice register, GSTR-1 / GSTR-3B drafts, ITC review, payment matching [§47]. Drafts only. */
import type { GstFiling, GstInvoice } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const taxOf = (i: GstInvoice) => r2(i.igst + i.cgst + i.sgst + i.cess);
export const periodOf = (date: string) => date.slice(0, 7);

/** Problems on one invoice line (GSTIN shape, intra/inter-state tax split). */
export function invoiceProblems(i: GstInvoice): string[] {
  const out: string[] = [];
  if (i.partyGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(i.partyGstin)) out.push("party GSTIN looks wrong");
  const inter = i.partyGstin && i.partyGstin.slice(0, 2) !== i.gstin.slice(0, 2);
  if (i.partyGstin && inter && (i.cgst || i.sgst)) out.push("inter-state invoice should carry IGST, not CGST/SGST");
  if (i.partyGstin && !inter && i.igst) out.push("intra-state invoice should carry CGST+SGST, not IGST");
  if (Math.abs(i.cgst - i.sgst) > 0.5) out.push("CGST and SGST should be equal");
  return out;
}

/** Duplicate invoice numbers per GSTIN/party/kind. */
export function duplicateInvoices(list: GstInvoice[]): string[] {
  const seen = new Map<string, number>();
  for (const i of list) { const k = `${i.gstin}|${i.kind}|${i.partyGstin || i.party}|${i.number.trim().toUpperCase()}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k.split("|")[3]!);
}

/** GSTR-1 draft: B2B by recipient GSTIN and B2C totals for one GSTIN/month. */
export function gstr1(list: GstInvoice[], gstin: string, period: string) {
  const sales = list.filter((i) => i.gstin === gstin && i.kind === "sales" && periodOf(i.date) === period);
  const b2b = sales.filter((i) => i.partyGstin);
  const b2c = sales.filter((i) => !i.partyGstin);
  const sum = (xs: GstInvoice[]) => ({ count: xs.length, taxable: r2(xs.reduce((s, i) => s + i.taxable, 0)), igst: r2(xs.reduce((s, i) => s + i.igst, 0)), cgst: r2(xs.reduce((s, i) => s + i.cgst, 0)), sgst: r2(xs.reduce((s, i) => s + i.sgst, 0)), cess: r2(xs.reduce((s, i) => s + i.cess, 0)) });
  return { gstin, period, b2b: sum(b2b), b2c: sum(b2c), invoices: b2b.map((i) => ({ recipient: i.partyGstin, number: i.number, date: i.date, taxable: i.taxable, tax: taxOf(i) })) };
}

/** GSTR-3B draft: outward tax, eligible ITC (only purchases matched in GSTR-2B when given), net payable. */
export function gstr3b(list: GstInvoice[], gstin: string, period: string, in2b?: Set<string>) {
  const mine = list.filter((i) => i.gstin === gstin && periodOf(i.date) === period);
  const out = mine.filter((i) => i.kind === "sales"), inn = mine.filter((i) => i.kind === "purchase");
  const eligible = in2b ? inn.filter((i) => in2b.has(`${i.partyGstin}|${i.number.trim().toUpperCase()}`)) : inn;
  const t = (xs: GstInvoice[]) => r2(xs.reduce((s, i) => s + taxOf(i), 0));
  const output = t(out), itc = t(eligible);
  return { gstin, period, outwardTaxable: r2(out.reduce((s, i) => s + i.taxable, 0)), outputTax: output, itcClaimed: itc, itcHeld: r2(t(inn) - itc), netPayable: r2(Math.max(0, output - itc)), carryForward: r2(Math.max(0, itc - output)) };
}

/** Match GST payments in the ledger (narration with GST/CBIC/challan) to 3B liabilities by amount within ±₹1. */
export function matchGstPayments(liabilities: { period: string; amount: number }[], payments: { id: string; date: string; amount: number; text: string }[]) {
  const pool = payments.filter((p) => /\bgst\b|cbic|gst\s*challan|cpin/i.test(p.text));
  const used = new Set<string>();
  return liabilities.map((l) => {
    const p = pool.find((x) => !used.has(x.id) && Math.abs(x.amount - l.amount) <= 1 && x.date >= `${l.period}-01`);
    if (p) used.add(p.id);
    return { ...l, paymentId: p?.id ?? null, paidOn: p?.date ?? null };
  });
}

/** Annual summary (GSTR-9 style) for a GSTIN and FY start year. */
export function annualSummary(list: GstInvoice[], gstin: string, fyStart: number) {
  const from = `${fyStart}-04-01`, to = `${fyStart + 1}-03-31`;
  const mine = list.filter((i) => i.gstin === gstin && i.date >= from && i.date <= to);
  const s = (k: GstInvoice["kind"]) => mine.filter((i) => i.kind === k);
  return { sales: r2(s("sales").reduce((a, i) => a + i.taxable, 0)), outputTax: r2(s("sales").reduce((a, i) => a + taxOf(i), 0)), purchases: r2(s("purchase").reduce((a, i) => a + i.taxable, 0)), inputTax: r2(s("purchase").reduce((a, i) => a + taxOf(i), 0)) };
}

/** Months in a FY with no filing evidence recorded for a form. */
export function unfiledPeriods(filings: GstFiling[], gstin: string, form: string, periods: string[]): string[] {
  return periods.filter((p) => !filings.some((f) => f.gstin === gstin && f.form === form && f.period === p));
}
