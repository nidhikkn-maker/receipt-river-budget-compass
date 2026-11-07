import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeness, netQuantity } from "@/lib/investments/demat";
import { loadDemat, type DematWithHoldings } from "@/lib/investments/holdings-store";

/** Demat holdings with their completeness status. Statement values are dated figures, not live prices. */
export function DematHoldings() {
  const [rows, setRows] = useState<DematWithHoldings[] | null>(null);
  useEffect(() => { loadDemat().then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return null;
  return (
    <section className="mb-6 rounded-3xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Demat holdings</h2>
        <Button asChild variant="outline" size="sm"><Link to="/statements" search={{ context: 'investments' }}><Upload className="h-4 w-4" />Upload</Link></Button>
      </div>
      {!rows.length && <p className="mt-2 text-sm text-muted-foreground">Upload your demat holding statement on Statement Desk to see holdings here.</p>}
      {rows.map((d) => {
        const c = completeness({ dpId: d.dpId, clientId: d.clientId, holdings: d.holdings, stored: true });
        return (
          <div key={d.id} className="mt-3">
            <p className="text-sm text-muted-foreground">{d.broker || "Demat"} {d.clientId || d.dpId} · {d.holdings.length} securities · purchase history {c.purchaseHistory === "ok" ? "complete" : `missing for ${c.missingHistory.length}`} · capital gains {c.capitalGains === "ok" ? "verified" : "pending verification"}</p>
            <ul className="mt-2 divide-y divide-border text-sm">
              {d.holdings.map((h) => (
                <li key={h.isin} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{h.name || h.isin}<span className="ml-2 text-xs text-muted-foreground">{h.isin}</span></span>
                  <span className="shrink-0 text-right tabular-nums">{h.quantity}<span className="block text-xs text-muted-foreground">{h.lots.some((l) => l.side === "buy") && Math.abs(netQuantity(h.lots) - h.quantity) < 1e-6 ? "history complete" : "history missing"}</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Portfolio valuation: price data required. Live prices need an approved price provider.</p>
          </div>
        );
      })}
    </section>
  );
}
