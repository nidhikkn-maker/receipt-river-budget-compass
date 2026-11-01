import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card, Row } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { cardLedger } from "@/lib/card-balance";

export const Route = createFileRoute("/_authenticated/cards/$accountId")({
  head: () => ({
    meta: [
      { title: "Card balance · Ledgerline" },
      { name: "description", content: "How spends and payments change what you owe on a credit card, with unreconciled payments flagged." },
      { property: "og:title", content: "Card balance · Ledgerline" },
      { property: "og:description", content: "Running credit-card outstanding with payment reconciliation status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CardBalancePage,
});

function CardBalancePage() {
  const { accountId } = Route.useParams();
  const { accounts, transactions } = useStore();
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [month, setMonth] = useState("");
  const card = accounts.find((a) => a.id === accountId && a.kind === "credit_card");
  const r = useMemo(() => (card ? cardLedger(card, transactions) : null), [card, transactions]);
  if (!card || !r) return <Card title="Card not found"><p className="text-sm text-muted-foreground">This credit card isn’t in your accounts.</p></Card>;
  const name = (id?: string | null) => accounts.find((a) => a.id === id)?.name ?? "Paying account missing";
  const lines = r.lines.filter((l) => (!onlyFlagged || l.issue) && (!month || l.txn.date.startsWith(month)));
  const months = [...new Set(r.lines.map((l) => l.txn.date.slice(0, 7)))];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Button asChild variant="ghost" size="sm"><Link to="/wealth"><ArrowLeft className="mr-1 h-4 w-4" />Accounts</Link></Button>
      <h1 className="mt-2 break-words font-display text-2xl font-bold tracking-tight sm:text-3xl">{card.name}</h1>
      <p className="text-sm text-muted-foreground">Card balance — what you owe and how payments reduce it</p>

      <Card title="Outstanding" className="mt-4">
        <div className="my-1 break-words font-display text-2xl font-bold sm:text-3xl">{money(r.outstanding)}</div>
        <Row label="Opening amount owed" value={money(r.opening)} />
        <Row label="Spends" value={money(r.spends)} />
        <Row label="Payments" value={`− ${money(r.payments)}`} />
        <Row label="Refunds" value={`− ${money(r.refunds)}`} />
        {r.limitUsed != null && <Row label="Credit limit used" value={`${r.limitUsed}%`} />}
      </Card>

      {r.unreconciled.count > 0 ? (
        <Button variant="outline" onClick={() => setOnlyFlagged((v) => !v)} className="mt-4 flex h-auto w-full flex-wrap items-center gap-2 border-destructive/40 bg-destructive/5 p-3 text-left text-sm whitespace-normal">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1"><strong>{r.unreconciled.count} unreconciled payment{r.unreconciled.count > 1 ? "s" : ""}</strong> · {money(r.unreconciled.total)}</span>
          <span className="shrink-0 text-xs underline">{onlyFlagged ? "Show all" : "Show only these"}</span>
        </Button>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" />{r.payments?'All recorded payments have a review confirmation; card-side matching is separate.':'No recorded card payments.'}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select aria-label="Month" className="h-10 w-full rounded-lg sm:w-auto border bg-background px-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All months</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <ul className="mt-3 divide-y rounded-2xl border bg-card">
        {lines.length === 0 && <li className="p-4 text-sm text-muted-foreground">No entries here.</li>}
        {lines.map((l) => (
          <li key={l.txn.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <div className="truncate font-medium">{l.txn.merchant || l.txn.title || (l.kind === "payment" ? "Card payment" : "Entry")}</div>
              <div className="text-xs text-muted-foreground">
                {l.txn.date} · {l.kind === "payment" ? `Payment from ${name(l.txn.accountId)}` : l.kind === "refund" ? "Refund" : l.kind === "spend" ? "Spend" : "Other"}
                {l.kind === "payment" && <span className={"ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold " + (l.issue ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>{l.issue ? "Unreconciled" : "Reconciled"}</span>}
              </div>
              {l.issue && <div className="text-xs text-destructive">{l.issue}</div>}
            </div>
            <div className="text-right">
              <div className="whitespace-nowrap font-mono text-sm font-semibold">{l.change > 0 ? "+" : "−"} {money(Math.abs(l.change))}</div>
              <div className="whitespace-nowrap text-[11px] text-muted-foreground">owed {money(l.balanceAfter)}</div>
            </div>
            {l.issue && <Button asChild size="sm" variant="outline" className="col-span-2 w-full md:col-span-1 md:w-auto"><Link to="/new" search={{ edit: l.txn.id }}>Review</Link></Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
