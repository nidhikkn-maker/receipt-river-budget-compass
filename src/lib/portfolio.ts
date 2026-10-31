import { accountBalance, accountValue, type Account, type Txn, type Valuation } from "./ledger";

const round = (n: number) => Math.round(n * 100) / 100;
const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

export interface PortfolioPoint { date: string; value: number; reference: number; netFlows: number; gain: number; fundCount: number }
export interface PortfolioHolding extends PortfolioPoint { accountId: string; name: string; firstDate: string; latestDate: string; baseline: number }
export interface PortfolioOptions { asOf: string; from?: string; to?: string; accountId?: string }

/** Only explicitly saved NAV snapshots identify mutual funds, not arbitrary investment accounts. */
export function isNavValuation(v: Valuation): boolean {
  return v.source === "MFapi / AMFI NAV";
}

/** Gain since the first saved NAV, net of subsequent ledger movements; NOT lifetime gain/cost basis. */
export function buildPortfolio(accounts: Account[], txns: Txn[], valuations: Valuation[], options: PortfolioOptions) {
  const empty = { points: [] as PortfolioPoint[], holdings: [] as PortfolioHolding[], firstDate: null as string | null, latestDate: null as string | null };
  if (!validDate(options.asOf) || (options.from && !validDate(options.from)) || (options.to && !validDate(options.to))) return empty;
  const end = options.to && options.to < options.asOf ? options.to : options.asOf;
  if (options.from && options.from > end) return empty;
  const funds = accounts.filter(a => a.kind === "investment" && !a.archived && (!options.accountId || a.id === options.accountId)).flatMap(account => {
    // Preserve the data layer's ordering for same-day snapshots, matching accountValue.
    const snapshots = valuations.filter(v => v.accountId === account.id && isNavValuation(v) && validDate(v.valuedOn) && v.valuedOn <= end && Number.isFinite(v.value) && v.value >= 0);
    const first = [...snapshots].sort((a, b) => a.valuedOn.localeCompare(b.valuedOn))[0];
    return first ? [{ account, snapshots, first }] : [];
  });
  if (!funds.length) return empty;
  const holdingAt = (fund: typeof funds[number], date: string): PortfolioHolding | null => {
    if (date < fund.first.valuedOn) return null;
    const { account, first, snapshots } = fund;
    const current = accountValue(account, txns, snapshots, date);
    const flows = accountBalance({ ...account, openingBalance: 0 }, txns.filter(t => t.date > first.valuedOn && t.date <= date));
    const baseline = accountValue(account, [], snapshots, first.valuedOn).value;
    return { accountId: account.id, name: account.name, date, firstDate: first.valuedOn, latestDate: current.valuedOn ?? first.valuedOn,
      baseline, value: current.value, netFlows: flows, reference: round(baseline + flows), gain: round(current.value - baseline - flows), fundCount: 1 };
  };
  const firstDate = funds.map(f => f.first.valuedOn).sort()[0];
  if (!firstDate) return empty;
  const start = options.from && options.from > firstDate ? options.from : firstDate;
  // NAV and ledger dates only. Carry-forward at the range boundaries, never invent intervening NAVs.
  const dates = new Set<string>([start, end]);
  for (const fund of funds) {
    for (const v of fund.snapshots) if (v.valuedOn >= start) dates.add(v.valuedOn);
    for (const t of txns) if (t.date >= start && t.date <= end && (t.accountId === fund.account.id || (t.txnType === "transfer" && t.toAccountId === fund.account.id))) dates.add(t.date);
  }
  const points = [...dates].sort().map(date => {
    const rows = funds.flatMap(f => { const h = holdingAt(f, date); return h ? [h] : []; });
    const sum = (key: "value" | "reference" | "netFlows" | "gain") => round(rows.reduce((s, h) => s + h[key], 0));
    return { date, value: sum("value"), reference: sum("reference"), netFlows: sum("netFlows"), gain: sum("gain"), fundCount: rows.length };
  });
  const holdings = funds.flatMap(f => { const h = holdingAt(f, end); return h ? [h] : []; }).sort((a, b) => b.value - a.value);
  return { points, holdings, firstDate, latestDate: holdings.map(h => h.latestDate).sort().at(-1) ?? null };
}