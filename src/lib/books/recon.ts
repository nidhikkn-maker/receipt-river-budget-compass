/**
 * Reconciliations that compare figures, not just count issues [§24]. Pure and read-only:
 * differences are reported for review and nothing is posted or adjusted.
 */
import type { GstInvoice } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const words = (s: string) => s.toLowerCase().replace(/\b(private|pvt|limited|ltd|llp|the|and|co|company)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export interface LoanReconRow { loanId: string; name: string; statementDate: string; lender: number; ledger: number; difference: number }
/**
 * Loan: the outstanding printed on the latest uploaded lender statement vs the loan account balance in the
 * ledger on that date. `ledgerAt` is supplied by the caller from the shared ledger engine.
 */
export function loanRecon(loans: { id: string; name: string; accountId: string | null }[], statements: { loanId: string | null; date: string | null; outstanding: number | null }[], ledgerAt: (accountId: string, date: string) => number): LoanReconRow[] {
  const out: LoanReconRow[] = [];
  for (const l of loans) {
    if (!l.accountId) continue;
    const latest = statements.filter((s) => s.loanId === l.id && s.date && s.outstanding != null).sort((a, b) => (a.date! < b.date! ? 1 : -1))[0];
    if (!latest) continue;
    const ledger = r2(Math.abs(ledgerAt(l.accountId, latest.date!)));
    out.push({ loanId: l.id, name: l.name, statementDate: latest.date!, lender: r2(latest.outstanding!), ledger, difference: r2(ledger - latest.outstanding!) });
  }
  return out;
}

export interface SupplierReconRow { party: string; gstin: string; invoiced: number; paid: number; difference: number; invoices: number; payments: number }
/** Supplier: purchase invoices (incl. tax) per supplier vs payments naming that supplier, per GSTIN. */
export function supplierRecon(invoices: GstInvoice[], payments: { id: string; amount: number; text: string; date: string }[], from: string, to: string): SupplierReconRow[] {
  const by = new Map<string, { party: string; gstin: string; invoiced: number; invoices: number }>();
  for (const i of invoices) {
    if (i.kind !== "purchase" || i.date < from || i.date > to) continue;
    const k = i.partyGstin || words(i.party);
    const cur = by.get(k) ?? { party: i.party, gstin: i.partyGstin, invoiced: 0, invoices: 0 };
    cur.invoiced = r2(cur.invoiced + i.taxable + i.igst + i.cgst + i.sgst + i.cess); cur.invoices++;
    by.set(k, cur);
  }
  const used = new Set<string>();
  return [...by.values()].map((s) => {
    const name = words(s.party);
    const mine = name.length >= 3 ? payments.filter((p) => !used.has(p.id) && p.date >= from && p.date <= to && words(p.text).includes(name)) : [];
    for (const p of mine) used.add(p.id);
    const paid = r2(mine.reduce((t, p) => t + p.amount, 0));
    return { party: s.party, gstin: s.gstin, invoiced: s.invoiced, paid, difference: r2(s.invoiced - paid), invoices: s.invoices, payments: mine.length };
  }).filter((r) => Math.abs(r.difference) > 1);
}

export interface InvestmentReconRow { isin: string; name: string; statement: number; fromTransactions: number; difference: number }
/** Investment: holding quantity on the demat statement vs buys − sells from transaction statements (only when history exists). */
export function investmentRecon(holdings: { isin: string; name: string; quantity: number; lots: { side: "buy" | "sell"; quantity: number }[] }[]): InvestmentReconRow[] {
  return holdings.filter((h) => h.lots.length > 0).map((h) => {
    const q = r2(h.lots.reduce((s, l) => s + (l.side === "buy" ? l.quantity : -l.quantity), 0));
    return { isin: h.isin, name: h.name, statement: h.quantity, fromTransactions: q, difference: r2(h.quantity - q) };
  }).filter((r) => Math.abs(r.difference) > 0.0001);
}

export interface IntercompanyRow { a: string; b: string; aToB: number; bToA: number; net: number; unconfirmed: number }
/**
 * Intercompany: transfers between accounts linked to two different companies/people, by pair. Net shows who
 * owes whom; unconfirmed counts movements not yet reconciled on both statements.
 */
export function intercompanyRecon(entries: { id: string; amount: number; txnType?: string | null | undefined; accountId?: string | null | undefined; toAccountId?: string | null | undefined; reconciledAt?: string | null | undefined; transferCounterpartOf?: string | null | undefined }[], entityAccounts: Record<string, string[]>): IntercompanyRow[] {
  const owner = new Map<string, string>(); for (const [e, ids] of Object.entries(entityAccounts)) for (const id of ids) owner.set(id, e);
  const m = new Map<string, IntercompanyRow>();
  for (const t of entries) {
    if (t.txnType !== "transfer" || t.transferCounterpartOf || !t.accountId || !t.toAccountId) continue;
    const from = owner.get(t.accountId), to = owner.get(t.toAccountId);
    if (!from || !to || from === to) continue;
    const [a, b] = from < to ? [from, to] : [to, from];
    const row = m.get(`${a}|${b}`) ?? { a, b, aToB: 0, bToA: 0, net: 0, unconfirmed: 0 };
    if (from === a) row.aToB = r2(row.aToB + t.amount); else row.bToA = r2(row.bToA + t.amount);
    if (!t.reconciledAt) row.unconfirmed++;
    row.net = r2(row.aToB - row.bToA);
    m.set(`${a}|${b}`, row);
  }
  return [...m.values()];
}
