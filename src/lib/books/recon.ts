import { roundMoney, addMoney, subtractMoney, sumMoney } from "../money";
/**
 * Reconciliations that compare figures, not just count issues [§24]. Pure and read-only:
 * differences are reported for review and nothing is posted or adjusted.
 */
import type { GstInvoice } from "./types";
import { effectiveInvoices } from './gst';

const r2 = roundMoney;
const words = (s: string) => s.toLowerCase().replace(/\b(private|pvt|limited|ltd|llp|the|and|co|company)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/** A narration is evidence only for one distinct party; ambiguous payments remain unallocated. */
function partyPayments<T extends {party:string;gstin:string}>(parties:T[],payments:{id:string;amount:number;text:string;date:string}[],from:string,to:string){
 const result=new Map<T,typeof payments>();
 for(const p of payments.filter(p=>p.date>=from&&p.date<=to)){
  const text=` ${words(p.text)} `;
  const exact=parties.filter(s=>s.gstin&&p.text.toUpperCase().includes(s.gstin.toUpperCase()));
  const candidates=exact.length?exact:parties.filter(s=>{const name=words(s.party);return name.length>=3&&text.includes(` ${name} `);});
  if(candidates.length!==1)continue;
  const party=candidates[0];if(!party)continue;
  const current=result.get(party)??[];if(!current.some(x=>x.id===p.id))result.set(party,[...current,p]);
 }
 return result;
}

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

export interface SupplierReconRow { party: string; gstin: string; invoiced: number; paid: number; difference: number; invoices: number; payments: number; allocation?: ReturnType<typeof allocatePayments> | undefined }
/** Supplier: purchase invoices (incl. tax) per supplier vs payments naming that supplier, per GSTIN. */
export function supplierRecon(invoices: GstInvoice[], payments: { id: string; amount: number; text: string; date: string }[], from: string, to: string, order: AllocationOrder = "oldest"): SupplierReconRow[] {
  const by = new Map<string, { party: string; gstin: string; invoiced: number; invoices: number }>();
  for (const i of effectiveInvoices(invoices)) {
    if (i.kind !== "purchase" || i.date < from || i.date > to) continue;
    const k = i.partyGstin || words(i.party);
    const cur = by.get(k) ?? { party: i.party, gstin: i.partyGstin, invoiced: 0, invoices: 0 };
    cur.invoiced = addMoney(cur.invoiced, i.taxable, i.igst, i.cgst, i.sgst, i.cess); cur.invoices++;
    by.set(k, cur);
  }
  const parties=[...by.values()],paymentsByParty=partyPayments(parties,payments,from,to);
  return parties.map((s) => {
    const name = words(s.party);
    const mine = paymentsByParty.get(s)??[];
    const paid = sumMoney(mine.map(p => p.amount));
    return { party: s.party, gstin: s.gstin, invoiced: s.invoiced, paid, difference: subtractMoney(s.invoiced, paid), invoices: s.invoices, payments: mine.length, allocation: allocatePayments(invoices.filter((i) => i.kind === "purchase" && i.date >= from && i.date <= to && (i.partyGstin || words(i.party)) === (s.gstin || name)), mine, to, order) };
  }).filter((r) => Math.abs(r.difference) > 1);
}

export interface CustomerReconRow { party: string; gstin: string; invoiced: number; received: number; outstanding: number; invoices: number; receipts: number; allocation?: ReturnType<typeof allocatePayments> | undefined }
/** Customer: sales invoices (incl. tax) per customer vs receipts naming that customer; each receipt is used once. */
export function customerRecon(invoices: GstInvoice[], receipts: { id: string; amount: number; text: string; date: string }[], from: string, to: string, order: AllocationOrder = "oldest"): CustomerReconRow[] {
  const by = new Map<string, { party: string; gstin: string; invoiced: number; invoices: number }>();
  for (const i of effectiveInvoices(invoices)) {
    if (i.kind !== "sales" || i.date < from || i.date > to) continue;
    const k = i.partyGstin || words(i.party);
    const cur = by.get(k) ?? { party: i.party, gstin: i.partyGstin, invoiced: 0, invoices: 0 };
    cur.invoiced = addMoney(cur.invoiced, i.taxable, i.igst, i.cgst, i.sgst, i.cess); cur.invoices++;
    by.set(k, cur);
  }
  const parties=[...by.values()],receiptsByParty=partyPayments(parties,receipts,from,to);
  return parties.map((s) => {
    const name = words(s.party);
    const mine = receiptsByParty.get(s)??[];
    const received = sumMoney(mine.map(p => p.amount));
    return { party: s.party, gstin: s.gstin, invoiced: s.invoiced, received, outstanding: subtractMoney(s.invoiced, received), invoices: s.invoices, receipts: mine.length, allocation: allocatePayments(invoices.filter((i) => i.kind === "sales" && i.date >= from && i.date <= to && (i.partyGstin || words(i.party)) === (s.gstin || name)), mine, to, order) };
  }).filter((r) => Math.abs(r.outstanding) > 1);
}


/** Invoice-level allocation [§49–50]: a payment naming an invoice number settles that invoice first, the rest
 * goes oldest-first; credit notes reduce their original invoice (or the oldest). Read-only, nothing is saved. */
export interface InvoiceAllocation { number: string; date: string; amount: number; allocated: number; outstanding: number; status: "paid" | "part" | "open"; payments: string[] }
/** Owner-chosen order for the invoices a payment settles after any invoice it names: oldest first (default), largest first or smallest first. */
export type AllocationOrder = "oldest" | "largest" | "smallest";
export function allocatePayments(invoices: GstInvoice[], payments: { id: string; amount: number; text: string; date: string }[], today: string, order: AllocationOrder = "oldest"): { lines: (InvoiceAllocation & { ageDays: number })[]; unallocated: number } {
  const bills = invoices.filter((i) => !i.note && !invoices.some((x) => x.amendsId === i.id)).sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => ({ number: i.number.trim(), date: i.date, amount: addMoney(i.taxable, i.igst, i.cgst, i.sgst, i.cess), allocated: 0, payments: [] as string[] }));
  for (const n of invoices.filter((i) => i.note === "credit")) {
    const t = bills.find((b) => b.number.toUpperCase() === (n.originalNumber ?? "").trim().toUpperCase()) ?? bills.find((b) => b.allocated < b.amount);
    if (t) { t.amount = subtractMoney(t.amount, Math.abs(addMoney(n.taxable, n.igst, n.cgst, n.sgst, n.cess))); }
  }
  for (const n of invoices.filter((i) => i.note === "debit")) bills.push({ number: n.number.trim(), date: n.date, amount: Math.abs(addMoney(n.taxable, n.igst, n.cgst, n.sgst, n.cess)), allocated: 0, payments: [] });
  let unallocated = 0;
  for (const p of [...payments].sort((a, b) => a.date.localeCompare(b.date))) {
    let left = p.amount;
    const text = p.text.toUpperCase();
    const named = bills.filter((b) => b.number.length >= 2 && new RegExp(`(^|[^A-Z0-9])${b.number.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`).test(text));
    const rest = bills.filter((x) => !named.includes(x));
    if (order === "largest") rest.sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date));
    else if (order === "smallest") rest.sort((a, b) => a.amount - b.amount || a.date.localeCompare(b.date));
    for (const b of [...named, ...rest]) {
      if (left <= 0.005) break;
      const take = r2(Math.min(left, subtractMoney(b.amount, b.allocated)));
      if (take <= 0) continue;
      b.allocated = addMoney(b.allocated, take); left = subtractMoney(left, take); b.payments.push(p.id);
    }
    unallocated = addMoney(unallocated, left);
  }
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`);
  return { lines: bills.map((b) => { const outstanding = r2(Math.max(0, subtractMoney(b.amount, b.allocated))); return { ...b, outstanding, status: outstanding <= 1 ? "paid" as const : b.allocated > 0 ? "part" as const : "open" as const, ageDays: outstanding > 1 ? Math.max(0, Math.round((day(today) - day(b.date)) / 86400000)) : 0 }; }), unallocated };
}

export interface InvestmentReconRow { isin: string; name: string; statement: number; fromTransactions: number; difference: number }
/** Investment: holding quantity on the demat statement vs buys − sells from transaction statements (only when history exists). */
export interface QtyAction { date: string; isin: string; kind: string; quantity: number | null }
/**
 * Applies corporate actions to a running quantity [§43]: bonus/rights/split rows carry the shares credited,
 * merger/redemption rows the shares removed (sign as printed is ignored). Rows without a quantity are reported
 * as unresolved so the quantity is never guessed.
 */
export function applyCorporateActions(qty: number, actions: QtyAction[]): { quantity: number; unresolved: QtyAction[] } {
  let q = qty; const unresolved: QtyAction[] = [];
  for (const a of [...actions].sort((x, y) => x.date.localeCompare(y.date))) {
    if (a.kind === "dividend" || a.kind === "brokerage") continue;
    if (a.quantity == null) { unresolved.push(a); continue; }
    q += ["merger", "redemption"].includes(a.kind) ? -Math.abs(a.quantity) : Math.abs(a.quantity);
  }
  return { quantity: r2(q), unresolved };
}
export function investmentRecon(holdings: { isin: string; name: string; quantity: number; openingQty?: number; lots: { side: "buy" | "sell"; quantity: number }[] }[], actions: QtyAction[] = []): InvestmentReconRow[] {
  return holdings.filter((h) => h.lots.length > 0).map((h) => {
    const traded = (h.openingQty ?? 0) + h.lots.reduce((s, l) => s + (l.side === "buy" ? l.quantity : -l.quantity), 0);
    const q = applyCorporateActions(traded, actions.filter((a) => a.isin === h.isin)).quantity;
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
    if (from === a) row.aToB = addMoney(row.aToB, t.amount); else row.bToA = addMoney(row.bToA, t.amount);
    if (!t.reconciledAt) row.unconfirmed++;
    row.net = subtractMoney(row.aToB, row.bToA);
    m.set(`${a}|${b}`, row);
  }
  return [...m.values()];
}

export interface BrokerCashOverlapRow { holdingId: string; holdingName: string; accountId: string; accountName: string; amount: number; shared: string }
const OVERLAP_STOP = new Set(["cash", "account", "broker", "brokerage", "demat", "balance", "fund", "funds", "money"]);
const sigWords = (s: string) => words(s).split(" ").filter((w) => w.length >= 4 && !OVERLAP_STOP.has(w));
/**
 * Broker cash vs accounts [§24]: a broker_cash holding and a cash-like account whose names share a
 * significant word (e.g. the broker's name) probably hold the same money, so net worth would count it
 * twice. Read-only: reported for review, never auto-excluded.
 */
export function brokerCashOverlap(
  holdings: { id: string; kind: string; name: string; quantity: number }[],
  accounts: { id: string; name: string; kind: string; archived?: boolean | undefined }[],
): BrokerCashOverlapRow[] {
  const cashKinds = new Set(["savings", "current", "cash", "wallet", "investment", "other_asset"]);
  const out: BrokerCashOverlapRow[] = [];
  for (const h of holdings.filter((x) => x.kind === "broker_cash")) {
    const hw = sigWords(h.name);
    if (!hw.length) continue;
    for (const a of accounts) {
      if (a.archived || !cashKinds.has(a.kind)) continue;
      const shared = sigWords(a.name).find((w) => hw.includes(w));
      if (shared) out.push({ holdingId: h.id, holdingName: h.name, accountId: a.id, accountName: a.name, amount: r2(h.quantity), shared });
    }
  }
  return out;
}
