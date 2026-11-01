// The one matcher every statement flow uses: exact amount, closest date, one record per line (pure, tested).
import type { TxnType } from "../ledger";
import type { Dir, StmtLine } from "./line";

/** A ledger row as the matcher needs it, with the amount in the row's own currency. */
export interface LedgerRec {
  id: string;
  date: string;
  amount: number;
  kind: TxnType;
  name: string;
  description: string;
  currency: string;
  accountId: string | null;
  toAccountId: string | null;
  reconciledAt?: string | null;
}

/** Kinds that take money out of the account the statement belongs to. */
export const OUT_KINDS: TxnType[] = ["expense", "transfer", "card_payment", "loan_repayment", "investment", "advance"];
export const isOut = (k: TxnType) => OUT_KINDS.includes(k);

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
const STOP = /^(upi|pos|visa|neft|imps|hdfc|idfc|icici|utib|the|ltd|pvt|and|mr|for|at|by)$/;
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.test(t) && !/^\d+$/.test(t)));

export interface MatchScore { score: number; reasons: string[]; dayGap: number }

/** Why two things look like the same movement. Scores only inform review; they never change a record. */
export function scoreRecord(rec: LedgerRec, line: StmtLine): MatchScore {
  const reasons: string[] = [];
  let score = 0;
  const diff = Math.round(Math.abs(line.amount - rec.amount) * 100) / 100;
  if (diff < 0.005) { score += 50; reasons.push("Same amount"); } else reasons.push(`Amount differs by ${diff.toFixed(2)}`);
  const gap = Math.round(days(line.date, rec.date));
  score += [30, 22, 15, 8][gap] ?? 0;
  reasons.push(gap === 0 ? "Same date" : `Dates ${gap} day${gap === 1 ? "" : "s"} apart`);
  const a = tokens(`${rec.name} ${rec.description}`);
  const b = tokens(line.description);
  const shared = [...a].filter((t) => b.has(t) || [...b].some((x) => x.startsWith(t) || t.startsWith(x)));
  if (shared.length) { score += Math.min(20, 10 * shared.length); reasons.push(`Description shares “${shared.slice(0, 3).join(", ")}”`); }
  else reasons.push("Descriptions share no words");
  if ((line.direction === "debit") === isOut(rec.kind)) reasons.push(`Direction agrees (money ${isOut(rec.kind) ? "out" : "in"})`);
  else { score -= 25; reasons.push(`Saved as ${rec.kind}, but the statement shows money ${line.direction === "debit" ? "out" : "in"}`); }
  return { score: Math.max(0, Math.min(100, score)), reasons, dayGap: gap };
}

export type MatchResult = "matched" | "wrong_kind" | "missing";
export interface MatchOutcome {
  line: StmtLine;
  record?: LedgerRec | undefined;
  result: MatchResult;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

const band = (n: number) => (n >= 80 ? "high" : n >= 55 ? "medium" : "low") as MatchOutcome["confidence"];

/** One-to-one pairing: the best-scoring pairs are taken first, so no record or line is used twice. */
export function matchLines(lines: StmtLine[], records: LedgerRec[], windowDays = 3): MatchOutcome[] {
  const pairs: { line: StmtLine; rec: LedgerRec; score: number }[] = [];
  for (const line of lines) {
    for (const rec of records) {
      if (rec.currency !== line.currency || Math.abs(rec.amount - line.amount) > 0.005) continue;
      if (days(line.date, rec.date) > windowDays) continue;
      pairs.push({ line, rec, score: scoreRecord(rec, line).score });
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.line.key.localeCompare(y.line.key) || x.rec.id.localeCompare(y.rec.id));
  const usedLine = new Set<string>();
  const usedRec = new Set<string>();
  const chosen = new Map<string, LedgerRec>();
  for (const p of pairs) {
    if (usedLine.has(p.line.key) || usedRec.has(p.rec.id)) continue;
    usedLine.add(p.line.key);
    usedRec.add(p.rec.id);
    chosen.set(p.line.key, p.rec);
  }
  return lines.map((line): MatchOutcome => {
    const rec = chosen.get(line.key);
    if (!rec) return { line, result: "missing", score: 0, confidence: "low", reasons: ["No record with this amount inside the date window"] };
    const s = scoreRecord(rec, line);
    const wrong = (line.direction === "debit") !== isOut(rec.kind);
    return { line, record: rec, result: wrong ? "wrong_kind" : "matched", score: s.score, confidence: band(s.score), reasons: s.reasons };
  });
}

/** Records on this account that no statement line explains — the "recorded but never on a statement" list. */
export function recordsNotMatched(records: LedgerRec[], outcomes: MatchOutcome[]): LedgerRec[] {
  const used = new Set(outcomes.filter((o) => o.record).map((o) => o.record!.id));
  return records.filter((r) => !used.has(r.id));
}

export interface Pairable { key: string; date: string; amount: number; direction: Dir }

/**
 * A line is a movement between two of your own accounts only when exactly one opposite-direction,
 * same-amount line sits within the window. Amount alone never makes a transfer.
 */
export function pairOpposites(missing: Pairable[], others: Pairable[], windowDays = 2): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const m of missing) {
    const c = others.filter((o) => !taken.has(o.key) && o.direction !== m.direction && Math.abs(o.amount - m.amount) < 0.005 && days(o.date, m.date) <= windowDays);
    if (c.length === 1 && c[0]) { taken.add(c[0].key); out.set(m.key, c[0].key); }
  }
  return out;
}

/** Maps a saved transaction into the matcher's shape (amount in the transaction's own currency). */
export function ledgerRec(e: {
  id: string; date: string; amount: number; originalAmount?: number | undefined; currency: string;
  txnType?: TxnType | undefined; merchant?: string | null; title: string; description?: string | undefined;
  accountId?: string | null; toAccountId?: string | null; reconciledAt?: string | null;
}): LedgerRec {
  return {
    id: e.id,
    date: e.date,
    amount: e.originalAmount ?? e.amount,
    kind: e.txnType ?? "expense",
    name: e.merchant || e.title,
    description: e.description ?? "",
    currency: e.currency,
    accountId: e.accountId ?? null,
    toAccountId: e.toAccountId ?? null,
    reconciledAt: e.reconciledAt ?? null,
  };
}
