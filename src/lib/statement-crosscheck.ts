// Read-only cross-check: are records saved on one account actually lines on another account's statement?
// Pure functions only; nothing here saves, posts or edits records.

export type BalanceLine = { date: string; amount: number; direction: "debit" | "credit"; balance: number; description: string; source: string };
export type CrossRecord = { id: string; date: string; amount: number; kind: string; name: string };
export type CrossResult = CrossRecord & { result: "found" | "found_wrong_kind" | "not_found"; line?: BalanceLine };

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
    if (!line) return { ...record, result: "not_found" };
    const wrong = (line.direction === "debit") !== outKinds.has(record.kind);
    return { ...record, line, result: wrong ? "found_wrong_kind" : "found" };
  });
  return { onHome: records.length - leftover.length, results };
}

export function statementTotals(lines: BalanceLine[]) {
  const sum = (d: "debit" | "credit") => Math.round(lines.filter((l) => l.direction === d).reduce((s, l) => s + l.amount, 0) * 100) / 100;
  return { debits: sum("debit"), credits: sum("credit"), count: lines.length };
}
