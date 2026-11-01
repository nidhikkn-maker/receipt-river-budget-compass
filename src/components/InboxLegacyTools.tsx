


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
import { confirmAction } from "@/lib/confirm";

export function AccountsCheck({ onOpen }: { onOpen: (e: Expense) => void }) {
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
      <p className="text-sm text-muted-foreground">Manual comparisons do not certify statement coverage or reconciliation.</p>
      <div className="flex flex-wrap gap-2">{accounts.filter(a => !a.archived).map(a => <Button key={a.id} size="sm" variant={sel === a.id ? "secondary" : "outline"} onClick={() => setSel(a.id)}>{a.name}</Button>)}</div>
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
          {d.difference != null && Math.abs(d.difference) >= 1 && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (d.difference == null || d.statementBalance == null || !d.statementDate) return; if (!await confirmAction({ title: "Confirm balance adjustment", message: `Record a balance adjustment of ${money(d.difference)}? Only do this after checking for missing entries — it is not counted as spending or income.`, confirmLabel: "Record adjustment" })) return; setBusy(true); try { await adjustBalance(acc, d.statementBalance, d.statementDate); toast.success("Adjustment recorded"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Record adjustment</Button>}
          <Button asChild size="sm" variant="outline"><Link to="/inbox" search={{ section: "statements" }}>Import statement</Link></Button>
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

export function Reimbursements({ list, onOpen, today }: { list: Expense[]; onOpen: (e: Expense) => void; today: string }) {
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
