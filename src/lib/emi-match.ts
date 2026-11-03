// Matching bank debits to loan EMIs, and the EMI-by-EMI reconciliation (pure, tested).
// A match is only a suggestion: statement lines still ask before anything is saved.

export interface EmiTarget {
  loanId: string;
  name: string;
  /** The loan's own account, which a repayment moves money into. */
  loanAccountId: string | null;
  /** Bank account the EMI is normally paid from (from the saved recurring EMI). */
  payFromAccountId: string | null;
  emi: number;
  /** Day of month the EMI falls due. */
  dueDay: number;
  /** Loan / linked-account numbers or branch codes that name this loan in a narration. */
  refs: string[];
}

/** Small gaps (rounding, a linked account topping up the rest) are allowed: ₹100 or 0.5% of the EMI. */
export const emiTolerance = (emi: number) => Math.max(100, Math.round(emi * 0.005));
/** Debits up to 7 days before or 5 days after the due date count for that EMI. */
export const EMI_WINDOW = { before: 7, after: 5 } as const;

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Due date in the given month, clamped to the month's last day. */
export function dueIn(year: number, month0: number, day: number): string {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return iso(Date.UTC(year, month0, Math.min(day, last)));
}

/** Days from the nearest due date (negative = paid early), or null when outside the window. */
export function dayOffset(date: string, dueDay: number): { due: string; days: number } | null {
  const d = new Date(t(date));
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  let best: { due: string; days: number } | null = null;
  for (const k of [-1, 0, 1]) {
    const due = dueIn(y, m + k, dueDay);
    const days = Math.round((t(date) - t(due)) / DAY);
    if (days < -EMI_WINDOW.before || days > EMI_WINDOW.after) continue;
    if (!best || Math.abs(days) < Math.abs(best.days)) best = { due, days };
  }
  return best;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const namesLoan = (text: string, refs: string[]) => {
  const n = norm(text);
  return refs.some((r) => r.length >= 6 && n.includes(norm(r)));
};

export interface EmiMatch { target: EmiTarget; due: string; dayDiff: number; amountDiff: number; linked: boolean }

/**
 * Which loan EMI this bank debit pays, if exactly one fits.
 * Fits = paid from the EMI's usual account (or the narration names the loan/linked account),
 * near the due date, and the amount within tolerance (10% when the narration names the loan,
 * since a linked account may pay the rest).
 */
export function matchEmiDebit(
  line: { date: string; amount: number; direction: "debit" | "credit"; accountId: string | null; description: string },
  targets: EmiTarget[],
): EmiMatch | null {
  if (line.direction !== "debit" || !(line.amount > 0)) return null;
  const hits = targets.flatMap((target) => {
    const linked = namesLoan(line.description, target.refs);
    const fromUsual = !!line.accountId && line.accountId === target.payFromAccountId;
    if (!fromUsual && !linked) return [];
    const off = dayOffset(line.date, target.dueDay);
    if (!off) return [];
    const amountDiff = Math.round((line.amount - target.emi) * 100) / 100;
    const limit = linked ? Math.max(emiTolerance(target.emi), target.emi * 0.1) : emiTolerance(target.emi);
    if (Math.abs(amountDiff) > limit) return [];
    return [{ target, due: off.due, dayDiff: off.days, amountDiff, linked }];
  });
  return hits.length === 1 ? hits[0]! : null;
}

export type EmiRowStatus = "matched" | "amount" | "date" | "missing" | "lender_only" | "upcoming";
export interface EmiRow {
  due: string;
  emi: number;
  /** What the lender's statement says was collected for this EMI, when known. */
  lenderPaid: number | null;
  debit: { id: string; date: string; amount: number; title: string } | null;
  amountDiff: number | null;
  dayDiff: number | null;
  status: EmiRowStatus;
}

/**
 * Lines up every scheduled EMI from `from` to the next due date with the bank debit that paid it.
 * Each debit is used once, nearest date first. Small amount gaps within tolerance still show the gap
 * but count as matched; a debit more than 3 days off the due date is flagged as a date difference.
 */
export function emiReconciliation(
  loan: { emi: number; dueDay: number; from: string; nextDue: string; payments: { date: string; total: number }[] },
  debits: { id: string; date: string; amount: number; title: string }[],
  today: string,
): EmiRow[] {
  const rows: EmiRow[] = [];
  const used = new Set<string>();
  const start = new Date(t(loan.from));
  const end = loan.nextDue > today ? loan.nextDue : today;
  for (let k = 0; k < 600; k++) {
    const due = dueIn(start.getUTCFullYear(), start.getUTCMonth() + k, loan.dueDay);
    if (due < loan.from) continue;
    if (due > end) break;
    const month = due.slice(0, 7);
    const lender = loan.payments.filter((p) => p.date.slice(0, 7) === month).reduce((s, p) => s + p.total, 0);
    const candidates = debits
      .filter((d) => !used.has(d.id))
      .map((d) => ({ d, days: Math.round((t(d.date) - t(due)) / DAY) }))
      .filter((x) => x.days >= -EMI_WINDOW.before && x.days <= EMI_WINDOW.after)
      .sort((a, b) => Math.abs(a.days) - Math.abs(b.days));
    const pick = candidates[0];
    if (pick) used.add(pick.d.id);
    const amountDiff = pick ? Math.round((pick.d.amount - loan.emi) * 100) / 100 : null;
    const status: EmiRowStatus = !pick
      ? due > today ? "upcoming" : lender ? "lender_only" : "missing"
      : Math.abs(amountDiff!) > emiTolerance(loan.emi) ? "amount"
      : Math.abs(pick.days) > 3 ? "date" : "matched";
    rows.push({ due, emi: loan.emi, lenderPaid: lender || null, debit: pick?.d ?? null, amountDiff, dayDiff: pick?.days ?? null, status });
  }
  return rows;
}

/** Build match targets from saved loans, their accounts and recurring EMIs. */
export function emiTargets(
  loans: { id: string; name: string; emi: number; nextDue: string; accountId: string | null; status: string; loanType: string }[],
  commitments: { kind: string; status: string; amount: number; accountId: string | null; name: string }[],
  accounts: { id: string; details?: object | null | undefined }[],
): EmiTarget[] {
  return loans.filter((l) => l.status !== "closed" && l.loanType !== "credit_card_emi" && l.emi > 0).map((l) => {
    const c = commitments.find((x) => x.kind === "emi" && x.status === "active" && Math.abs(x.amount - l.emi) <= emiTolerance(l.emi));
    const acc = accounts.find((a) => a.id === l.accountId);
    const raw = (acc?.details as Record<string, unknown> | null | undefined)?.["matchRefs"];
    const refs = Array.isArray(raw) ? raw.filter((r): r is string => typeof r === "string") : [];
    return { loanId: l.id, name: l.name, loanAccountId: l.accountId, payFromAccountId: c?.accountId ?? null, emi: l.emi, dueDay: Number(l.nextDue.slice(8, 10)), refs };
  });
}
