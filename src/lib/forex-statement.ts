/** HDFC multi-currency forex card statements: each wallet (EUR, USD…) is its own section with its own closing balance. Pure, browser-safe. */
export type ForexLine = { date: string; description: string; merchant: string; txnCurrency: string; credit: number; debit: number; balance: number };
export type ForexWallet = { currency: string; printedBalance: number | null; lines: ForexLine[] };

const num = (s: string) => Number(s.replace(/,/g, ""));

export function parseForexStatement(rows: string[]): ForexWallet[] {
  const wallets: ForexWallet[] = [];
  let cur: ForexWallet | null = null;
  for (const raw of rows) {
    const row = raw.replace(/\s+/g, " ").trim();
    const c = row.match(/Currency\s*:\s*([A-Z]{3})/);
    if (c) {
      const code = c[1]!;
      cur = wallets.find((w) => w.currency === code) ?? null;
      if (!cur) { cur = { currency: code, printedBalance: null, lines: [] }; wallets.push(cur); }
    }
    const b = row.match(/Avl\.? Balance\s*:\s*([\d,]+\.\d{2})/);
    if (b && cur) cur.printedBalance = num(b[1]!);
    const m = row.match(/^(\d{2})-(\d{2})-(\d{4}) (.+?) ([\d,]+\.\d{2}) ([\d,]+\.\d{2}) ([\d,]+\.\d{2}) (Approved|Settled|Pending)\b/i);
    if (!m || !cur) continue;
    const [, d, mo, y, middle, cr, dr, bal] = m;
    const ccy = middle!.match(/\b([A-Z]{3})$/)?.[1] ?? "";
    const text = ccy ? middle!.slice(0, -3).trim() : middle!.trim();
    const known = text.match(/^(Online ReLoad|Assign Product Authorization|Purchase|Cross Currency Fee|CGST Charges|SGST Charges|IGST Charges|Refund|Cash Withdrawal|ATM Withdrawal|Unload)\s*(.*)$/i);
    cur.lines.push({ date: `${y}-${mo}-${d}`, description: known ? known[1]! : text, merchant: known ? known[2]!.trim() : "", txnCurrency: ccy || cur.currency, credit: num(cr!), debit: num(dr!), balance: num(bal!) });
  }
  return wallets.filter((w) => w.lines.length || w.printedBalance !== null);
}

/** Running balances must chain; returns each break (a line the PDF did not print, or a misread). */
export function walletBreaks(w: ForexWallet) {
  const out: { index: number; expected: number; printed: number }[] = [];
  w.lines.forEach((l, i) => {
    if (i === 0) return;
    const expected = Math.round((w.lines[i - 1]!.balance + l.credit - l.debit) * 100) / 100;
    if (Math.abs(expected - l.balance) > 0.005) out.push({ index: i, expected, printed: l.balance });
  });
  return out;
}

export type ForexRecord = { id: string; date: string; currency: string; originalAmount: number; title: string };
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/** Matches wallet debits to saved spending in the same currency (same original amount, within 3 days, each used once). */
export function reconcileWallet(w: ForexWallet, records: ForexRecord[], windowDays = 3) {
  const pool = records.filter((r) => r.currency === w.currency);
  const used = new Set<string>();
  const debits = w.lines.filter((l) => l.debit > 0);
  const matched: { line: ForexLine; record: ForexRecord }[] = [];
  const missing: ForexLine[] = [];
  for (const l of debits) {
    let best: ForexRecord | null = null;
    for (const r of pool) if (!used.has(r.id) && Math.abs(r.originalAmount - l.debit) < 0.005 && days(r.date, l.date) <= windowDays && (!best || days(r.date, l.date) < days(best.date, l.date))) best = r;
    if (best) { used.add(best.id); matched.push({ line: l, record: best }); } else missing.push(l);
  }
  const first = w.lines[0]?.date, last = w.lines[w.lines.length - 1]?.date;
  const extra = pool.filter((r) => !used.has(r.id) && first && last && r.date >= first && (r.date <= last || days(r.date, last) <= 7));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const loaded = r2(w.lines.reduce((s, l) => s + l.credit, 0));
  const recordedSpend = r2(matched.reduce((s, m) => s + m.record.originalAmount, 0) + extra.reduce((s, r) => s + r.originalAmount, 0));
  const closing = w.lines.length ? w.lines[w.lines.length - 1]!.balance : w.printedBalance;
  const appBalanceAfterPosting = r2(loaded - recordedSpend - missing.reduce((s, l) => s + l.debit, 0));
  return { matched, missing, extra, loaded, closing, appBalanceAfterPosting, difference: closing === null ? null : r2(closing - appBalanceAfterPosting) };
}
