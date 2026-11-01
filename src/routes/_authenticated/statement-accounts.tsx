import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, CalendarClock } from "lucide-react";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { correctionPreview, type CorrectionPreview } from "@/lib/financial-corrections";
import type { FinancialReview } from "@/lib/financial-review";
import { statementCoverage } from "@/lib/statement-pipeline/coverage";

export const Route = createFileRoute("/_authenticated/statement-accounts")({
  head: () => ({
    meta: [
      { title: "Statement coverage · Ledgerline" },
      { name: "description", content: "See which statements are missing for each account, how current each one is, and move entries saved on the wrong account." },
      { property: "og:title", content: "Statement coverage · Ledgerline" },
      { property: "og:description", content: "Missing statements, account freshness and safe account moves in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatementAccountsPage,
});

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

function StatementAccountsPage() {
  const store = useStore();
  const { accounts, transactions } = store;
  const today = new Date().toISOString().slice(0, 10);
  const coverage = useMemo(() => statementCoverage(accounts, transactions, today), [accounts, transactions, today]);
  const live = accounts.filter((a) => !a.archived);

  const [from, setFrom] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const op = useRef("");

  const candidates = useMemo(() => {
    if (!from) return [];
    const q = query.trim().toLowerCase();
    return transactions
      .filter((t) => t.accountId === from && (!q || `${t.title} ${t.merchant ?? ""} ${t.originalAmount}`.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60);
  }, [from, query, transactions]);

  const prepare = () => {
    const rows = picked.map((id) => ({ transaction: transactions.find((t) => t.id === id)!, issues: [], group: "account", status: "Suggested Correction", confidence: 1, targetAccountIds: [to], evidence: ["Chosen by you"] })) as unknown as FinancialReview[];
    try {
      op.current = crypto.randomUUID();
      setPreview(correctionPreview(rows, { accountId: to }, accounts, transactions));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t prepare the move.");
    }
  };

  const confirm = async () => {
    if (!preview) return;
    const id = op.current;
    try {
      await store.correctFinancialEntries(preview, id);
      toast.success(`${preview.records.length} moved`, { action: { label: "Undo", onClick: () => void store.undoFinancialCorrection(id) } });
      setPreview(null);
      setPicked([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nothing moved — try again.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Statement coverage</h1>
        <p className="text-sm text-muted-foreground">A month is confirmed when a statement matched at least one of its entries. Upload missing ones on the <Link to="/statements" className="underline">Statement Desk</Link>.</p>
      </header>

      <section aria-label="Accounts" className="space-y-3">
        {!coverage.length && <Card className="p-4 text-sm">No account entries since April 2026 yet.</Card>}
        {coverage.map((c) => (
          <Card key={c.accountId} className="space-y-2 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="min-w-0 truncate font-medium">{c.name}</h2>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {c.latestStatementDate ? `Statement-confirmed to ${c.latestStatementDate} · ${c.daysBehind} days ago` : "No statement confirmed yet"}
              </span>
            </div>
            <ul className="flex flex-wrap gap-1" aria-label={`${c.name} months`}>
              {c.months.map((m) => (
                <li key={m.month} title={`${m.entries} entries`} className={`rounded-md px-2 py-0.5 text-xs ${m.state === "confirmed" ? "bg-primary/15 text-foreground" : m.state === "missing" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  {monthLabel(m.month)} · {m.state === "confirmed" ? "✓" : m.state === "missing" ? "missing" : "—"}
                </li>
              ))}
            </ul>
            {c.missingMonths.length > 0 && <p className="text-xs text-destructive">{c.missingMonths.length} month{c.missingMonths.length === 1 ? "" : "s"} with entries but no statement</p>}
          </Card>
        ))}
      </section>

      <Card className="space-y-3 p-3" aria-label="Move entries">
        <h2 className="flex items-center gap-2 font-medium"><ArrowRightLeft className="size-4" /> Move entries saved on the wrong account</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">From
            <select aria-label="From account" className="mt-1 w-full rounded-md border bg-background p-2" value={from} onChange={(e) => { setFrom(e.target.value); setPicked([]); setPreview(null); }}>
              <option value="">Choose…</option>
              {live.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="text-sm">To
            <select aria-label="To account" className="mt-1 w-full rounded-md border bg-background p-2" value={to} onChange={(e) => { setTo(e.target.value); setPreview(null); }}>
              <option value="">Choose…</option>
              {live.filter((a) => a.id !== from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        {from && <input aria-label="Search entries" placeholder="Search by name or amount" className="w-full rounded-md border bg-background p-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />}
        {from && (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {candidates.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => { setPreview(null); setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id))); }} />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{t.date}</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 tabular-nums">{money(t.originalAmount, t.currency)}</span>
                </label>
              </li>
            ))}
            {!candidates.length && <li className="text-sm text-muted-foreground">No entries found.</li>}
          </ul>
        )}
        <Button disabled={!picked.length || !to} onClick={prepare}>Preview move ({picked.length})</Button>
        <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
          <DialogContent aria-label="Move preview" className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Move {preview?.records.length} entr{preview?.records.length === 1 ? "y" : "ies"}?</DialogTitle>
              <DialogDescription>Statement matches on them are cleared so they can be re-checked. You can undo this.</DialogDescription>
            </DialogHeader>
            <ul className="divide-y rounded-xl border text-sm">{preview?.balanceChanges.map((b) => <li key={b.id} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 truncate">{b.name}</span><span className="shrink-0 font-mono">{b.change >= 0 ? "+" : ""}{money(b.change)}</span></li>)}</ul>
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={confirm}>Confirm move</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
