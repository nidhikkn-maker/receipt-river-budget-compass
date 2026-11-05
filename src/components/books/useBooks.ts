import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { emptyBooks, type BooksData } from "@/lib/books/types";
import { accountValue, isLiability } from "@/lib/ledger";
import { shareValue } from "@/lib/assets";
import { fyOf } from "@/lib/entities";
import { dynamicNetWorth, valueHolding } from "@/lib/books/market";
import { propertyValue } from "@/lib/books/property";
import { loadDemat, type DematWithHoldings } from "@/lib/investments/holdings-store";
import { supabase } from "@/integrations/supabase/client";
import { latestByIsin } from "@/lib/market/bhavcopy";
import type { Quote } from "@/lib/books/types";

/** Books data with a single-write updater (owner preferences). */
export function useBooks() {
  const { preferences, savePreferences } = useStore();
  const books = preferences.books ?? emptyBooks();
  const save = (patch: Partial<BooksData>) => savePreferences({ ...preferences, books: { ...books, ...patch } });
  return { books, save, preferences, savePreferences };
}

/** Demat holdings, cached per signed-in owner so a different account never sees another's copy. */
let dematCache: { owner: string; data: DematWithHoldings[] } | null = null;
export function useDemat() {
  const { userId: owner } = useStore();
  const [d, setD] = useState<DematWithHoldings[] | null>(dematCache && dematCache.owner === owner ? dematCache.data : null);
  useEffect(() => {
    let live = true;
    if (!(dematCache && dematCache.owner === owner)) setD(null);
    loadDemat().then((x) => { dematCache = { owner, data: x }; if (live) setD(x); }).catch(() => { if (live) setD([]); });
    return () => { live = false; };
  }, [owner]);
  return d;
}

export interface ClosingPrices { byIsin: Map<string, { exchange: string; close: number; date: string; symbol: string }>; job: { status: string; lastSuccess: string | null; reason: string | null } | null }
/** Official NSE/BSE end-of-day closes saved by the evening job, for the ISINs the owner holds [v6.1 §2–5]. */
export function useClosingPrices(isins: string[]): ClosingPrices {
  const key = [...new Set(isins.filter((i) => /^IN[A-Z0-9]{10}$/.test(i)))].sort().join(",");
  const [v, setV] = useState<ClosingPrices>({ byIsin: new Map(), job: null });
  useEffect(() => {
    let live = true;
    void (async () => {
      const list = key ? key.split(",") : [];
      const [q, j] = await Promise.all([
        list.length ? supabase.from("market_quotes").select("exchange,isin,close,price_date,symbol").in("isin", list).order("price_date", { ascending: false }).limit(list.length * 6) : Promise.resolve({ data: [] as never[] }),
        supabase.from("job_state").select("status,last_success,reason").eq("name", "closing-prices").maybeSingle(),
      ]);
      if (!live) return;
      setV({ byIsin: latestByIsin((q.data ?? []) as { exchange: string; isin: string | null; close: number; price_date: string; symbol: string }[]), job: j.data ? { status: j.data.status, lastSuccess: j.data.last_success, reason: j.data.reason } : null });
    })().catch(() => undefined);
    return () => { live = false; };
  }, [key]);
  return v;
}
/** Closing price as a quote for the valuation rules; end-of-day, never live. */
export const closeQuote = (isin: string, c: { exchange: string; close: number; date: string }): Quote => ({ key: `isin:${isin}`, price: c.close, at: `${c.date}T10:00:00.000Z` /* 15:30 IST market close */, provider: `${c.exchange} official closing price`, freshness: "eod", refreshedAt: `${c.date}T13:30:00.000Z` });

/** Ownership-aware dynamic net worth with freshness per component [v6.1 §9–11]. */
export function useNetWorth() {
  const { accounts, transactions, valuations, loans } = useStore();
  const { books } = useBooks();
  const { preferences } = useStore();
  const demat = useDemat();
  const dematHoldings = (demat ?? []).flatMap((x) => x.holdings);
  const closes = useClosingPrices([...books.holdings.map((h) => h.isin ?? ""), ...dematHoldings.map((h) => h.isin)]);
  return useMemo(() => {
    const live = accounts.filter((a) => !a.archived);
    // Each ledger account is counted in exactly one component [v6.1 §9]: accounts that carry a registered
    // asset are valued through the asset/property register, investment accounts under investments.
    const assetLinked = new Set((preferences.assets ?? []).map((a) => a.accountId).filter(Boolean));
    const raw = { assets: 0, investments: 0, other: 0, liabilities: 0 };
    for (const a of live) {
      if (assetLinked.has(a.id)) continue;
      const v = accountValue(a, transactions, valuations).value;
      if (isLiability(a.kind)) raw.liabilities += v; else if (a.kind === "investment" || a.kind === "fixed_deposit") raw.investments += v; else if (a.kind === "other_asset") raw.other += v; else raw.assets += v;
    }
    const loanOwed = loans.filter((l) => !l.accountId && l.status !== "closed").reduce((s, l) => s + l.principal, 0);
    const now = new Date();
    // Canonical holdings: a security in a demat statement is counted once from the demat; a manual
    // holding with the same ISIN is shown but not added again [v6.1 §4, §9].
    const dematIsins = new Set(dematHoldings.map((h) => h.isin));
    let quotes = books.quotes;
    for (const [isin, c] of closes.byIsin) { const q = closeQuote(isin, c); const prev = quotes.find((x) => x.key === q.key); if (!prev || prev.at < q.at) quotes = [...quotes.filter((x) => x.key !== q.key), q]; }
    const valued = books.holdings.filter((h) => !(h.isin && dematIsins.has(h.isin))).map((h) => valueHolding(h, quotes, books.goldRate, now, books.alerts));
    const duplicates = books.holdings.filter((h) => h.isin && dematIsins.has(h.isin)).map((h) => h.name);
    let closeCount = 0;
    const dematRows = dematHoldings.map((h) => { const c = closes.byIsin.get(h.isin); if (c && h.quantity > 0) { closeCount++; return { ...h, value: Math.round(h.quantity * c.close * 100) / 100, basis: `${c.exchange} close ${c.date}` }; } return { ...h, value: h.statementValue ?? null, basis: h.statementValue != null ? `statement ${h.asOf ?? ""}`.trim() : "no price" }; });
    // A missing price stays missing — never counted as zero [v6.1 §6, §15].
    const dematValue = dematRows.reduce((s, h) => s + (h.value ?? 0), 0);
    const dematMissing = dematRows.filter((h) => h.value == null).map((h) => h.name ?? h.isin);
    const dematDate = dematHoldings.map((h) => h.asOf ?? "").sort().pop();
    const closeDate = [...closes.byIsin.values()].map((c) => c.date).sort().pop();
    const fy = fyOf(now.toISOString().slice(0, 10));
    const assets = preferences.assets ?? [];
    // Property counted once: a property's own valuation, else its linked asset; unlinked assets counted separately.
    const linked = new Set(books.properties.map((p) => p.assetId).filter(Boolean));
    const propVal = books.properties.reduce((s, p) => { const a = assets.find((x) => x.id === p.assetId); return s + (propertyValue(p, a ? shareValue(a, fy) : null).value ?? 0); }, 0)
      + assets.filter((a) => !a.soldOn && !linked.has(a.id)).reduce((s, a) => s + shareValue(a, fy), 0);
    const nw = dynamicNetWorth({
      bank: Math.round(raw.assets * 100) / 100, bankBasis: "bank, cash and wallet balances from recorded entries",
      investments: valued, demat: Math.round((dematValue + raw.investments) * 100) / 100, dematBasis: dematRows.length ? [closeCount && `${closeCount}/${dematRows.length} demat at official closing price${closeDate ? ` (${closeDate})` : ""}`, closeCount < dematRows.length && `others at statement value${dematDate ? ` (${dematDate})` : ""}`, raw.investments > 0 && "investment & deposit accounts at their latest recorded value"].filter(Boolean).join(" · ") : raw.investments > 0 ? "investment & deposit accounts at their latest recorded value" : "",
      otherAssets: Math.round(raw.other * 100) / 100, property: Math.round(propVal), propertyBasis: books.properties.some((p) => p.valuation) ? "latest dated valuation or book value" : "book value from asset register",
      liabilities: raw.liabilities + loanOwed, liabilitiesBasis: "latest loan and card balances on record",
    });
    const portfolio = nw.assets.find((a) => a.label === "Investments")!.value;
    const last = books.snapshots.at(-1);
    // Market movement excludes money you put in or took out since the last snapshot [v6.1 §12].
    const flows = last ? transactions.filter((t) => t.txnType === "investment" && t.date > last.date).reduce((s, t) => s + t.amount, 0) : 0;
    return { ...nw, valued, portfolio, liquid: raw.assets, movement: last ? Math.round(portfolio - last.portfolio - flows) : null, flowsSinceSnapshot: Math.round(flows), lastSnapshot: last?.date ?? null, demat, dematRows, dematMissing, duplicates, closeJob: closes.job, pricesAsOf: closeDate ?? null, recordsAsOf: transactions.reduce((m, t) => (t.date > m ? t.date : m), "") || null };
  }, [accounts, transactions, valuations, loans, books, demat, preferences.assets, closes]); // eslint-disable-line react-hooks/exhaustive-deps
}
