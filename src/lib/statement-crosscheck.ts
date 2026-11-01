// Read-only cross-check: are records saved on one account actually lines on another account's statement?
// Pure functions only; nothing here saves, posts or edits records.

export type BalanceLine = { date: string; amount: number; direction: "debit" | "credit"; balance: number; description: string; source: string };
export type CrossRecord = { id: string; date: string; amount: number; kind: string; name: string; description?: string };
export type CrossResult = CrossRecord & { result: "found" | "found_wrong_kind" | "not_found"; line?: BalanceLine; score: number; confidence: "high" | "medium" | "low"; reasons: string[]; dayGap?: number; nearest?: BalanceLine };

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !/^(upi|pos|visa|neft|imps|hdfc|idfb|utib|ift|the|ltd|pvt|and|mr)$/.test(t) && !/^\d+$/.test(t)));
/** Explains a pairing; scores only inform review and never change a record. */
export function scoreMatch(record: CrossRecord, line: BalanceLine): { score: number; reasons: string[]; dayGap: number } {
  const reasons: string[] = [];
  let score = 0;
  const diff = Math.round(Math.abs(line.amount - record.amount) * 100) / 100;
  if (diff < 0.005) { score += 50; reasons.push("Same amount"); } else reasons.push(`Amount differs by ${diff.toFixed(2)}`);
  const gap = Math.round(days(line.date, record.date));
  score += [30, 22, 15, 8][gap] ?? 0;
  reasons.push(gap === 0 ? "Same date" : `Dates ${gap} day${gap === 1 ? "" : "s"} apart`);
  const a = tokens(record.name), b = tokens(line.description);
  const shared = [...a].filter((t) => b.has(t) || [...b].some((x) => x.startsWith(t) || t.startsWith(x)));
  if (shared.length) { score += Math.min(20, 10 * shared.length); reasons.push(`Description shares “${shared.slice(0, 3).join(", ")}”`); }
  else reasons.push("Descriptions share no words");
  const isOut = outKinds.has(record.kind);
  if ((line.direction === "debit") === isOut) reasons.push(`Direction agrees (money ${isOut ? "out" : "in"})`);
  else { score -= 25; reasons.push(`Saved as ${record.kind}, but statement shows money ${line.direction === "debit" ? "out" : "in"}`); }
  return { score: Math.max(0, Math.min(100, score)), reasons, dayGap: gap };
}
const band = (n: number) => (n >= 80 ? "high" : n >= 55 ? "medium" : "low") as CrossResult["confidence"];

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const NUM = /\d{1,3}(?:,\d{2,3})*\.\d{2}/g;
const DATE_ROW = /^\s*(\d{2})-([A-Za-z]{3})-(\d{4})\s+\d{2}-[A-Za-z]{3}-\d{4}\s*(.*)$/;
const toNum = (s: string) => Number(s.replaceAll(",", ""));

/** Parses IDFC-style statement text rows (date, value date, particulars, debit/credit, balance).
 * Direction comes from the running balance, so it never relies on column positions. */
export function parseBalanceStatement(rows: string[], source: string): { lines: BalanceLine[]; opening: number | null; closing: number | null } {
  let opening: number | null = null;
  for (let i = 0; i < rows.length && opening === null; i++) {
    const row = rows[i] ?? "";
    const own = row.match(/Opening Balance\s+([\d,]+\.\d{2})\s*$/);
    if (own) { opening = toNum(own[1]!); break; }
    if (/Opening Balance\s+Total Debit/i.test(row)) {
      const next = (rows[i + 1] ?? "").match(NUM);
      if (next?.length) opening = toNum(next[0]!);
    }
  }
  const lines: BalanceLine[] = [];
  let bal = opening;
  let pending: string[] = [];
  for (const row of rows) {
    const m = row.match(DATE_ROW);
    if (!m) {
      const t = row.trim();
      if (t && !NUM.test(t) && !/opening balance|statement|page \d|customer|account|transaction|value date|particulars|registered office/i.test(t)) pending.push(t);
      NUM.lastIndex = 0;
      continue;
    }
    const nums = (m[4] ?? "").match(NUM) ?? [];
    if (nums.length < 2) continue;
    const balance = toNum(nums[nums.length - 1]!);
    const amount = toNum(nums[nums.length - 2]!);
    const month = MONTHS[(m[2] ?? "").toLowerCase()];
    if (!month) continue;
    let direction: "debit" | "credit";
    if (bal !== null && Math.abs(Math.abs(balance - bal) - amount) < 0.01) direction = balance > bal ? "credit" : "debit";
    else direction = "debit"; // unknown running balance; flagged by totals check in the UI
    bal = balance;
    const text = (m[4] ?? "").replace(NUM, "").trim();
    lines.push({ date: `${m[3]}-${month}-${m[1]}`, amount, direction, balance, description: [...pending, text].join(" ").replace(/\s+/g, " ").trim().slice(0, 160), source });
    pending = [];
  }
  return { lines, opening, closing: bal };
}

const days = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
const outKinds = new Set(["expense", "transfer", "card_payment", "loan_repayment", "investment"]);

/** Same amount, closest date within the window; each statement line is used once. */
export function matchRecords<T extends { date: string; amount: number }>(records: T[], lines: BalanceLine[], windowDays = 3) {
  const used = new Set<number>();
  return records.map((r) => {
    let best = -1;
    let gap = Infinity;
    lines.forEach((l, i) => {
      if (used.has(i) || Math.abs(l.amount - r.amount) > 0.005) return;
      const g = days(l.date, r.date);
      if (g <= windowDays && g < gap) { gap = g; best = i; }
    });
    if (best >= 0) used.add(best);
    return { record: r, line: best >= 0 ? lines[best] : undefined };
  });
}

/** Records not on their own account's statement are checked against the other statements. */
export function crossCheck(records: CrossRecord[], homeLines: BalanceLine[], otherLines: BalanceLine[], windowDays = 3): { onHome: number; results: CrossResult[] } {
  const home = matchRecords(records, homeLines, windowDays);
  const leftover = home.filter((h) => !h.line).map((h) => h.record);
  const results = matchRecords(leftover, otherLines, windowDays).map(({ record, line }): CrossResult => {
    if (!line) {
      const nearest = otherLines.filter((l) => Math.abs(l.amount - record.amount) < 0.005).sort((x, y) => days(x.date, record.date) - days(y.date, record.date))[0];
      const reasons = [nearest ? `Same amount only on ${nearest.date} (${Math.round(days(nearest.date, record.date))} days away, outside the ${windowDays}-day window)` : "No statement entry with this amount", `Not on the statements provided between ${windowDays} days either side`];
      return { ...record, result: "not_found", score: 0, confidence: "low", reasons, nearest };
    }
    const s = scoreMatch(record, line);
    const wrong = (line.direction === "debit") !== outKinds.has(record.kind);
    return { ...record, line, result: wrong ? "found_wrong_kind" : "found", score: s.score, confidence: band(s.score), reasons: s.reasons, dayGap: s.dayGap };
  });
  return { onHome: records.length - leftover.length, results };
}

export function statementTotals(lines: BalanceLine[]) {
  const sum = (d: "debit" | "credit") => Math.round(lines.filter((l) => l.direction === d).reduce((s, l) => s + l.amount, 0) * 100) / 100;
  return { debits: sum("debit"), credits: sum("credit"), count: lines.length };
}

/** Groups PDF text items into visual rows (same baseline, left to right) per page. */
export function rowsFromItems(items: { str: string; x: number; y: number }[]): string[] {
  const groups: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const g = groups.find((r) => Math.abs(r.y - it.y) <= 2);
    if (g) g.parts.push({ x: it.x, s: it.str });
    else groups.push({ y: it.y, parts: [{ x: it.x, s: it.str }] });
  }
  return groups.sort((a, b) => b.y - a.y).map((g) => g.parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join("  "));
}
