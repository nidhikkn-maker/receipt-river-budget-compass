import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { todayISO } from "@/lib/use-position";
import { paymentReadiness, readinessSummary, READINESS_LABEL, type PaymentReadiness as Row } from "@/lib/readiness";
import { CheckCircle2, AlertTriangle, HelpCircle, Clock } from "lucide-react";

const ICON = { ready: CheckCircle2, shortfall: AlertTriangle, unknown: HelpCircle, overdue: Clock, paid: CheckCircle2 } as const;
const TONE = { ready: "text-primary", shortfall: "text-destructive", unknown: "text-muted-foreground", overdue: "text-destructive", paid: "text-primary" } as const;

/** Home strip: will the money be there for each upcoming payment? */
export function PaymentReadiness() {
  const { commitments, accounts, transactions } = useStore();
  const today = todayISO();
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => paymentReadiness({ commitments, accounts, transactions, today, horizonDays: 45 }), [commitments, accounts, transactions, today]);
  const s = readinessSummary(rows);
  if (!rows.length) return null;

  return (
    <section className="mb-5 rounded-3xl border bg-card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Payment readiness</h2>
        <span className="text-xs text-muted-foreground">
          {s.ready} ready{s.shortfall ? ` · ${s.shortfall} short by ${money(s.shortfallAmount)}` : ""}{s.overdue ? ` · ${s.overdue} overdue` : ""}{s.unknown ? ` · ${s.unknown} need info` : ""}
        </span>
      </div>
      <ul className="divide-y">
        {rows.slice(0, 8).map((r) => <ReadinessRow key={`${r.commitmentId}-${r.date}`} r={r} open={open === `${r.commitmentId}-${r.date}`} onToggle={() => setOpen(open === `${r.commitmentId}-${r.date}` ? null : `${r.commitmentId}-${r.date}`)} />)}
      </ul>
      {rows.length > 8 && <Link to="/plan" className="mt-2 block text-sm text-primary">See all {rows.length} on the Plan page</Link>}
    </section>
  );
}

function ReadinessRow({ r, open, onToggle }: { r: Row; open: boolean; onToggle: () => void }) {
  const Icon = ICON[r.status];
  return (
    <li>
      <button className="flex w-full items-center gap-3 py-2 text-left text-sm" onClick={onToggle} aria-expanded={open}>
        <Icon className={"h-4 w-4 shrink-0 " + TONE[r.status]} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{r.name}</span>
          <span className="text-xs text-muted-foreground">{r.date.slice(5)}{r.accountName ? ` · from ${r.accountName}` : ""} · {READINESS_LABEL[r.status]}</span>
        </span>
        <span className="shrink-0 font-mono font-semibold">{money(r.amount)}</span>
        {r.status === "shortfall" && <span className="shrink-0 font-mono text-xs font-semibold text-destructive">−{money(r.shortfall)}</span>}
      </button>
      {open && !!r.steps.length && (
        <div className="mb-2 ml-7 rounded-2xl bg-secondary/50 p-3">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">The calculation</p>
          <ul className="text-xs">
            {r.steps.map((s, i) => (
              <li key={i} className="flex justify-between gap-3 py-0.5">
                <span>{s.label}</span>
                <span className="font-mono">{s.amount < 0 ? "−" : ""}{money(Math.abs(s.amount))}</span>
              </li>
            ))}
          </ul>
          {r.status === "unknown" && <Link to="/plan" className="mt-1 block text-xs font-semibold text-primary">Choose the paying account on the Plan page</Link>}
        </div>
      )}
    </li>
  );
}
