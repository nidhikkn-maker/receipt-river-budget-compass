// How current each account's statement evidence is, and which months have entries no statement has confirmed.
import type { Expense } from "../expenses";
import type { Account } from "../ledger";

export type MonthState = "confirmed" | "missing" | "quiet";
export interface AccountCoverage {
  accountId: string;
  name: string;
  /** Newest entry date that a statement confirmed; null when none has. */
  latestStatementDate: string | null;
  daysBehind: number | null;
  months: { month: string; state: MonthState; entries: number }[];
  missingMonths: string[];
}

const monthOf = (d: string) => d.slice(0, 7);
function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** A month counts as confirmed only when at least one of its entries was matched to a statement. */
export function statementCoverage(accounts: Account[], transactions: Expense[], today: string, since = "2026-04"): AccountCoverage[] {
  const end = monthOf(today);
  return accounts.filter((a) => !a.archived).flatMap((a) => {
    const own = transactions.filter((t) => t.accountId === a.id && !t.transferCounterpartOf && t.date.slice(0, 7) >= since && t.date <= today);
    if (!own.length) return [];
    const confirmed = own.filter((t) => t.reconciledAt || t.statementRef);
    const latest = confirmed.reduce<string | null>((m, t) => (!m || t.date > m ? t.date : m), null);
    const first = own.reduce((m, t) => (t.date < m ? t.date : m), own[0]!.date);
    const months = monthsBetween(monthOf(first), end).map((month) => {
      const inMonth = own.filter((t) => monthOf(t.date) === month);
      const state: MonthState = !inMonth.length ? "quiet" : inMonth.some((t) => t.reconciledAt || t.statementRef) ? "confirmed" : "missing";
      return { month, state, entries: inMonth.length };
    });
    const daysBehind = latest ? Math.round((Date.parse(today) - Date.parse(latest)) / 86400000) : null;
    return [{ accountId: a.id, name: a.name, latestStatementDate: latest, daysBehind, months, missingMonths: months.filter((m) => m.state === "missing").map((m) => m.month) }];
  }).sort((x, y) => y.missingMonths.length - x.missingMonths.length || (y.daysBehind ?? 1e9) - (x.daysBehind ?? 1e9));
}
