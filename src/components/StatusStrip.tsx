import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { healthScore } from "@/lib/health";
import { freshnessSummary, inboxCounts, inboxItems } from "@/lib/inbox";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/use-position";

/** Compact Home strip: inbox count, financial data status and health score. */
export function StatusStrip() {
  const { transactions, accounts, commitments, preferences, pendingCount, budgets, loans } = useStore();
  const today = todayISO();
  const v = useMemo(() => {
    const c = inboxCounts(inboxItems({ transactions, accounts, commitments, prefs: preferences, today, pendingCount }), preferences.inboxDismissed);
    const f = freshnessSummary(accounts, transactions, preferences, today);
    const h = healthScore({ accounts, transactions, commitments, emis: loans.filter((l) => l.status !== "closed").reduce((s, l) => s + l.emi, 0), budgets: budgets as Record<string, number>, asOf: today });
    return { c, f, h };
  }, [transactions, accounts, commitments, preferences, pendingCount, budgets, loans, today]);
  const tile = "rounded-2xl border p-3 transition hover:border-gold";
  return (
    <div className="mb-5 grid grid-cols-3 gap-2">
      <Link to="/inbox" className={tile}><div className="text-xs font-medium text-muted-foreground">Inbox</div><div className="font-mono text-xl font-bold">{v.c.pending}</div><div className="text-xs">{v.c.high ? <span className="font-semibold text-destructive">{v.c.high} high priority</span> : "to review"}</div></Link>
      <Link to="/inbox" className={tile}><div className="text-xs font-medium text-muted-foreground">Data status</div><div className="font-mono text-xl font-bold">{v.f.current}/{v.f.total}</div><div className={v.f.lowConfidence ? "text-xs font-semibold text-destructive" : "text-xs"}>{v.f.lowConfidence ? "outdated accounts" : "accounts verified"}</div></Link>
      <Link to="/review" className={tile}><div className="text-xs font-medium text-muted-foreground">Health score</div><div className="font-mono text-xl font-bold text-gold-strong">{v.h.score ?? "—"}</div><div className="text-xs">{v.h.score == null ? "needs more data" : "out of 100"}</div></Link>
    </div>
  );
}
