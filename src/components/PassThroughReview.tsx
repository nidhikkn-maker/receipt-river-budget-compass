import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { correctionPreview } from "@/lib/financial-corrections";
import type { FinancialReview } from "@/lib/financial-review";
import { findPassThroughPairs, type PassPair } from "@/lib/pass-through";

/** Money received and sent straight on from one account. Choosing "transfer" routes both sides through a holding account you pick, so income and spending are not inflated. */
export function PassThroughReview() {
  const { transactions, accounts, correctFinancialEntries, undoFinancialCorrection } = useStore();
  const pairs = useMemo(() => findPassThroughPairs(transactions.map((t) => ({ id: t.id, date: t.date, amount: t.amount, currency: t.currency, accountId: t.accountId ?? null, txnType: t.txnType ?? "expense", title: t.title }))), [transactions]);
  const [via, setVia] = useState<Record<string, string>>({});
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const holding = accounts.filter((a) => !a.archived && ["savings", "current", "cash", "wallet"].includes(a.kind));
  const name = (id?: string | null) => accounts.find((a) => a.id === id)?.name ?? "—";
  const row = (id: string) => ({ transaction: transactions.find((t) => t.id === id)!, issues: [], group: "type", status: "Suggested Correction", confidence: "high", targetAccountIds: [], evidence: [] }) as unknown as FinancialReview;

  const apply = async (p: PassPair) => {
    const h = via[p.incoming.id];
    if (!h) { toast.error("Choose the holding account first."); return; }
    setBusy(true);
    const ops: string[] = [];
    try {
      const a = correctionPreview([row(p.incoming.id)], { txnType: "transfer", accountId: h, toAccountId: p.incoming.accountId ?? "" }, accounts, transactions);
      const b = correctionPreview([row(p.outgoing.id)], { txnType: "transfer", accountId: p.outgoing.accountId ?? "", toAccountId: h }, accounts, transactions);
      const i1 = crypto.randomUUID(); await correctFinancialEntries(a, i1); ops.push(i1);
      const i2 = crypto.randomUUID(); await correctFinancialEntries(b, i2); ops.push(i2);
      setDone((d) => ({ ...d, [p.incoming.id]: ops }));
      toast.success(`Recorded as a transfer through ${name(h)}: income and spending each drop by ${money(p.incoming.amount)}`);
    } catch (e) {
      for (const id of ops.reverse()) await undoFinancialCorrection(id).catch(() => undefined);
      toast.error(e instanceof Error ? e.message : "Nothing changed — try again.");
    } finally { setBusy(false); }
  };
  const undo = async (key: string) => {
    setBusy(true);
    try { for (const id of [...(done[key] ?? [])].reverse()) await undoFinancialCorrection(id); setDone((d) => { const n = { ...d }; delete n[key]; return n; }); toast.success("Original income and spending restored"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn’t undo — a later edit may block it."); }
    finally { setBusy(false); }
  };

  const open = pairs.filter((p) => !kept.has(p.incoming.id));
  return (
    <Card title={`Received and sent straight on (${open.length})`} className="mt-4">
      <p className="mb-2 text-sm text-muted-foreground">The same amount came in and went out of one account within 3 days. Decide whether it is really income and spending, or money passing through.</p>
      {open.length === 0 && Object.keys(done).length === 0 ? <p className="text-sm text-muted-foreground">Nothing to decide.</p> : (
        <ul className="divide-y">{pairs.map((p) => {
          const k = p.incoming.id;
          if (kept.has(k)) return null;
          return <li key={k} className="space-y-2 py-3 text-sm [overflow-wrap:anywhere]">
            <p className="font-medium">{name(p.incoming.accountId)} · {money(p.incoming.amount)}</p>
            <p>In {p.incoming.date}: {p.incoming.title}</p>
            <p>Out {p.outgoing.date}: {p.outgoing.title}</p>
            <p className="text-xs text-muted-foreground">As a transfer: income −{money(p.incoming.amount)}, spending −{money(p.incoming.amount)}, {name(p.incoming.accountId)} balance unchanged.</p>
            {done[k] ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void undo(k)}>Undo — keep as income and spending</Button> : <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Select value={via[k] ?? ""} onValueChange={(v) => setVia({ ...via, [k]: v })}><SelectTrigger className="min-h-11 w-full sm:w-72" aria-label="Holding account"><SelectValue placeholder="Holding account for the pass-through" /></SelectTrigger><SelectContent>{holding.filter((a) => a.id !== p.incoming.accountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
              <Button className="min-h-11" disabled={busy || !via[k]} onClick={() => void apply(p)}>Record as transfer</Button>
              <Button className="min-h-11" variant="ghost" onClick={() => setKept(new Set([...kept, k]))}>Keep as income and spending</Button>
            </div>}
          </li>;
        })}</ul>
      )}
    </Card>
  );
}
