import { Link } from "@tanstack/react-router";
import { money } from "@/lib/expenses";
import { useNetWorth } from "./useBooks";

/** Home net-worth summary [v6.1 §11]; never labelled live because bank, property and loans are record-based. */
export function NetWorthCard() {
  const nw = useNetWorth();
  return (
    <Link to="/wealth" className="mb-5 block rounded-2xl border bg-card p-4" aria-label="Open financial position">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net worth</span>
        <span className="text-[11px] text-muted-foreground">{nw.label}</span>
      </div>
      <p className="mt-1 font-mono text-2xl font-semibold">{money(nw.net)}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div><span className="block text-muted-foreground">Investments</span><b>{money(nw.portfolio)}</b>{nw.movement != null && <span className={`block ${nw.movement >= 0 ? "text-primary" : "text-destructive"}`}>{nw.movement >= 0 ? "+" : ""}{money(nw.movement)} since {nw.lastSnapshot}</span>}</div>
        <div><span className="block text-muted-foreground">Liquid</span><b>{money(nw.liquid)}</b></div>
        <div><span className="block text-muted-foreground">Owed</span><b>{money(nw.liabilities)}</b></div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Updated from records to {nw.recordsAsOf ?? "—"}{nw.pricesAsOf ? ` · share prices: closing ${nw.pricesAsOf}` : ""}{nw.dematMissing.length ? ` · ${nw.dematMissing.length} holding${nw.dematMissing.length > 1 ? "s" : ""} without a price` : ""}</p>
      {nw.quality.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{nw.quality.join(" · ")}</p>}
    </Link>
  );
}
