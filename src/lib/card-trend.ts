// How current each card's figures are, and how its owed amount moved over time (pure, tested).
import { balanceAsOf, type Account, type Txn } from "./ledger";

/** A ledger row as the card views need it: statement evidence plus the time the record was last written. */
export interface CardRecord extends Txn { statementRef?: string | null; updatedAt?: string | null }

/** Where a card's statement date came from, so the wording shown next to it can stay honest. */
export type StatementBasis = "entered" | "imported" | "latest_entry" | "none";

export interface CardRecency {
  /** Through-date of the newest statement evidence for this card. */
  statementDate: string | null;
  basis: StatementBasis;
  /** When one of this card's records was last written (ISO timestamp), if the app has it. */
  lastUpdated: string | null;
  /** Newest transaction date on the card. */
  latestEntry: string | null;
}

const latest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;
const earliest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null;
const dayOnly = (d: string) => d.slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Statement date and last-write time for one card, from evidence that already exists.
 * Never invents a statement: with nothing imported or entered it reports the newest entry instead.
 */
export function cardRecency(card: Account, txns: CardRecord[], enteredDate?: string | null): CardRecency {
  const mine = txns.filter((t) => t.accountId === card.id || t.toAccountId === card.id);
  const latestEntry = latest(mine.map((t) => t.date));
  const entered = enteredDate ? dayOnly(enteredDate) : null;
  const imported = latest(mine.filter((t) => t.statementRef).map((t) => t.date));
  let statementDate: string | null = null;
  let basis: StatementBasis = "none";
  if (entered && (!imported || entered >= imported)) { statementDate = entered; basis = "entered"; }
  else if (imported) { statementDate = imported; basis = "imported"; }
  else if (latestEntry) { statementDate = latestEntry; basis = "latest_entry"; }
  return { statementDate, basis, lastUpdated: latest(mine.map((t) => t.updatedAt)), latestEntry };
}

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Plain-language statement line for a card, saying so when the date is only the newest entry. */
export function statementCaption(r: CardRecency): string {
  if (!r.statementDate) return "No statement on file yet";
  if (r.basis === "entered") return `Statement to ${longDate(r.statementDate)} (balance you entered)`;
  if (r.basis === "imported") return `Statement to ${longDate(r.statementDate)}`;
  return `No statement yet — newest entry ${longDate(r.statementDate)}`;
}

/** Plain-language "last updated" line; falls back to the newest entry date when no write time exists. */
export function updatedCaption(r: CardRecency): string {
  const d = r.lastUpdated ? new Date(r.lastUpdated) : null;
  if (!d || Number.isNaN(d.getTime())) return r.latestEntry ? `Last entry ${longDate(r.latestEntry)}` : "Nothing recorded yet";
  return `Updated ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

/** Month (year, 1-12) `back` months before `today`'s month. */
const monthOf = (today: string, back: number) => {
  const t = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 - back;
  return [Math.floor(t / 12), (t % 12) + 1] as const;
};

/** Last day of the month `back` months ago, never later than today. */
export const monthEndPoint = (today: string, back: number) => {
  const [y, m] = monthOf(today, back);
  const end = `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  return end > today ? today : end;
};
const monthLabel = (today: string, back: number) => {
  const [y, m] = monthOf(today, back);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en", { month: "short", timeZone: "UTC" });
};

/** Account numbers are long; keep only enough of the name to tell cards apart in a chart. */
export function shortCardName(card: Account): string {
  const n = card.name.trim();
  const m = n.match(/^(.*?)(\d{5,})$/);
  const base = m ? `${m[1].trim()} …${m[2].slice(-4)}` : n;
  return base.length > 22 ? `${base.slice(0, 21).trim()}…` : base;
}

/** Distinct chart labels per card, so two cards sharing a name still get separate lines. */
export function cardTrendKeys(cards: Account[]): string[] {
  const seen = new Map<string, number>();
  return cards.map((c) => {
    const n = (seen.get(shortCardName(c)) ?? 0) + 1;
    seen.set(shortCardName(c), n);
    return n === 1 ? shortCardName(c) : `${shortCardName(c)} (${n})`;
  });
}

export interface TrendPoint { label: string; date: string; [cardName: string]: string | number | null }

/**
 * Amount owed (above zero) or in credit (below zero) for each card at the end of each of the last `months` months.
 * Months before a card's first recorded entry are left empty rather than guessed.
 */
export function cardBalanceSeries(cards: Account[], txns: Txn[], months: number, today: string): TrendPoint[] {
  const keys = cardTrendKeys(cards);
  const firstEntry = cards.map((c) => earliest(txns.filter((t) => t.accountId === c.id || t.toAccountId === c.id).map((t) => t.date)));
  const out: TrendPoint[] = [];
  for (let back = Math.max(1, months) - 1; back >= 0; back--) {
    const date = monthEndPoint(today, back);
    const point: TrendPoint = { label: monthLabel(today, back), date };
    cards.forEach((c, i) => { point[keys[i]] = firstEntry[i] && date >= firstEntry[i] ? balanceAsOf(c, txns, date) : null; });
    out.push(point);
  }
  return out;
}
