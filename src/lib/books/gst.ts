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
export function matchGstPayments(liabilities: { period: string; amount: number }[], payments: { id: string; date: string; amount: number; text: string; accountId?: string | null | undefined }[], opts?: { gstin?: string | undefined; accountIds?: Set<string> | undefined }) {
  const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
  const pool = payments.filter((p) => {
    if (!/\bgst\b|cbic|gst\s*challan|cpin/i.test(p.text)) return false;
    // Must belong to this entity's accounts and must not name a different GSTIN.
    if (opts?.accountIds?.size && !(p.accountId && opts.accountIds.has(p.accountId))) return false;
    const named: string[] = p.text.toUpperCase().match(GSTIN_RE) ?? [];
    return !(opts?.gstin && named.length && !named.includes(opts.gstin.toUpperCase()));
  });
  const used = new Set<string>();
  const windowEnd = (period: string) => { const [y, m] = period.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m + 2, 0)); return d.toISOString().slice(0, 10); };
  return liabilities.map((l) => {
    const p = pool.find((x) => !used.has(x.id) && Math.abs(x.amount - l.amount) <= 1 && x.date >= `${l.period}-01` && x.date <= windowEnd(l.period));
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

/** GSTR-9 working in its table layout (4 outward, 6 ITC, 9 tax payable) with checks against the monthly 3B drafts. */
export function gstr9(list: GstInvoice[], gstin: string, fyStart: number, eligibleKeys?: Set<string>) {
  const months = Array.from({ length: 12 }, (_, i) => { const m = ((i + 3) % 12) + 1; const y = m >= 4 ? fyStart : fyStart + 1; return `${y}-${String(m).padStart(2, "0")}`; });
  const a = annualSummary(list, gstin, fyStart);
  const monthly = months.map((m) => gstr3b(list, gstin, m, eligibleKeys));
  const sum = (k: "outputTax" | "itcClaimed" | "netPayable") => r2(monthly.reduce((s, x) => s + x[k], 0));
  const t4 = { taxable: a.sales, tax: a.outputTax }, t6 = { itc: sum("itcClaimed") }, t9 = { payable: a.outputTax, paidThrough3B: sum("outputTax") };
  const checks = [
    Math.abs(t9.payable - t9.paidThrough3B) > 1 && `Table 9 tax ${t9.payable} differs from monthly 3B total ${t9.paidThrough3B}`,
    a.inputTax - t6.itc > 1 && `Input tax ${a.inputTax} on invoices but only ${t6.itc} claimed in 3B (held or ineligible)`,
  ].filter((x): x is string => !!x);
  return { table4: t4, table6: t6, table9: t9, checks };
}

const fp = (period: string) => `${period.slice(5, 7)}${period.slice(0, 4)}`;
const ddmmyyyy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
const rate = (i: GstInvoice) => (i.taxable > 0 ? Math.round(((i.igst + i.cgst + i.sgst) / i.taxable) * 1000) / 10 : 0);

/**
 * GSTR-1 in the GSTN offline-tool JSON layout (gstin, fp, b2b[ctin, inv[inum, idt, val, pos, rchrg, inv_typ, itms]], b2cs).
 * A working file for the accountant to check in the offline tool; nothing is uploaded or filed.
 */
export function gstr1Json(list: GstInvoice[], gstin: string, period: string) {
  const sales = list.filter((i) => i.gstin === gstin && i.kind === "sales" && periodOf(i.date) === period);
  const byCtin = new Map<string, GstInvoice[]>();
  for (const i of sales.filter((x) => x.partyGstin)) byCtin.set(i.partyGstin, [...(byCtin.get(i.partyGstin) ?? []), i]);
  const b2cs = new Map<string, { sply_ty: string; pos: string; typ: string; rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }>();
  for (const i of sales.filter((x) => !x.partyGstin)) {
    const inter = !!i.igst; const k = `${inter}|${rate(i)}`;
    const cur = b2cs.get(k) ?? { sply_ty: inter ? "INTER" : "INTRA", pos: gstin.slice(0, 2), typ: "OE", rt: rate(i), txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
    cur.txval = r2(cur.txval + i.taxable); cur.iamt = r2(cur.iamt + i.igst); cur.camt = r2(cur.camt + i.cgst); cur.samt = r2(cur.samt + i.sgst); cur.csamt = r2(cur.csamt + i.cess);
    b2cs.set(k, cur);
  }
  return {
    gstin, fp: fp(period), version: "GST3.2", hash: "hash",
    b2b: [...byCtin.entries()].map(([ctin, inv]) => ({ ctin, inv: inv.map((i) => ({ inum: i.number.trim(), idt: ddmmyyyy(i.date), val: r2(i.taxable + taxOf(i)), pos: i.igst ? i.partyGstin.slice(0, 2) : gstin.slice(0, 2), rchrg: "N", inv_typ: "R", itms: [{ num: 1, itm_det: { rt: rate(i), txval: i.taxable, iamt: i.igst, camt: i.cgst, samt: i.sgst, csamt: i.cess } }] })) })),
    b2cs: [...b2cs.values()],
  };
}

/** GSTR-3B in the GSTN JSON layout (sup_details.osup_det, itc_elg.itc_avl/itc_net). Working file only. */
export function gstr3bJson(list: GstInvoice[], gstin: string, period: string, eligible?: Set<string>) {
  const mine = list.filter((i) => i.gstin === gstin && periodOf(i.date) === period);
  const out = mine.filter((i) => i.kind === "sales");
  const inn = mine.filter((i) => i.kind === "purchase" && (!eligible || eligible.has(`${i.partyGstin}|${i.number.trim().toUpperCase()}`)));
  const s = (xs: GstInvoice[], k: "taxable" | "igst" | "cgst" | "sgst" | "cess") => r2(xs.reduce((t, i) => t + i[k], 0));
  const itc = { ty: "OTH", iamt: s(inn, "igst"), camt: s(inn, "cgst"), samt: s(inn, "sgst"), csamt: s(inn, "cess") };
  return {
    gstin, ret_period: fp(period),
    sup_details: { osup_det: { txval: s(out, "taxable"), iamt: s(out, "igst"), camt: s(out, "cgst"), samt: s(out, "sgst"), csamt: s(out, "cess") } },
    itc_elg: { itc_avl: [itc], itc_rev: [], itc_net: { iamt: itc.iamt, camt: itc.camt, samt: itc.samt, csamt: itc.csamt }, itc_inelg: [] },
  };
}

/** Structural checks against the published layout before the file is offered (required keys, formats, sums). */
export function validateGstJson(kind: "GSTR-1" | "GSTR-3B", j: Record<string, unknown>): string[] {
  const errs: string[] = [];
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(j["gstin"]))) errs.push("gstin is not a valid GSTIN");
  const period = String(j[kind === "GSTR-1" ? "fp" : "ret_period"] ?? "");
  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) errs.push("return period must be MMYYYY");
  if (kind === "GSTR-1") {
    for (const b of (j["b2b"] as { ctin: string; inv: { inum: string; idt: string; val: number; itms: { itm_det: { txval: number; iamt: number; camt: number; samt: number; csamt: number } }[] }[] }[]) ?? []) {
      if (!/^\d{2}[A-Z0-9]{13}$/.test(b.ctin)) errs.push(`recipient ${b.ctin} is not a valid GSTIN`);
      for (const i of b.inv) {
        if (!/^[A-Za-z0-9/-]{1,16}$/.test(i.inum)) errs.push(`invoice ${i.inum}: number must be up to 16 letters, digits, / or -`);
        if (!/^\d{2}-\d{2}-\d{4}$/.test(i.idt)) errs.push(`invoice ${i.inum}: date must be DD-MM-YYYY`);
        const d = i.itms.reduce((t, x) => t + x.itm_det.txval + x.itm_det.iamt + x.itm_det.camt + x.itm_det.samt + x.itm_det.csamt, 0);
        if (Math.abs(d - i.val) > 1) errs.push(`invoice ${i.inum}: value ${i.val} differs from item total ${r2(d)}`);
      }
    }
  } else if (!(j["sup_details"] && j["itc_elg"])) errs.push("sup_details and itc_elg are required");
  return errs;
}
