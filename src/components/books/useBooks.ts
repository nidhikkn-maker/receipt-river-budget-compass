import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { emptyBooks, type BooksData } from "@/lib/books/types";
import { netWorth } from "@/lib/ledger";
import { shareValue } from "@/lib/assets";
import { fyOf } from "@/lib/entities";
import { dynamicNetWorth, valueHolding } from "@/lib/books/market";
import { propertyValue } from "@/lib/books/property";
import { loadDemat, type DematWithHoldings } from "@/lib/investments/holdings-store";

/** Books data with a single-write updater (owner preferences). */
export function useBooks() {
  const { preferences, savePreferences } = useStore();
  const books = preferences.books ?? emptyBooks();
  const save = (patch: Partial<BooksData>) => savePreferences({ ...preferences, books: { ...books, ...patch } });
  return { books, save, preferences, savePreferences };
}

let dematCache: DematWithHoldings[] | null = null;
export function useDemat() {
  const [d, setD] = useState<DematWithHoldings[] | null>(dematCache);
  useEffect(() => { let live = true; loadDemat().then((x) => { dematCache = x; if (live) setD(x); }).catch(() => { if (live) setD([]); }); return () => { live = false; }; }, []);
  return d;
}

/** Ownership-aware dynamic net worth with freshness per component [v6.1 §9–11]. */
export function useNetWorth() {
  const { accounts, transactions, valuations, loans } = useStore();
  const { books } = useBooks();
  const { preferences } = useStore();
  const demat = useDemat();
  return useMemo(() => {
    const live = accounts.filter((a) => !a.archived);
    const raw = netWorth(live, transactions, valuations);
    const loanOwed = loans.filter((l) => !l.accountId && l.status !== "closed").reduce((s, l) => s + l.principal, 0);
    const now = new Date();
    const valued = books.holdings.map((h) => valueHolding(h, books.quotes, books.goldRate, now, books.alerts));
    const dematValue = (demat ?? []).flatMap((x) => x.holdings).reduce((s, h) => s + (h.statementValue ?? 0), 0);
    const dematDate = (demat ?? []).flatMap((x) => x.holdings).map((h) => h.asOf ?? "").sort().pop();
    const fy = fyOf(now.toISOString().slice(0, 10));
    const assets = preferences.assets ?? [];
    // Property counted once: a property's own valuation, else its linked asset; unlinked assets counted separately.
    const linked = new Set(books.properties.map((p) => p.assetId).filter(Boolean));
    const propVal = books.properties.reduce((s, p) => { const a = assets.find((x) => x.id === p.assetId); return s + (propertyValue(p, a ? shareValue(a, fy) : null).value ?? 0); }, 0)
      + assets.filter((a) => !a.soldOn && !linked.has(a.id)).reduce((s, a) => s + shareValue(a, fy), 0);
    const nw = dynamicNetWorth({
      bank: raw.assets, bankBasis: "account balances from recorded and reconciled entries",
      investments: valued, demat: dematValue, dematBasis: dematValue ? `demat at statement value${dematDate ? ` (${dematDate})` : ""}` : "",
      otherAssets: 0, property: Math.round(propVal), propertyBasis: books.properties.some((p) => p.valuation) ? "latest dated valuation or book value" : "book value from asset register",
      liabilities: raw.liabilities + loanOwed, liabilitiesBasis: "latest loan and card balances on record",
    });
    const portfolio = nw.assets.find((a) => a.label === "Investments")!.value;
    const last = books.snapshots.at(-1);
    return { ...nw, valued, portfolio, liquid: raw.assets, movement: last ? Math.round(portfolio - last.portfolio) : null, lastSnapshot: last?.date ?? null, demat };
  }, [accounts, transactions, valuations, loans, books, demat, preferences.assets]);
}
