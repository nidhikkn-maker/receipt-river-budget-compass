import { InboxWork } from "@/components/InboxWork";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, type Expense } from "@/lib/expenses";
import { FRESHNESS_LABEL, INBOX_LABEL, discrepancy, freshnessSummary, inboxCounts, inboxItems, type Freshness, type InboxItem } from "@/lib/inbox";
import { AGE_BUCKETS, REIMB_STAGE_LABEL, isTracked, outstandingOf, reimbursementSummary, stageOf } from "@/lib/reimbursements";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/use-position";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Financial inbox — Ledgerline" },
      { name: "description", content: "Everything that needs your attention: duplicates, unverified imports, stale accounts and pending reimbursements." },
      { property: "og:title", content: "Financial inbox — Ledgerline" },
      { property: "og:description", content: "Everything that needs your attention in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Inbox,
});

const PRIORITY_TONE = { high: "bg-destructive/10 text-destructive", medium: "bg-gold-soft text-gold-strong", low: "bg-muted text-muted-foreground" } as const;
const FRESH_TONE: Record<Freshness, string> = { current: "bg-success/15 text-success", needs_review: "bg-gold-soft text-gold-strong", outdated: "bg-destructive/10 text-destructive" };

function Inbox() {
  const store = useStore();
  const { transactions, expenses, accounts, commitments, preferences, savePreferences, pendingCount, reconcile } = store;
  const today = todayISO();
  const [open, setOpen] = useState<Expense | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const all = useMemo(() => inboxItems({ transactions, accounts, commitments, prefs: preferences, today, pendingCount }), [transactions, accounts, commitments, preferences, today, pendingCount]);
  const counts = inboxCounts(all, preferences.inboxDismissed);
  const dismissed = new Set(preferences.inboxDismissed);
  const shown = (showDone ? all.filter((x) => dismissed.has(x.key)) : counts.open).filter((x) => filter === "all" || x.type === filter);
  const types = [...new Set(counts.open.map((x) => x.type))];
  const dismiss = async (k: string, undo = false) => {
    try { await savePreferences({ ...preferences, inboxDismissed: undo ? preferences.inboxDismissed.filter((x) => x !== k) : [...preferences.inboxDismissed, k] }); toast.success(undo ? "Restored" : "Marked done"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const openTxn = (id?: string) => { const t = transactions.find((x) => x.id === id); if (t) setOpen(t); };

  return (
    <div>
      <PageTitle eyebrow="Needs attention" title="Financial inbox" sub="Items clear themselves once the underlying record is fixed." />
      <Tabs defaultValue="inbox">
        <TabsList className="mb-4 w-full justify-start overflow-x-auto"><TabsTrigger value="inbox">To review ({counts.pending})</TabsTrigger><TabsTrigger value="accounts">Accounts check</TabsTrigger><TabsTrigger value="reimb">Reimbursements</TabsTrigger></TabsList>

        <TabsContent value="inbox">
          <InboxWork />
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            {[["Pending", counts.pending], ["High priority", counts.high], ["Done", counts.dismissed]].map(([l, v]) => <div key={l} className="rounded-2xl border p-3"><div className="font-mono text-2xl font-bold">{v}</div><div className="text-xs font-medium text-muted-foreground">{l}</div></div>)}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" variant={filter === "all" && !showDone ? "gold" : "outline"} onClick={() => { setFilter("all"); setShowDone(false); }}>All</Button>
            {types.map((t) => <Button key={t} size="sm" variant={filter === t ? "gold" : "outline"} onClick={() => { setFilter(t); setShowDone(false); }}>{INBOX_LABEL[t]}</Button>)}
            <Button size="sm" variant={showDone ? "gold" : "ghost"} onClick={() => { setShowDone(!showDone); setFilter("all"); }}>Done items</Button>
          </div>
          {!shown.length && <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">{showDone ? "Nothing marked done yet." : "All clear — nothing needs your attention."}</p>}
          <ul className="space-y-2">{shown.map((x) => <Item key={x.key} x={x} done={dismissed.has(x.key)} onOpen={() => openTxn(x.transactionId)} onDismiss={() => dismiss(x.key, dismissed.has(x.key))}
            onConfirm={x.type === "unverified_import" && x.transactionId ? async () => { const t = transactions.find((y) => y.id === x.transactionId); try { await reconcile(x.transactionId!, t?.statementRef ?? `confirmed · ${today}`); toast.success("Confirmed"); } catch (e) { toast.error((e as Error).message); } } : undefined} />)}</ul>
        </TabsContent>

        <TabsContent value="accounts"><AccountsCheck onOpen={setOpen} /></TabsContent>
        <TabsContent value="reimb"><Reimbursements list={expenses} onOpen={setOpen} today={today} /></TabsContent>
      </Tabs>
      <ExpenseDialog expense={open ? transactions.find((t) => t.id === open.id) ?? null : null} onClose={() => setOpen(null)} />
    </div>
  );
}

function Item({ x, done, onOpen, onDismiss, onConfirm }: { x: InboxItem; done: boolean; onOpen: () => void; onDismiss: () => void; onConfirm?: (() => void) | undefined }) {
  return (
    <li className="rounded-2xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs"><span className={cn("rounded-full px-2 py-0.5 font-bold capitalize", PRIORITY_TONE[x.priority])}>{x.priority}</span><span className="font-semibold">{INBOX_LABEL[x.type]}</span>{x.date && <span className="text-muted-foreground">{x.date}</span>}</div>
          <div className="mt-1 truncate font-semibold">{x.title}</div>
          <div className="text-sm text-muted-foreground">{x.description}{x.accountName ? ` · ${x.accountName}` : ""}</div>
          <div className="mt-1 text-xs font-medium">Suggested: {x.action}</div>
        </div>
        {x.amount != null && <div className="shrink-0 font-mono font-bold">{money(Math.abs(x.amount))}</div>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {x.transactionId && <Button size="sm" variant="outline" onClick={onOpen}>Open transaction</Button>}
        {onConfirm && !done && <Button size="sm" variant="gold" onClick={onConfirm}>Confirm</Button>}
        {x.commitmentId && <Button asChild size="sm" variant="outline"><Link to="/plan">Open in Plan</Link></Button>}
        {x.type === "unreconciled_account" && <Button asChild size="sm" variant="outline"><Link to="/reconcile">Import statement</Link></Button>}
        <Button size="sm" variant="ghost" onClick={onDismiss}>{done ? "Restore" : "Dismiss / resolved"}</Button>
      </div>
    </li>
  );
}

function AccountsCheck({ onOpen }: { onOpen: (e: Expense) => void }) {
  const { accounts, transactions, preferences, savePreferences, adjustBalance, reconcile } = useStore();
  const today = todayISO();
  const fs = freshnessSummary(accounts, transactions, preferences, today);
  const [sel, setSel] = useState<string>(fs.rows[0]?.accountId ?? "");
  const acc = accounts.find((a) => a.id === sel);
  const [bal, setBal] = useState(""); const [date, setDate] = useState(today);
  const d = acc ? discrepancy(acc, transactions, preferences) : null;
  const [busy, setBusy] = useState(false);
  const t = acc ? preferences.freshness.perAccount[acc.id] ?? preferences.freshness : preferences.freshness;
  if (!fs.rows.length) return <p className="rounded-2xl border p-6 text-center text-sm">Add an account in Wealth to start checking balances.</p>;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-3"><div className="font-display text-lg font-bold">{fs.label}</div>{fs.lowConfidence && <p className="text-sm text-destructive">Outdated: {fs.outdatedCritical.join(", ")}. Affordability figures may be unreliable until these are reconciled.</p>}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Account</th><th>Status</th><th>Last entry</th><th>Reconciled</th><th>Balance confirmed</th><th>Source</th></tr></thead>
        <tbody>{fs.rows.map((r) => <tr key={r.accountId} className={cn("cursor-pointer border-t", r.accountId === sel && "bg-gold-soft/40")} onClick={() => setSel(r.accountId)}><td className="py-2 font-semibold">{r.name}</td><td><span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", FRESH_TONE[r.status])}>{FRESHNESS_LABEL[r.status]}</span></td><td>{r.lastTransaction ?? "—"}</td><td>{r.lastReconciliation ?? "—"}</td><td>{r.lastBalanceConfirmation ?? "—"}</td><td className="capitalize">{r.source}</td></tr>)}</tbody></table></div>
      {acc && d && <section className="space-y-3 rounded-2xl border p-3">
        <h3 className="font-display text-lg font-bold">Check {acc.name}</h3>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">Last reconciled</div><b>{d.lastReconciled ?? "Never"}</b></div>
          <div><div className="text-xs text-muted-foreground">Recorded balance{d.statementDate ? ` on ${d.statementDate}` : ""}</div><b className="font-mono">{money(d.recordedBalance)}</b></div>
          <div><div className="text-xs text-muted-foreground">Statement balance</div><b className="font-mono">{d.statementBalance == null ? "—" : money(d.statementBalance)}</b></div>
          <div><div className="text-xs text-muted-foreground">Difference</div><b className={cn("font-mono", d.difference && Math.abs(d.difference) >= 1 ? "text-destructive" : "text-success")}>{d.difference == null ? "—" : money(d.difference)}</b></div>
        </div>
        <p className="text-sm font-medium">{d.action}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">Statement balance ₹<Input className="w-36" type="number" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} /></label>
          <label className="text-xs">As of<Input className="w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <Button size="sm" variant="gold" disabled={!bal || busy} onClick={async () => { setBusy(true); try { await savePreferences({ ...preferences, statementBalances: { ...preferences.statementBalances, [acc.id]: { balance: Number(bal), date } } }); toast.success("Statement balance saved"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Compare</Button>
          {d.difference != null && Math.abs(d.difference) >= 1 && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (!confirm(`Record a balance adjustment of ${money(d.difference!)}? Only do this after checking for missing entries — it is not counted as spending or income.`)) return; setBusy(true); try { await adjustBalance(acc, d.statementBalance!, d.statementDate!); toast.success("Adjustment recorded"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Record adjustment</Button>}
          <Button asChild size="sm" variant="outline"><Link to="/reconcile">Import statement</Link></Button>
        </div>
        {d.duplicates.length > 0 && <div><b className="text-sm">Possible duplicates</b><ul className="divide-y text-sm">{d.duplicates.map(([a, b]) => <li key={a.id + b.id} className="flex justify-between gap-2 py-1.5"><button className="truncate text-left underline" onClick={() => onOpen(b)}>{a.title} · {a.date}</button><span className="font-mono">{money(a.amount)}</span></li>)}</ul></div>}
        <div><b className="text-sm">Not yet matched to a statement ({d.unmatched.length})</b>
          <ul className="divide-y text-sm">{d.unmatched.slice(0, 12).map((x) => <li key={x.id} className="flex items-center justify-between gap-2 py-1.5"><button className="min-w-0 truncate text-left" onClick={() => onOpen(x)}>{x.date} · {x.title}</button><span className="flex shrink-0 items-center gap-2"><span className="font-mono">{money(x.amount)}</span><Button size="sm" variant="ghost" onClick={async () => { try { await reconcile(x.id, `verified · ${today}`); toast.success("Marked as verified"); } catch (e) { toast.error((e as Error).message); } }}>Verified</Button></span></li>)}</ul></div>
        <details><summary className="cursor-pointer text-xs font-semibold">Freshness thresholds for this account</summary>
          <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
            <label>Needs review after (days)<Input className="w-24" type="number" defaultValue={t.reviewDays} id="rv" /></label>
            <label>Outdated after (days)<Input className="w-24" type="number" defaultValue={t.outdatedDays} id="od" /></label>
            <Button size="sm" variant="outline" onClick={async () => { const rv = Number((document.getElementById("rv") as HTMLInputElement).value), od = Number((document.getElementById("od") as HTMLInputElement).value); if (!(rv > 0 && od > rv)) { toast.error("Outdated must be longer than needs-review"); return; } await savePreferences({ ...preferences, freshness: { ...preferences.freshness, perAccount: { ...preferences.freshness.perAccount, [acc.id]: { reviewDays: rv, outdatedDays: od } } } }); toast.success("Thresholds saved"); }}>Save</Button>
          </div></details>
      </section>}
    </div>
  );
}

function Reimbursements({ list, onOpen, today }: { list: Expense[]; onOpen: (e: Expense) => void; today: string }) {
  const s = reimbursementSummary(list, today);
  const claims = list.filter(isTracked).sort((a, b) => outstandingOf(b) - outstandingOf(a) || b.date.localeCompare(a.date));
  if (!claims.length) return <p className="rounded-2xl border p-6 text-center text-sm">No reimbursement claims yet. Open any expense and use "Reimbursement claim details" to track one.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Gross paid", s.gross], ["Reimbursable", s.reimbursable], ["Received", s.received], ["Outstanding", s.outstanding], ["Written off / rejected", s.writtenOff], ["Net personal cost", s.netPersonalCost]].map(([l, v]) => <div key={l as string} className="rounded-2xl border p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-mono font-bold">{money(v as number)}</div></div>)}</div>
      <p className="text-xs text-muted-foreground">Money received back is recorded as a reimbursement, never as earned income.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border p-3"><b className="text-sm">Outstanding by organisation / person</b><ul className="mt-1 text-sm">{Object.entries(s.byPayer).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between py-0.5"><span>{k}</span><span className="font-mono">{money(v)}</span></li>)}{!Object.keys(s.byPayer).length && <li>Nothing outstanding</li>}</ul></div>
        <div className="rounded-2xl border p-3"><b className="text-sm">Outstanding by age</b><ul className="mt-1 text-sm">{AGE_BUCKETS.map((k) => <li key={k} className="flex justify-between py-0.5"><span>{k}</span><span className="font-mono">{money(s.byAge[k] ?? 0)}</span></li>)}</ul></div>
      </div>
      <ul className="divide-y rounded-2xl border">{claims.map((e) => <li key={e.id}><button className="flex w-full items-center justify-between gap-3 p-3 text-left" onClick={() => onOpen(e)}><span className="min-w-0"><span className="block truncate font-semibold">{e.title}</span><span className="text-xs text-muted-foreground">{e.date} · {e.reimbursement?.payer || "Payer not set"} · {REIMB_STAGE_LABEL[stageOf(e)]}</span></span><span className="shrink-0 text-right font-mono text-sm"><b>{money(outstandingOf(e))}</b><span className="block text-xs text-muted-foreground">of {money(e.amount)}</span></span></button></li>)}</ul>
    </div>
  );
}
