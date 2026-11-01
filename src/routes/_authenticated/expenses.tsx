import { SavedViews } from "@/components/SavedViews";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { History, Undo2 } from "lucide-react";
import { PageTitle, Stat } from "@/components/AppShell";
import { ExpenseTable } from "@/components/ExpenseTable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_METHODS, PAYMENT_LABEL, applyFilters, money, totalsByScope, type Filters } from "@/lib/expenses";
import { instrumentLabel } from "@/lib/payment-instruments";
import { useStore, type CategoryBatch } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — Ledgerline" },
      { name: "description", content: "Filter expenses by business or personal, family member, category and date." },
      { property: "og:title", content: "Expenses — Ledgerline" },
      { property: "og:description", content: "Filter expenses by business or personal, family member, category and date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Expenses,
});

function Expenses() {
  const { transactions: expenses, members, accounts, preferences, bulkSetCategory, categoryHistory, undoCategoryBatch } = useStore();
  const [f, setF] = useState<Filters>({ scope: "all", memberId: "all", category: "all" });
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [applying, setApplying] = useState(false);
  const [batches, setBatches] = useState<CategoryBatch[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const loadHistory = async () => {
    setHistoryLoading(true);
    try { setBatches(await categoryHistory()); } catch(e) { toast.error((e as Error).message); }
    finally { setHistoryLoading(false); }
  };
  const undo = async (id: string) => {
    setApplying(true);
    try { await undoCategoryBatch(id); if (lastBatch === id) setLastBatch(null); toast.success("Original categories and splits restored"); await loadHistory(); }
    catch(e) { toast.error((e as Error).message); }
    finally { setApplying(false); }
  };
  const list = applyFilters(expenses, f);
  const t = totalsByScope(list.filter(e=>(e.txnType??"expense")==="expense"));
  const activeCategories = preferences.categories.filter(c=>!c.archived).map(c=>c.name);
  const togglePick = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };
  const applyBulk = async () => {
    if (!bulkCategory || !picked.size) return;
    setApplying(true);
    const signature = JSON.stringify([[...picked].sort(), bulkCategory]);
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    const batchId = operation.current.id;
    try { const id = await bulkSetCategory([...picked], bulkCategory, batchId); setLastBatch(id); operation.current = null; toast.success(`${picked.size} ${picked.size === 1 ? "entry" : "entries"} moved to ${bulkCategory}`, { action: { label: "Undo", onClick: () => void undo(id) } }); stopSelecting(); if(showHistory) await loadHistory(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setApplying(false); }
  };

  return (
    <>
      <PageTitle eyebrow="All expenses" title="Sort it out" sub="Separate business from personal, and see who each expense was for." />
      <div className="mb-4 inline-grid grid-cols-3 rounded-2xl bg-secondary p-1 text-sm" role="radiogroup" aria-label="Show">
        {(["all", "business", "personal"] as const).map((s) => (
          <button key={s} role="radio" aria-checked={f.scope === s} onClick={() => setF({ ...f, scope: s })}
            className={cn("rounded-xl px-4 py-2 font-semibold capitalize", f.scope === s ? "bg-gold text-gold-foreground" : "text-muted-foreground")}>{s}</button>
        ))}
      </div>
      <SavedViews filters={f} onApply={(v) => setF(v as Filters)} />
      <div className="mb-3 grid gap-3 sm:grid-cols-5"><Input aria-label="Search transactions" placeholder="Merchant, description or tags" value={f.query ?? ""} onChange={e=>setF({...f,query:e.target.value})}/><Select value={f.accountId ?? "all"} onValueChange={v=>setF({...f,accountId:v})}><SelectTrigger aria-label="Filter account"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All accounts</SelectItem>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Select value={f.paymentMethod ?? "all"} onValueChange={v=>setF({...f,paymentMethod:v})}><SelectTrigger aria-label="Filter payment"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All payment methods</SelectItem>{PAYMENT_METHODS.map(v=><SelectItem key={v} value={v}>{PAYMENT_LABEL[v]}</SelectItem>)}</SelectContent></Select><Select value={f.paymentInstrumentId ?? "all"} onValueChange={v=>setF({...f,paymentInstrumentId:v})}><SelectTrigger aria-label="Filter UPI ID or card"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All UPI IDs & cards</SelectItem>{preferences.paymentInstruments.map(p=><SelectItem key={p.id} value={p.id}>{instrumentLabel(p)}</SelectItem>)}</SelectContent></Select><Select value={f.tag ?? "all"} onValueChange={v=>setF({...f,tag:v})}><SelectTrigger aria-label="Filter tag"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All tags</SelectItem>{[...new Set(expenses.flatMap(e=>e.tags??[]))].map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Select value={f.memberId ?? "all"} onValueChange={(v) => setF({ ...f, memberId: v })}>
          <SelectTrigger aria-label="Family member"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="me">Me</SelectItem>
            {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.category ?? "all"} onValueChange={(v) => setF({ ...f, category: v as NonNullable<Filters["category"]> })}>
          <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {[...new Set([...preferences.categories.map(c=>c.name),...expenses.map(e=>e.category)])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" aria-label="From" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input type="date" aria-label="To" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat tone="business" label="Business" value={money(t.business)} />
        <Stat tone="personal" label="Personal" value={money(t.personal)} />
        <Stat label={`${list.length} total`} value={money(t.total)} />
      </div>
      {(() => { const groups = accounts.map(a => ({ a, n: expenses.filter(e => e.accountId === a.id && /^uncategori[sz]ed$/i.test(e.category)).length })).filter(g => g.n > 0); return groups.length ? <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Uncategorised entries by account"><span className="text-sm text-muted-foreground">Sort uncategorised:</span>{groups.map(({ a, n }) => <Button key={a.id} size="sm" variant="outline" className="min-h-10 whitespace-normal" onClick={() => { const cat = expenses.find(e => e.accountId === a.id && /^uncategori[sz]ed$/i.test(e.category))!.category; setF({ ...f, scope: "all", accountId: a.id, category: cat as NonNullable<Filters["category"]> }); setSelecting(true); setPicked(new Set()); }}>{a.name} · {n}</Button>)}</div> : null; })()}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { setShowHistory(!showHistory); if (!showHistory) void loadHistory(); }}><History className="mr-1 h-4 w-4" />Category history</Button>
        {lastBatch && <Button variant="outline" size="sm" disabled={applying} onClick={() => void undo(lastBatch)}><Undo2 className="mr-1 h-4 w-4" />Undo last change</Button>}
        <Button variant={selecting ? "secondary" : "outline"} size="sm" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? "Done selecting" : "Select entries"}</Button>
        {selecting && <>
          <Button variant="ghost" size="sm" onClick={() => setPicked(new Set(list.map(e => e.id)))}>All {list.length}</Button>
          <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>None</Button>
          <Select value={bulkCategory} onValueChange={setBulkCategory}><SelectTrigger aria-label="New category for selected" className="w-44"><SelectValue placeholder="New category…" /></SelectTrigger><SelectContent>{activeCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" disabled={!picked.size || !bulkCategory || applying} onClick={() => void applyBulk()}>{applying ? "Applying…" : `Apply to ${picked.size}`}</Button>
        </>}
      </div>
      {showHistory && <section aria-label="Bulk category audit history" className="mb-6 border-y py-4">
        <h2 className="mb-3 font-display font-bold">Bulk category history</h2>
        {historyLoading ? <p className="text-sm text-muted-foreground">Loading history…</p> : batches.length === 0 ? <p className="text-sm text-muted-foreground">No bulk category changes yet.</p> : <ul className="divide-y">{batches.map(b => <li key={b.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold">{b.entries.length} entries → {b.category}</p><p className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString()}{b.undoneAt ? ` · Undone ${new Date(b.undoneAt).toLocaleString()}` : ""}</p></div>{!b.undoneAt && <Button size="sm" variant="outline" disabled={applying} onClick={() => void undo(b.id)}><Undo2 className="mr-1 h-4 w-4" />Undo</Button>}</div><details className="mt-2 text-sm"><summary className="cursor-pointer text-primary">Changed entries</summary><ul className="mt-2 space-y-1">{b.entries.map(e => <li key={e.id} className="break-words">{e.title} · {e.from}{e.allocations.length ? " (category split)" : ""} → {b.category}</li>)}</ul></details></li>)}</ul>}
      </section>}
      <ExpenseTable items={list} empty="No expenses match these filters." selected={selecting ? picked : undefined} onToggle={selecting ? togglePick : undefined} />
    </>
  );
}
