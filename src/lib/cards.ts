// Credit card billing cycles, statement vs unbilled, payments and EMI conversions (pure, tested).
import { accountBalance, type Account, type Txn } from "./ledger";

export interface LoanPayment { date: string; principal: number; interest: number; total: number }
/** A purchase converted to EMI on a card (stored as a loan linked to the card account). */
export interface CardEmi {
  id: string;
  name: string;
  accountId: string | null;
  sourceTransactionId: string | null;
  original: number;
  startDate: string;
  emi: number;
  rate: number;
  payments: LoanPayment[];
}
export interface CardTxn extends Txn { category?: string; tags?: string[]; refundOfId?: string | null }

export type CardStatus = "no_statement" | "no_dues" | "paid" | "partly_paid" | "pending" | "overdue";
export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  no_statement: "Set a statement day", no_dues: "Nothing due", paid: "Paid", partly_paid: "Partly paid", pending: "Payment pending", overdue: "Overdue",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Date in month (y, m 1-12) on `day`, clamped to the month's last day. */
const onDay = (y: number, m: number, day: number) => `${y}-${pad(m)}-${pad(Math.min(day, lastDay(y, m)))}`;
const shift = (y: number, m: number, by: number) => { const t = y * 12 + (m - 1) + by; return [Math.floor(t / 12), (t % 12) + 1] as const; };
const ym = (d: string) => [Number(d.slice(0, 4)), Number(d.slice(5, 7))] as const;

/** Most recent statement date on or before today. */
export function lastStatementDate(today: string, statementDay: number): string {
  const [y, m] = ym(today);
  const here = onDay(y, m, statementDay);
  if (here <= today) return here;
  const [py, pm] = shift(y, m, -1);
  return onDay(py, pm, statementDay);
}
/** The statement date `months` away from a statement date. */
export function statementShift(statement: string, statementDay: number, months: number): string {
  const [y, m] = ym(statement);
  const [ny, nm] = shift(y, m, months);
  return onDay(ny, nm, statementDay);
}
/** Payment due date for a statement: the first `dueDay` after the statement date. */
export function dueDateFor(statement: string, dueDay: number): string {
  const [y, m] = ym(statement);
  const here = onDay(y, m, dueDay);
  if (here > statement) return here;
  const [ny, nm] = shift(y, m, 1);
  return onDay(ny, nm, dueDay);
}

const isCharge = (t: CardTxn) => /financial charges|interest|fees?/i.test(t.category ?? "") || (t.tags ?? []).some((x) => /interest|late fee|finance charge|annual fee/i.test(x));
const type = (t: Txn) => t.txnType ?? "expense";

/** Card EMI principal not yet billed on `date` (purchases converted before or on that date). */
export function emiUnbilled(emis: CardEmi[], date: string): number {
  let s = 0;
  for (const e of emis) {
    if (e.startDate > date) continue;
    const paid = e.payments.filter((p) => p.date <= date).reduce((a, p) => a + p.principal, 0);
    s += Math.max(0, e.original - paid);
  }
  return r2(s);
}

export interface CardCycle {
  owed: number;
  limit: number | null;
  available: number | null;
  utilisation: number | null;
  highUtilisation: boolean;
  status: CardStatus;
  lastStatement: string | null;
  nextStatement: string | null;
  dueDate: string | null;
  nextDueDate: string | null;
  statementBalance: number;
  paymentsSinceStatement: number;
  remainingDue: number;
  unbilled: number;
  refundsSinceStatement: number;
  interestSinceStatement: number;
  emiPrincipalBilledSinceStatement: number;
  emiOutstanding: number;
  /** Statement breakdown for the last closed cycle. */
  cycle: { from: string; to: string; purchases: number; refunds: number; charges: number; payments: number; emiPrincipal: number } | null;
}

/**
 * Billing view of one card. Statement balance = what was owed on the statement date minus EMI principal
 * not yet billed. Remaining due = statement balance minus payments made since. Unbilled = new purchases since.
 */
export function cardCycle(card: Account, txns: CardTxn[], allEmis: CardEmi[], today: string, alertPct = 30): CardCycle {
  const emis = allEmis.filter((e) => e.accountId === card.id);
  const converted = new Set(emis.map((e) => e.sourceTransactionId).filter(Boolean) as string[]);
  const owed = accountBalance(card, txns.filter((t) => t.date <= today));
  const limit = card.creditLimit ?? null;
  const utilisation = limit ? Math.round((owed / limit) * 100) : null;
  const emiOutstanding = emiUnbilled(emis, today);
  const base = {
    owed, limit, available: limit != null ? r2(limit - owed) : null, utilisation,
    highUtilisation: utilisation != null && utilisation >= alertPct, emiOutstanding,
  };
  const sd = card.statementDay;
  if (!sd) {
    return { ...base, status: "no_statement", lastStatement: null, nextStatement: null, dueDate: null, nextDueDate: null, statementBalance: 0, paymentsSinceStatement: 0,
      remainingDue: Math.max(0, r2(owed - emiOutstanding)), unbilled: 0, refundsSinceStatement: 0, interestSinceStatement: 0, emiPrincipalBilledSinceStatement: 0, cycle: null };
  }
  const last = lastStatementDate(today, sd);
  const prev = statementShift(last, sd, -1);
  const next = statementShift(last, sd, 1);
  const dueDay = card.dueDay ?? null;
  const due = dueDay ? dueDateFor(last, dueDay) : null;
  const nextDue = dueDay ? dueDateFor(next, dueDay) : null;
  const statementBalance = Math.max(0, r2(balanceTo(card, txns, last) - emiUnbilled(emis, last)));

  const window = (from: string, to: string) => txns.filter((t) => t.date > from && t.date <= to);
  const sum = (xs: CardTxn[]) => r2(xs.reduce((a, t) => a + t.amount, 0));
  const parts = (from: string, to: string) => {
    const w = window(from, to);
    const spend = w.filter((t) => t.accountId === card.id && type(t) === "expense" && !converted.has(t.id));
    return {
      purchases: sum(spend.filter((t) => !isCharge(t))),
      charges: sum(spend.filter(isCharge)),
      refunds: sum(w.filter((t) => t.accountId === card.id && (type(t) === "refund" || type(t) === "reimbursement"))),
      payments: sum(w.filter((t) => (type(t) === "transfer" || type(t) === "card_payment") && t.toAccountId === card.id)),
      emiPrincipal: r2(emis.flatMap((e) => e.payments).filter((p) => p.date > from && p.date <= to).reduce((a, p) => a + p.principal, 0)),
    };
  };
  const now = parts(last, today);
  const closed = parts(prev, last);
  // Linked refunds follow the original purchase's cycle; unlinked credits settle oldest dues first.
  const refunds = window(last, today).filter(t=>t.accountId===card.id && ["refund","reimbursement"].includes(type(t)));
  const currentRefunds = sum(refunds.filter(t=>t.refundOfId && txns.some(x=>x.id===t.refundOfId && x.date>last)));
  const statementCredits = r2(now.refunds-currentRefunds);
  const paid = r2(now.payments+statementCredits);
  const remainingDue = Math.max(0, r2(statementBalance - paid));
  const excessCredit = Math.max(0,r2(paid-statementBalance));
  const status: CardStatus = statementBalance <= 0.009 ? "no_dues"
    : remainingDue <= 0.009 ? "paid"
    : due && today > due ? "overdue"
    : paid > 0 ? "partly_paid" : "pending";
  return {
    ...base, status, lastStatement: last, nextStatement: next, dueDate: due, nextDueDate: nextDue,
    statementBalance, paymentsSinceStatement: now.payments, remainingDue,
    unbilled: Math.max(0, r2(now.purchases + now.emiPrincipal - currentRefunds - excessCredit)),
    refundsSinceStatement: now.refunds, interestSinceStatement: now.charges, emiPrincipalBilledSinceStatement: now.emiPrincipal,
    cycle: { from: prev, to: last, ...closed },
  };
}

function balanceTo(card: Account, txns: Txn[], date: string) {
  return accountBalance(card, txns.filter((t) => t.date <= date));
}

/** Card payments that a forecast should expect: the remaining statement due, then the next statement. */
export function cardDues(card: Account, c: CardCycle, today: string): { date: string; amount: number; name: string }[] {
  const out: { date: string; amount: number; name: string }[] = [];
  if (c.status === "no_statement") {
    if (card.dueDay && c.remainingDue > 0) {
      const [y, m] = ym(today);
      let d = onDay(y, m, card.dueDay);
      if (d < today) { const [ny, nm] = shift(y, m, 1); d = onDay(ny, nm, card.dueDay); }
      out.push({ date: d, amount: c.remainingDue, name: `${card.name} bill` });
    }
    return out;
  }
  if (c.remainingDue > 0 && c.dueDate) out.push({ date: c.dueDate < today ? today : c.dueDate, amount: c.remainingDue, name: `${card.name} bill` });
  if (c.unbilled + c.interestSinceStatement > 0 && c.nextDueDate) out.push({ date: c.nextDueDate, amount: r2(c.unbilled + c.interestSinceStatement), name: `${card.name} next bill (so far)` });
  return out;
}

/** Instalment due on a card EMI: interest on what's left, rest goes to principal. */
export function nextEmiInstalment(e: CardEmi, asOf: string) {
  const left = emiUnbilled([e], asOf);
  if (left <= 0) return null;
  const interest = r2(left * (e.rate / 1200));
  const principal = r2(Math.min(left, Math.max(0, e.emi - interest)));
  return { principal, interest, total: r2(principal + interest), left };
}
