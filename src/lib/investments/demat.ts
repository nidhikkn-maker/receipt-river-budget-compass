// Demat, transaction and capital-gains statements: reading, completeness and duplicate-free merging.
// Pure rules only. Securities are identified by ISIN, never by name; nothing missing is invented.

export type InvestDocKind = "demat" | "transactions" | "gains";
export interface HoldingLine { isin: string; name: string; quantity: number; value: number | null }
export interface TradeLine { date: string; isin: string; name: string; side: "buy" | "sell"; quantity: number; price: number | null; amount: number | null }
export interface GainLine { sellDate: string; buyDate: string | null; isin: string; name: string; quantity: number; cost: number | null; proceeds: number | null; gain: number | null }
/** Non-trade investment events on transaction statements [v6 §43]; reported for reconciliation, never posted. */
export type InvestEventKind = "dividend" | "redemption" | "bonus" | "split" | "rights" | "merger" | "brokerage";
export interface InvestEvent { date: string; isin: string; name: string; kind: InvestEventKind; quantity: number | null; amount: number | null }
export interface InvestDoc { kind: InvestDocKind; broker: string; dpId: string; clientId: string; holder: string; asOf: string | null; holdings: HoldingLine[]; trades: TradeLine[]; gains: GainLine[]; events?: InvestEvent[] }
const EVENT_RE: [RegExp, InvestEventKind][] = [[/\bdividend\b/i, "dividend"], [/\bredemption|redeem/i, "redemption"], [/\bbonus\b/i, "bonus"], [/\b(split|sub-?division)\b/i, "split"], [/\brights?\b/i, "rights"], [/\b(merger|amalgamation|demerger)\b/i, "merger"], [/\bbrokerage\b/i, "brokerage"]];
export function eventKindOf(row: string): InvestEventKind | null { return EVENT_RE.find(([re]) => re.test(row))?.[1] ?? null; }

export interface Lot { date: string; side: "buy" | "sell"; quantity: number; price: number | null; amount: number | null; source: string }
export interface StoredHolding { isin: string; name: string; quantity: number; asOf: string | null; statementValue: number | null; lots: Lot[]; gains: (GainLine & { source: string })[]; sources: string[] }

const ISIN = /\b(IN[A-Z0-9]{9}\d)\b/;
const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const DATE = /\b(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;

export function datesIn(row: string): string[] {
  const out: string[] = [];
  for (const m of row.matchAll(DATE)) {
    if (m[4]) { out.push(`${m[4]}-${m[5]}-${m[6]}`); continue; }
    const mon = /\d/.test(m[2]!) ? m[2]!.padStart(2, "0") : MONTHS[m[2]!.toLowerCase()];
    if (!mon || Number(mon) > 12) continue;
    out.push(`${m[3]}-${mon}-${m[1]!.padStart(2, "0")}`);
  }
  return out;
}

/** Numbers in a row after removing ISINs and dates, so neither is mistaken for a quantity. */
export function numbersIn(row: string): number[] {
  const clean = row.replace(new RegExp(ISIN.source, "g"), " ").replace(DATE, " ");
  return [...clean.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ""))).filter(Number.isFinite);
}

const nameOf = (row: string, isin: string) => row.slice(row.indexOf(isin) + isin.length).replace(/[-\d,.\s]+$/g, "").replace(/\b(BUY|SELL|B|S)\b/gi, "").replace(/\s+/g, " ").trim().replace(/^[^A-Za-z]+/, "").split(/\s{2,}| \d/)[0]!.trim()
  || row.slice(0, row.indexOf(isin)).replace(/[\d,./-]+/g, " ").replace(/\s+/g, " ").trim();

const labelled = (rows: string[], re: RegExp) => { for (const r of rows) { const m = r.match(re); if (m?.[1]) return m[1].trim(); } return ""; };

export function detectInvestmentDoc(rows: string[]): InvestDocKind | null {
  const text = rows.join("\n");
  if (!rows.some((r) => ISIN.test(r))) return null;
  if (/capital\s+gain/i.test(text)) return "gains";
  if (/\b(trade|transaction|contract)\b/i.test(text) && rows.some((r) => ISIN.test(r) && /\b(buy|sell|b|s)\b/i.test(r))) return "transactions";
  if (/\b(demat|holding|dp\s*id|depository|nsdl|cdsl)\b/i.test(text)) return "demat";
  return null;
}

export function parseInvestmentDoc(rows: string[]): InvestDoc | null {
  const kind = detectInvestmentDoc(rows);
  if (!kind) return null;
  const text = rows.join("\n");
  const broker = /icici\s*direct|icici\s*securities/i.test(text) ? "ICICI Direct" : labelled(rows, /^\s*(?:broker|depository participant)\s*[:-]\s*(.+)$/i);
  const doc: InvestDoc = {
    kind, broker,
    dpId: labelled(rows, /\bDP\s*ID\s*[:-]?\s*([A-Z0-9]{6,16})/i),
    clientId: labelled(rows, /\b(?:client|BO|beneficiary)\s*ID\s*[:-]?\s*([A-Z0-9]{6,16})/i),
    holder: labelled(rows, /\b(?:account holder|holder name|name of (?:the )?holder|client name)\s*[:-]\s*([A-Za-z .]+)/i),
    asOf: (() => { const r = rows.find((x) => /\b(as on|as of|statement date|holding as)\b/i.test(x)); return r ? datesIn(r)[0] ?? null : null; })(),
    holdings: [], trades: [], gains: [], events: [],
  };
  for (const row of rows) {
    const isin = row.match(ISIN)?.[1];
    if (!isin) continue;
    const nums = numbersIn(row);
    const dates = datesIn(row);
    const name = nameOf(row, isin);
    if (kind === "demat") {
      if (!nums.length) continue;
      doc.holdings.push({ isin, name, quantity: nums[0]!, value: nums.length > 1 ? nums[nums.length - 1]! : null });
    } else if (kind === "transactions" && eventKindOf(row) && dates[0]) {
      const ev = eventKindOf(row)!;
      doc.events!.push({ date: dates[0], isin, name, kind: ev, quantity: ["bonus", "split", "rights", "merger", "redemption"].includes(ev) && nums.length ? Math.abs(nums[0]!) : null, amount: nums.length ? Math.abs(nums[nums.length - 1]!) : null });
    } else if (kind === "transactions") {
      const side = /\b(sell|s)\b/i.test(row) ? "sell" : /\b(buy|b)\b/i.test(row) ? "buy" : null;
      if (!side || !dates[0] || !nums.length) continue;
      doc.trades.push({ date: dates[0], isin, name, side, quantity: Math.abs(nums[0]!), price: nums[1] ?? null, amount: nums.length > 2 ? Math.abs(nums[nums.length - 1]!) : null });
    } else {
      if (!dates[0] || nums.length < 1) continue;
      const sell = dates.length > 1 ? [...dates].sort()[1]! : dates[0];
      const buy = dates.length > 1 ? [...dates].sort()[0]! : null;
      const tail = nums.slice(1);
      doc.gains.push({ sellDate: sell, buyDate: buy, isin, name, quantity: Math.abs(nums[0]!),
        cost: tail.length >= 3 ? tail[tail.length - 3]! : null, proceeds: tail.length >= 3 ? tail[tail.length - 2]! : null, gain: tail.length >= 3 ? tail[tail.length - 1]! : null });
    }
  }
  return doc;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
export const netQuantity = (lots: Lot[]) => round(lots.reduce((s, l) => s + (l.side === "buy" ? l.quantity : -l.quantity), 0));

export type CheckState = "ok" | "needed" | "pending" | "missing";
export interface Completeness {
  account: CheckState; holdings: CheckState; valuation: CheckState; purchaseHistory: CheckState; capitalGains: CheckState; original: CheckState;
  missingHistory: { isin: string; name: string; gap: number }[];
  needsHistoryUpload: boolean;
}

/** The six review statuses. Valuation stays "needed" until a trusted price exists; statement values are not prices. */
export function completeness(h: { dpId: string; clientId: string; holdings: StoredHolding[]; stored: boolean; pricedIsins?: Set<string> }): Completeness {
  const missingHistory = h.holdings.flatMap((x) => {
    const gap = round(x.quantity - netQuantity(x.lots));
    return x.lots.some((l) => l.side === "buy") && Math.abs(gap) < 1e-6 ? [] : [{ isin: x.isin, name: x.name, gap }];
  });
  const sells = h.holdings.flatMap((x) => x.lots.filter((l) => l.side === "sell").map((l) => ({ isin: x.isin, ...l })));
  const gainsOk = sells.every((s) => h.holdings.find((x) => x.isin === s.isin)?.gains.some((g) => g.sellDate === s.date && Math.abs(g.quantity - s.quantity) < 1e-6));
  const priced = h.pricedIsins && h.holdings.length > 0 && h.holdings.every((x) => h.pricedIsins!.has(x.isin));
  return {
    account: h.dpId || h.clientId ? "ok" : "needed",
    holdings: h.holdings.length ? "ok" : "missing",
    valuation: priced ? "ok" : "needed",
    purchaseHistory: !h.holdings.length ? "pending" : missingHistory.length ? "missing" : "ok",
    capitalGains: !h.holdings.length ? "pending" : sells.length === 0 ? (missingHistory.length ? "pending" : "ok") : gainsOk ? "ok" : "pending",
    original: h.stored ? "ok" : "pending",
    missingHistory,
    needsHistoryUpload: missingHistory.length > 0,
  };
}

const lotKey = (l: Pick<Lot, "date" | "side" | "quantity" | "price">) => `${l.date}|${l.side}|${l.quantity}|${l.price ?? ""}`;
const gainKey = (g: Pick<GainLine, "sellDate" | "quantity" | "buyDate">) => `${g.sellDate}|${g.buyDate ?? ""}|${g.quantity}`;

export interface MergeResult { holdings: StoredHolding[]; added: { holdings: number; lots: number; gains: number }; unmatched: { isin: string; name: string }[]; duplicatesSkipped: number }

/**
 * Folds a document into existing holdings by ISIN. A demat statement sets quantity/value per ISIN (one row each);
 * trades and gains only attach to holdings that already exist — unknown ISINs are reported, never created.
 */
export function mergeInvestmentDoc(existing: StoredHolding[], doc: InvestDoc, source: string): MergeResult {
  const map = new Map(existing.map((h) => [h.isin, { ...h, lots: [...h.lots], gains: [...h.gains], sources: [...h.sources] }]));
  const added = { holdings: 0, lots: 0, gains: 0 };
  const unmatched = new Map<string, string>();
  let duplicatesSkipped = 0;
  const touch = (h: StoredHolding) => { if (!h.sources.includes(source)) h.sources.push(source); };
  if (doc.kind === "demat") {
    for (const line of doc.holdings) {
      const cur = map.get(line.isin);
      if (cur) { cur.quantity = line.quantity; cur.statementValue = line.value; cur.asOf = doc.asOf ?? cur.asOf; if (!cur.name) cur.name = line.name; touch(cur); }
      else { map.set(line.isin, { isin: line.isin, name: line.name, quantity: line.quantity, asOf: doc.asOf, statementValue: line.value, lots: [], gains: [], sources: [source] }); added.holdings++; }
    }
  }
  for (const t of doc.trades) {
    const cur = map.get(t.isin);
    if (!cur) { unmatched.set(t.isin, t.name); continue; }
    const lot: Lot = { date: t.date, side: t.side, quantity: t.quantity, price: t.price, amount: t.amount, source };
    if (cur.lots.some((l) => lotKey(l) === lotKey(lot))) { duplicatesSkipped++; continue; }
    cur.lots.push(lot); touch(cur); added.lots++;
  }
  for (const g of doc.gains) {
    const cur = map.get(g.isin);
    if (!cur) { unmatched.set(g.isin, g.name); continue; }
    if (cur.gains.some((x) => gainKey(x) === gainKey(g))) { duplicatesSkipped++; continue; }
    cur.gains.push({ ...g, source }); touch(cur); added.gains++;
    // A gains statement also evidences the buy (when dated) and the sell, filling purchase history.
    const sell: Lot = { date: g.sellDate, side: "sell", quantity: g.quantity, price: null, amount: g.proceeds, source };
    if (!cur.lots.some((l) => l.side === "sell" && l.date === sell.date && l.quantity === sell.quantity)) { cur.lots.push(sell); added.lots++; }
    if (g.buyDate) {
      const buy: Lot = { date: g.buyDate, side: "buy", quantity: g.quantity, price: g.cost != null && g.quantity ? round(g.cost / g.quantity) : null, amount: g.cost, source };
      if (!cur.lots.some((l) => l.side === "buy" && l.date === buy.date && l.quantity === buy.quantity)) { cur.lots.push(buy); added.lots++; }
    }
  }
  return { holdings: [...map.values()], added, unmatched: [...unmatched].map(([isin, name]) => ({ isin, name })), duplicatesSkipped };
}
