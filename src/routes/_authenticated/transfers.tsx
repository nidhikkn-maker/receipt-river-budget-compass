import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Link2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, type Expense } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { suggestTransfers, transferImpact, transferStatus, transferPairBlocker, TRANSFER_STATUS_LABEL, activeLinks, type TransferLinkRow, type TransferSuggestion } from "@/lib/transfer-match";
import { FinancialInboxNav } from '@/components/FinancialInboxNav';
import { Link } from '@tanstack/react-router';
import { cardLedger } from '@/lib/card-balance';

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({
    meta: [
      { title: "Internal transfers · Ledgerline" },
      { name: "description", content: "Link both sides of a transfer between your own accounts as one movement." },
      { property: "og:title", content: "Internal transfers · Ledgerline" },
      { property: "og:description", content: "Safe, confirmed linking of transfers between your own accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransfersPage,
});

type Pending = { items: { s: TransferSuggestion; id: string }[] };

function TransfersPage() {
  const { transactions, transferCounterparts, accounts, confirmTransfer, cancelTransfer } = useStore();
  const [links, setLinks] = useState<TransferLinkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [destFor, setDestFor] = useState<Record<string, string>>({});
  const busy = useRef(false);

  const load = useCallback(async () => {
    const r = await supabase.from("transfer_links").select("*").order("created_at", { ascending: false });
    if (r.error) { setError("Transfers could not load. Retry."); return; }
    setError(null); setLinks((r.data ?? []) as unknown as TransferLinkRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const suggestions = useMemo(() => (links ? suggestTransfers(transactions, accounts, links) : []), [transactions, accounts, links]);
  const strong = suggestions.filter((s) => s.strength === "strong");
  const other = suggestions.filter((s) => s.strength !== "strong");
  const name = (id?: string | null) => accounts.find((a) => a.id === id)?.name ?? "—";
  const own = accounts.filter((a) => !a.archived);

  const open = (list: TransferSuggestion[]) => { const blocker=list.map(s=>transferPairBlocker(s.debit,s.credit)).find(Boolean);if(blocker){toast.error(blocker);return;}setPending({ items: list.map((s) => ({ s, id: crypto.randomUUID() })) }); };
  const run = async () => {
    if (!pending || busy.current) return;
    busy.current = true;
    let ok = 0; const failed: string[] = [];
    try {
      for (const [i, { s, id }] of pending.items.entries()) {
        setStage(`Saving ${i + 1} of ${pending.items.length}…`);
        try { await confirmTransfer({ id, debit: s.debit, destId: s.destId, credit: s.credit }); ok++; }
        catch (e) { failed.push(`${s.debit.date} ${money(s.debit.amount)}: ${(e as Error).message}`); }
      }
    } finally { busy.current = false; setStage(null); }
    await load();
    if (ok) toast.success(`${ok} transfer${ok > 1 ? "s" : ""} linked as one movement`);
    if (failed.length) toast.error(`${failed.length} not linked — ${failed[0]}`); else setPending(null);
    if (failed.length) setPending({ items: pending.items.filter(({ s }) => failed.some((f) => f.startsWith(`${s.debit.date} ${money(s.debit.amount)}`))) });
  };

  const Pair = ({ d, c, dest }: { d: Expense; c: Expense | null; dest: string }) => (
    <div className="grid min-w-0 gap-1 text-sm md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3">
      <div className="min-w-0"><div className="truncate font-medium">{name(d.accountId)}</div><div className="break-words text-xs text-muted-foreground">{d.date} · {d.title} · {money(d.originalAmount, d.currency)} out</div></div>
      <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground md:rotate-0" />
      <div className="min-w-0"><div className="truncate font-medium">{name(dest)}</div><div className="break-words text-xs text-muted-foreground">{c ? `${c.date} · ${c.title} · ${money(c.originalAmount, c.currency)} in` : "Waiting for the destination statement"}</div></div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Internal transfers</h1>
      <div className="my-4"><FinancialInboxNav active="transfers"/></div>
      <section className="space-y-2 border-y py-4" aria-label="Credit card payments"><h2 className="text-lg font-semibold">Credit card payments</h2>{accounts.filter(a=>a.kind==='credit_card'&&!a.archived).map(card=>{const balance=cardLedger(card,transactions);return <Button asChild key={card.id} variant="outline" className="mr-2 h-auto min-h-10 whitespace-normal"><Link to="/cards/$accountId" params={{accountId:card.id}}>{card.name} · {balance.unreconciled.count} payments requiring evidence</Link></Button>;})}</section>
      <p className="mt-1 text-sm text-muted-foreground">Both statement lines stay. Linking records them as one movement so income and spending aren’t inflated. Nothing is linked without your confirmation.</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error} <Button size="sm" variant="ghost" onClick={() => void load()}>Retry</Button></p>}
      {!links && !error && <p className="mt-4 text-sm text-muted-foreground">Searching for matching transfers…</p>}

      {links && (
        <>
          <Card title={`Strong matches found automatically (${strong.length})`} className="mt-4">
            {strong.length === 0 ? <p className="text-sm text-muted-foreground">No pairs with a shared reference or matching narration right now.</p> : (
              <>
                <ul className="divide-y">{strong.map((s) => <li key={s.key} className="flex flex-col gap-3 py-3 md:flex-row md:items-center"><div className="min-w-0 flex-1 [overflow-wrap:anywhere]"><Pair d={s.debit} c={s.credit} dest={s.destId} /><p className="mt-1 text-xs text-muted-foreground">{s.evidence.join(" · ")}</p></div><Button size="sm" variant="outline" className="w-full md:w-auto" onClick={() => open([s])}>Review</Button></li>)}</ul>
                <Button className="mt-3 w-full sm:w-auto" onClick={() => open(strong)}><Link2 className="mr-1 h-4 w-4" />Review & link all {strong.length}</Button>
              </>
            )}
          </Card>

          <Card title={`Needs your choice (${other.length})`} className="mt-4">
            {other.length === 0 ? <p className="text-sm text-muted-foreground">Nothing uncertain.</p> : (
              <ul className="divide-y">{other.slice(0, 100).map((s) => (
                <li key={s.key} className="space-y-2 py-3">
                  <Pair d={s.debit} c={s.credit} dest={s.destId || destFor[s.debit.id] || ""} />
                  <p className="text-xs text-muted-foreground">{s.evidence.join(" · ")} · {s.candidates} possible entr{s.candidates === 1 ? "y" : "ies"}</p>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    {s.credit && <Button size="sm" variant="outline" disabled={!!transferPairBlocker(s.debit,s.credit)} onClick={() => open([s])}>This is the same transfer</Button>}
                    <Select value={destFor[s.debit.id] ?? ""} onValueChange={(v) => setDestFor({ ...destFor, [s.debit.id]: v })}><SelectTrigger className="h-9 w-full sm:w-64" aria-label="Destination account"><SelectValue placeholder="Only one side uploaded — choose destination" /></SelectTrigger><SelectContent>{own.filter((a) => a.id !== s.debit.accountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
                    <Button size="sm" variant="ghost" disabled={!destFor[s.debit.id]||!!s.credit} onClick={() => {const dest=destFor[s.debit.id];if(dest)open([{ ...s, credit: null, destId: dest }]);}}>Save as awaiting destination</Button>
                  </div>
                </li>))}</ul>
            )}
          </Card>

          <Card title={`Linked transfers (${activeLinks(links).length})`} className="mt-4">
            <ul className="divide-y">{links.slice(0, 200).map((l) => {
              const st = transferStatus(l, transactions, transferCounterparts);
              const d = transactions.find((t) => t.id === l.debit_id);
              return <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 text-sm sm:flex">
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]"><div className="break-words font-medium">{name(l.source_account)} → {name(l.dest_account)}</div><div className="text-xs text-muted-foreground">{d?.date ?? "—"} · {money(Number(l.source_amount), l.source_currency)}</div></div>
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (st === "conflict" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>{TRANSFER_STATUS_LABEL[st]}</span>
                {st !== "cancelled" && <Button size="sm" variant="ghost" className="col-span-2 justify-self-start" onClick={async () => { try { await cancelTransfer(l.id); await load(); toast.success("Transfer unlinked; original entries restored"); } catch (e) { toast.error((e as Error).message); } }}><Undo2 className="mr-1 h-4 w-4" />Unlink</Button>}
              </li>;
            })}</ul>
          </Card>
        </>
      )}

      <Dialog open={!!pending} onOpenChange={(v) => { if (!v && !busy.current) setPending(null); }}>
        <DialogContent className="max-h-[85dvh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Confirm {pending?.items.length} transfer{pending && pending.items.length > 1 ? "s" : ""}</DialogTitle><DialogDescription>Existing entries are linked. No new debit or credit is created.</DialogDescription></DialogHeader>
          <ul className="divide-y">{pending?.items.map(({ s }) => { const imp = transferImpact(s.debit, s.credit); return <li key={s.key} className="space-y-1 py-3"><Pair d={s.debit} c={s.credit} dest={s.destId} /><p className="text-xs">Income {money(imp.incomeChange)} · Spending {money(imp.spendingChange)} · New postings: none</p><p className="text-xs text-muted-foreground">{s.credit ? "Both balances stay as they are." : `${name(s.destId)} rises by ${money(s.debit.amount)} until its statement arrives.`}</p></li>; })}</ul>
          {stage && <p className="text-sm" role="status">{stage}</p>}
          <div className="sticky bottom-0 -mx-6 -mb-6 grid grid-cols-2 gap-2 border-t bg-background p-4 sm:static sm:m-0 sm:flex sm:justify-end sm:border-0 sm:p-0"><Button variant="outline" disabled={!!stage} onClick={() => setPending(null)}>Cancel</Button><Button onClick={run}>Confirm transfer{pending && pending.items.length > 1 ? "s" : ""}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
