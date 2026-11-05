/** v6.1 holdings beyond demat, prices with their real freshness, gold, alerts and dated snapshots. */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fold } from "@/components/Fold";
import { money } from "@/lib/expenses";
import { getFundNav } from "@/lib/mutual-funds.functions";
import { addSnapshot, FRESHNESS_LABEL, quantityByIsin, quoteKey, recordFailure, upsertQuote, valuationAlerts } from "@/lib/books/market";
import type { Holding, HoldingKind } from "@/lib/books/types";
import { useBooks, useNetWorth } from "./useBooks";

const KIND: Record<HoldingKind, string> = { mutual_fund: "Mutual fund", etf: "ETF", gold_etf: "Gold ETF", sgb: "Sovereign Gold Bond", physical_gold: "Physical gold", bond: "Bond", other: "Other" };
const blank = (): Holding => ({ id: crypto.randomUUID(), kind: "mutual_fund", name: "", quantity: 0, sharePct: 100, source: "entered by you" });

export function MarketPanel() {
  const { books, save } = useBooks();
  const nw = useNetWorth();
  const nav = useServerFn(getFundNav);
  const [edit, setEdit] = useState<Holding | null>(null);
  const [price, setPrice] = useState<Record<string, string>>({});
  const [gold, setGold] = useState(books.goldRate ? String(books.goldRate.perGram24k) : "");
  // Your own entries for a security are compared with the demat total across every account [v6.1 §4, §13].
  const statementQty = quantityByIsin(nw.demat ?? []);
  const alerts = valuationAlerts(nw.valued, books.snapshots, books.alerts, statementQty, books.holdings, [], nw.dematMissing);

  const refreshNavs = async () => {
    let quotes = books.quotes; let ok = 0, bad = 0;
    for (const h of books.holdings.filter((x) => x.kind === "mutual_fund" && x.schemeCode)) {
      const key = quoteKey(h)!; const at = new Date().toISOString();
      const r = await nav({ data: { schemeCode: h.schemeCode! } }).catch(() => ({ ok: false as const, error: "" }));
      if (r.ok) { quotes = upsertQuote(quotes, { key, price: r.quote.nav, at: r.quote.date, provider: "AMFI via mfapi.in", freshness: "nav", refreshedAt: at }); ok++; }
      else { quotes = recordFailure(quotes, key, at); bad++; }
    }
    await save({ quotes });
    toast[bad ? "message" : "success"](`${ok} NAV${ok === 1 ? "" : "s"} refreshed${bad ? ` · ${bad} failed — previous values kept and marked stale` : ""}`);
  };
  const setManual = async (h: Holding) => {
    const key = quoteKey(h); const v = Number(price[h.id]);
    if (!key || !(v > 0)) { toast.error("Enter a price above zero"); return; }
    const at = new Date().toISOString();
    await save({ quotes: upsertQuote(books.quotes, { key, price: v, at, provider: "entered by you", freshness: "manual", refreshedAt: at }) });
    setPrice({ ...price, [h.id]: "" });
  };
  const snapshot = async () => {
    const allocation: Record<string, number> = {};
    for (const v of nw.valued) if (v.value) allocation[KIND[v.holding.kind]] = (allocation[KIND[v.holding.kind]] ?? 0) + v.value;
    await save({ snapshots: addSnapshot(books.snapshots, { date: new Date().toISOString().slice(0, 10), netWorth: nw.net, portfolio: nw.portfolio, liquid: nw.liquid, liabilities: nw.liabilities, allocation, invested: Math.round(books.holdings.reduce((s, h) => s + (h.costBasis ?? 0) * (h.sharePct / 100), 0)), demat: Math.round(nw.dematRows.reduce((s, h) => s + (h.value ?? 0), 0)), dematCount: nw.dematRows.length, flows: nw.flowsSinceSnapshot, pricesAsOf: nw.pricesAsOf }) });
    toast.success("Today's valuation saved — no entries were created");
  };

  return (
    <Fold id="investments" title="Investments & net worth" hint={`${books.holdings.length} holdings · ${nw.quality.length ? nw.quality[0] : "values as of latest records"}`}>
      <div className="space-y-3 text-sm">
        <div className="divide-y rounded-xl border">
          {nw.assets.map((a) => <div key={a.label} className="flex justify-between gap-2 px-3 py-2"><span>{a.label}<span className="block text-[11px] text-muted-foreground">{a.basis || "—"}{a.asOf ? ` · as of ${a.asOf}` : ""}</span></span><b className="font-mono">{money(a.value)}</b></div>)}
          <div className="flex justify-between px-3 py-2"><span>Liabilities<span className="block text-[11px] text-muted-foreground">{nw.liabilitiesBasis}{nw.liabilitiesAsOf ? ` · as of ${nw.liabilitiesAsOf}` : ""}</span></span><b className="font-mono">−{money(nw.liabilities)}</b></div>
          <div className="flex justify-between px-3 py-2 font-semibold"><span>Net worth · {nw.label}</span><span className="font-mono">{money(nw.net)}</span></div>
        </div>
        {nw.duplicates.length > 0 && <p className="rounded-xl bg-secondary p-2 text-xs">Counted once from your demat statement: {nw.duplicates.join(", ")}</p>}
        <p className="text-[11px] text-muted-foreground">Closing prices: {nw.closeJob?.lastSuccess ? `last saved ${nw.closeJob.lastSuccess.slice(0, 16).replace("T", " ")} UTC` : "not fetched yet"}{nw.closeJob?.status === "failed" ? ` · last attempt failed (${nw.closeJob.reason ?? "unknown"}) — earlier prices kept` : ""}</p>
        {nw.dematRows.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Demat holdings ({nw.dematRows.length})</summary>
          <div className="mt-1 divide-y">{nw.dematRows.map((h) => <div key={h.id} className="flex justify-between gap-2 py-1"><span className="min-w-0 truncate">{h.name}<span className="block text-muted-foreground">{h.quantity} · {h.basis}</span></span><b className="font-mono">{h.value == null ? "no price" : money(h.value)}</b></div>)}</div></details>}
        {alerts.length > 0 && <ul className="space-y-1 rounded-xl bg-secondary p-3 text-xs">{alerts.map((a) => <li key={a}>{a}</li>)}</ul>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEdit(blank())}>Add holding</Button>
          <Button size="sm" variant="outline" onClick={refreshNavs} disabled={!books.holdings.some((h) => h.schemeCode)}>Refresh NAVs</Button>
          <Button size="sm" variant="outline" onClick={snapshot}>Save today's valuation</Button>
          <Link to="/statements" search={{ context: "investments" }} className="inline-flex items-center rounded-md px-3 text-sm font-medium text-primary underline">Upload statement</Link>
        </div>
        {edit && <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
          <select aria-label="Holding type" className="col-span-2 rounded-md border bg-background px-2 py-2" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as HoldingKind })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <Input aria-label="Name" className="col-span-2" placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          {edit.kind === "physical_gold" ? <>
            <Input aria-label="Grams" type="number" placeholder="Grams" value={edit.grams ?? ""} onChange={(e) => setEdit({ ...edit, grams: Number(e.target.value) || undefined, quantity: 1 })} />
            <Input aria-label="Karat" type="number" placeholder="Karat (22)" value={edit.karat ?? ""} onChange={(e) => setEdit({ ...edit, karat: Number(e.target.value) || undefined })} />
          </> : <>
            <Input aria-label="Quantity or units" type="number" placeholder="Units" value={edit.quantity || ""} onChange={(e) => setEdit({ ...edit, quantity: Number(e.target.value) || 0 })} />
            {edit.kind === "mutual_fund" ? <Input aria-label="AMFI scheme code" placeholder="AMFI code" value={edit.schemeCode ?? ""} onChange={(e) => setEdit({ ...edit, schemeCode: e.target.value.trim() || undefined })} />
              : <Input aria-label="ISIN" placeholder="ISIN" value={edit.isin ?? ""} onChange={(e) => setEdit({ ...edit, isin: e.target.value.toUpperCase().trim() || undefined })} />}
          </>}
          <Input aria-label="Cost basis" type="number" placeholder="Cost (if evidenced)" value={edit.costBasis ?? ""} onChange={(e) => setEdit({ ...edit, costBasis: Number(e.target.value) || undefined })} />
          <Input aria-label="Ownership share percent" type="number" placeholder="Share %" value={edit.sharePct} onChange={(e) => setEdit({ ...edit, sharePct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
          <div className="col-span-2 flex gap-2">
            <Button size="sm" disabled={!edit.name.trim() || !(edit.quantity > 0)} onClick={async () => {
              const k = quoteKey(edit);
              if (k && books.holdings.some((h) => h.id !== edit.id && quoteKey(h) === k)) { toast.error("This security is already listed — edit that one instead"); return; }
              await save({ holdings: books.holdings.some((h) => h.id === edit.id) ? books.holdings.map((h) => (h.id === edit.id ? edit : h)) : [...books.holdings, edit] }); setEdit(null);
            }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </div>}
        {nw.valued.map((v) => <div key={v.holding.id} className="rounded-xl border p-3">
          <div className="flex justify-between gap-2"><span className="min-w-0"><b className="block truncate">{v.holding.name}</b><span className="text-[11px] text-muted-foreground">{KIND[v.holding.kind]} · {v.holding.kind === "physical_gold" ? `${v.holding.grams ?? "?"} g` : `${v.holding.quantity} units`}{v.holding.sharePct !== 100 ? ` · ${v.holding.sharePct}% yours` : ""}</span></span>
            <span className="text-right"><b className="font-mono">{v.value == null ? "—" : money(v.value)}</b><span className={`block text-[11px] ${v.stale ? "text-destructive" : "text-muted-foreground"}`}>{v.stale ? "Stale · " : ""}{v.note}</span></span></div>
          {v.quote && <p className="mt-1 text-[11px] text-muted-foreground">{FRESHNESS_LABEL[v.quote.freshness]} price {v.quote.price} as of {v.quote.at.slice(0, 16).replace("T", " ")} · refreshed {v.quote.refreshedAt.slice(0, 10)}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {v.holding.kind !== "physical_gold" && v.holding.kind !== "mutual_fund" && <><Input aria-label={`Price for ${v.holding.name}`} className="h-8 w-28" type="number" placeholder="Price" value={price[v.holding.id] ?? ""} onChange={(e) => setPrice({ ...price, [v.holding.id]: e.target.value })} /><Button size="sm" variant="outline" onClick={() => setManual(v.holding)}>Set price</Button></>}
            <Button size="sm" variant="ghost" onClick={() => setEdit(v.holding)}>Edit</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => save({ holdings: books.holdings.filter((h) => h.id !== v.holding.id) })}>Remove</Button>
          </div>
        </div>)}
        <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
          <label className="text-xs">Physical gold rate per gram (24k)<Input type="number" value={gold} onChange={(e) => setGold(e.target.value)} /></label>
          <Button size="sm" variant="outline" onClick={async () => { const v = Number(gold); if (!(v > 0)) return; await save({ goldRate: { perGram24k: v, date: new Date().toISOString().slice(0, 10), source: "entered by you" } }); toast.success("Gold rate saved"); }}>Save rate</Button>
          <p className="w-full text-[11px] text-muted-foreground">Physical gold uses this rate × weight × purity. Gold ETF and SGB prices are never used for jewellery or coins.</p>
        </div>
        <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Alert settings</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label>Portfolio move %<Input type="number" value={books.alerts.portfolioMovePct} onChange={(e) => save({ alerts: { ...books.alerts, portfolioMovePct: Number(e.target.value) || 0 } })} /></label>
            <label>NAV stale after days<Input type="number" value={books.alerts.staleNavDays} onChange={(e) => save({ alerts: { ...books.alerts, staleNavDays: Number(e.target.value) || 1 } })} /></label>
            <label>Value vs cost alert %<Input type="number" value={books.alerts.unusualValuationPct} onChange={(e) => save({ alerts: { ...books.alerts, unusualValuationPct: Number(e.target.value) || 0 } })} /></label>
            {(["missingPrices", "quantityMismatch", "corporateActions"] as const).map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={books.alerts[k]} onChange={(e) => save({ alerts: { ...books.alerts, [k]: e.target.checked } })} />{k === "missingPrices" ? "Missing prices" : k === "quantityMismatch" ? "Quantity differences" : "Corporate actions"}</label>)}
          </div></details>
        {books.snapshots.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Valuation history ({books.snapshots.length})</summary>
          <table className="mt-2 w-full"><thead><tr className="text-muted-foreground"><th className="text-left">Date</th><th className="text-right">Portfolio</th><th className="text-right">Net worth</th></tr></thead>
            <tbody>{books.snapshots.slice(-24).reverse().map((s) => <tr key={s.date}><td>{s.date}</td><td className="text-right">{money(s.portfolio)}</td><td className="text-right">{money(s.netWorth)}</td></tr>)}</tbody></table></details>}
        <p className="text-[11px] text-muted-foreground">Mutual fund NAVs come from AMFI (published daily). NSE/BSE shares use the official end-of-day closing price saved each weekday evening (never live); without one they show the statement value or a price you enter, labelled as such. No prices are invented and trades are never placed.</p>
      </div>
    </Fold>
  );
}
