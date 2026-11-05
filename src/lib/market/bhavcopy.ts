/**
 * Official NSE/BSE end-of-day "bhavcopy" files [v6.1 §2–5]. Both exchanges publish the same UDiFF
 * column layout; we keep cash-market securities with an ISIN and a positive closing price. Prices
 * are end-of-day only — never shown as live.
 */
export interface ClosingRow { exchange: "NSE" | "BSE"; symbol: string; isin: string | null; series: string; name: string; close: number; prevClose: number | null; date: string }

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map((s) => s.trim());
}

export function parseBhavcopy(csv: string, exchange: "NSE" | "BSE"): ClosingRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const head = splitCsv(lines[0]!);
  const col = (n: string) => head.indexOf(n);
  const [iD, iTp, iIsin, iSym, iSer, iNm, iCl, iPc] = ["TradDt", "FinInstrmTp", "ISIN", "TckrSymb", "SctySrs", "FinInstrmNm", "ClsPric", "PrvsClsgPric"].map(col) as number[];
  if ([iD, iSym, iCl].some((i) => i! < 0)) throw new Error(`${exchange} closing file has an unexpected layout`);
  const out: ClosingRow[] = [];
  for (const l of lines.slice(1)) {
    const f = splitCsv(l);
    if (iTp! >= 0 && f[iTp!] && f[iTp!] !== "STK") continue;
    const close = Number(f[iCl!]); const date = f[iD!] ?? "";
    if (!(close > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !f[iSym!]) continue;
    const isin = iIsin! >= 0 && /^IN[A-Z0-9]{10}$/.test(f[iIsin!] ?? "") ? f[iIsin!]! : null;
    const pc = iPc! >= 0 ? Number(f[iPc!]) : NaN;
    out.push({ exchange, symbol: f[iSym!]!, isin, series: iSer! >= 0 ? f[iSer!] ?? "" : "", name: iNm! >= 0 ? (f[iNm!] ?? "").slice(0, 120) : "", close, prevClose: pc > 0 ? pc : null, date });
  }
  return out;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
export const nseUrl = (d: Date) => `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${ymd(d)}_F_0000.csv.zip`;
export const bseUrl = (d: Date) => `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${ymd(d)}_F_0000.CSV`;

/** Most recent weekdays (IST) to try, newest first; holidays simply return no file and are skipped. */
export function candidateDays(now: Date, n = 5): Date[] {
  const ist = new Date(now.getTime() + 5.5 * 3600e3);
  // Files appear after the close; before 18:00 IST start from the previous day.
  if (ist.getUTCHours() < 18) ist.setUTCDate(ist.getUTCDate() - 1);
  const out: Date[] = [];
  while (out.length < n) { const d = ist.getUTCDay(); if (d !== 0 && d !== 6) out.push(new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()))); ist.setUTCDate(ist.getUTCDate() - 1); }
  return out;
}

/** Latest closing price per ISIN, preferring NSE over BSE on the same date [v6.1 §3]. */
export function latestByIsin(rows: { exchange: string; isin: string | null; close: number; price_date: string; symbol: string }[]): Map<string, { exchange: string; close: number; date: string; symbol: string }> {
  const m = new Map<string, { exchange: string; close: number; date: string; symbol: string }>();
  for (const r of rows) {
    if (!r.isin) continue;
    const p = m.get(r.isin);
    if (!p || r.price_date > p.date || (r.price_date === p.date && r.exchange === "NSE" && p.exchange !== "NSE")) m.set(r.isin, { exchange: r.exchange, close: Number(r.close), date: r.price_date, symbol: r.symbol });
  }
  return m;
}

/** Latest close per ISIN on one exchange: NSE and BSE prices for the same ISIN stay separate [v6.1 §3]. */
export function latestByIsinExchange(rows: { exchange: string; isin: string | null; close: number; price_date: string; symbol: string }[]): Map<string, { exchange: string; close: number; date: string; symbol: string }> {
  const m = new Map<string, { exchange: string; close: number; date: string; symbol: string }>();
  for (const r of rows) {
    if (!r.isin) continue;
    const k = `${r.isin}|${r.exchange}`, p = m.get(k);
    if (!p || r.price_date > p.date) m.set(k, { exchange: r.exchange, close: Number(r.close), date: r.price_date, symbol: r.symbol });
  }
  return m;
}
/** The holding's own exchange when it names one; otherwise the default (NSE-preferred) latest close. */
export function pickClose<T>(byIsin: Map<string, T>, byIsinEx: Map<string, T>, isin: string, exchange?: string | null): T | undefined {
  return exchange ? byIsinEx.get(`${isin}|${exchange}`) : byIsin.get(isin);
}
