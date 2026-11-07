import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { Card, Row } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, type Expense } from "@/lib/expenses";
import { behaviour, mergeMerchants, mergeSuggestions, merchantProfiles, normaliseMerchant, unmergeMerchant } from "@/lib/intelligence";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/use-position";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { merchantGroupingChanges, merchantEntrySnapshot, merchantReviewSnapshot, reverseMerchantGrouping, type MerchantGroupingEvent } from "@/lib/merchant-management";

export const Route = createFileRoute("/_authenticated/patterns")({
  head: () => ({
    meta: [
      { title: "Spending patterns & merchants · Ledgerline" },
      { name: "description", content: "Factual spending patterns with supporting entries, and merchant profiles with merge and unmerge." },
      { property: "og:title", content: "Spending patterns · Ledgerline" },
      { property: "og:description", content: "Behaviour analysis and merchant intelligence from your own records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Patterns,
});

function Patterns() {
  const { transactions } = useStore();
  const [open, setOpen] = useState<Expense | null>(null);
  return (
    <div>
      <PageTitle eyebrow="Insights" title="Patterns" sub="Observations come from fixed rules on your saved entries — no guesses about why." />
      <Tabs defaultValue="behaviour">
        <TabsList className="mb-4 w-full justify-start"><TabsTrigger value="behaviour">Behaviour</TabsTrigger><TabsTrigger value="merchants">Merchants</TabsTrigger></TabsList>
        <TabsContent value="behaviour"><Behaviour onOpen={(id) => setOpen(transactions.find((t) => t.id === id) ?? null)} /></TabsContent>
        <TabsContent value="merchants"><Merchants /></TabsContent>
      </Tabs>
      <ExpenseDialog expense={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Behaviour({ onOpen }: { onOpen: (id: string) => void }) {
  const { transactions } = useStore();
  const today = todayISO();
  const obs = useMemo(() => behaviour(transactions, today), [transactions, today]);
  const [show, setShow] = useState<string | null>(null);
  if (!obs.length) return <p className="text-sm text-muted-foreground">No notable patterns yet. Patterns appear once you have a few months of entries.</p>;
  return (
    <>
      {obs.map((o) => (
        <Card key={o.key} title={o.title}>
          <p className="text-sm">{o.detail}</p>
          <Row label="Financial impact" value={money(o.impact)} />
          <Row label="Compared" value={o.period} />
          <p className="mt-2 rounded-lg bg-gold-soft px-3 py-2 text-sm font-medium text-gold-strong">{o.action}</p>
          {o.txnIds.length > 0 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShow(show === o.key ? null : o.key)}>{show === o.key ? "Hide" : `Show ${o.txnIds.length} entries`}</Button>}
          {show === o.key && <ul className="mt-1 text-sm">{[...new Set(o.txnIds)].slice(0, 30).map((id) => { const t = transactions.find((x) => x.id === id); return t && <li key={id}><button className="flex w-full justify-between py-1 text-left hover:underline" onClick={() => onOpen(id)}><span className="truncate">{t.date} · {t.merchant ?? t.title}</span><span className="font-mono font-semibold">{money(t.amount)}</span></button></li>; })}</ul>}
        </Card>
      ))}
    </>
  );
}

export function Merchants() {
  const { transactions, preferences: pr, savePreferences } = useStore();
  const today = todayISO();
  const profiles = useMemo(() => merchantProfiles(transactions, pr.merchantAliases, today), [transactions, pr.merchantAliases, today]);
  const sugg = mergeSuggestions(profiles);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [review, setReview] = useState<{ aliases: typeof pr.merchantAliases; before: string; title: string; snapshot: string; event: MerchantGroupingEvent } | null>(null);
  const [error, setError] = useState("");
  const save = async () => {
    if (!review) return;
    if (review.before !== JSON.stringify(pr.merchantAliases)) { setError("Merchant groups changed. Close and review again."); return; }
    if (review.snapshot !== merchantReviewSnapshot(transactions, pr.merchantAliases, review.aliases)) { setError("Affected records changed. Close and review again."); return; }
    try { await savePreferences({ ...pr, merchantAliases: review.aliases, merchantGroupingHistory: [...(pr.merchantGroupingHistory ?? []), review.event] }); setSel([]); setReview(null); setError(""); toast.success("Merchant groups saved"); }
    catch (e) { setError((e as Error).message); }
  };
  const prepare = (aliases: typeof pr.merchantAliases, title: string, reverses?: string) => {
    const changes = merchantGroupingChanges(transactions, pr.merchantAliases, aliases);
    setError(""); setReview({ aliases, title, before: JSON.stringify(pr.merchantAliases), snapshot: merchantReviewSnapshot(transactions, pr.merchantAliases, aliases),
      event: { id: crypto.randomUUID(), date: new Date().toISOString(), title, before: { ...pr.merchantAliases }, after: aliases, entryIds: changes.map(c => c.id), entrySnapshot: merchantEntrySnapshot(transactions, pr.merchantAliases, aliases), ...(reverses ? { reverses } : {}) } });
  };
  const merge = (keys: string[]) => {
    const ps = profiles.filter((p) => keys.includes(p.key)); const first = ps[0]; if (!first || ps.length < 2) return;
    prepare(mergeMerchants(pr.merchantAliases, ps.slice(1).flatMap((p) => p.names), first.key), `Merge into ${first.name}`);
  };
  const separate = (name: string) => {
    prepare(unmergeMerchant(pr.merchantAliases, name), `Separate ${name}`);
  };
  const shown = profiles.filter((p) => !q || p.names.some((n) => n.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      {sugg.length > 0 && <Card title="Possible duplicates">{sugg.slice(0, 5).map((s) => <div key={s.word} className="flex items-center justify-between gap-2 py-1 text-sm"><span className="truncate">{s.keys.map((k) => profiles.find((p) => p.key === k)?.name).join(" · ")}</span><Button size="sm" variant="outline" onClick={() => merge(s.keys)}>Merge</Button></div>)}</Card>}
      <div className="mb-3 flex gap-2"><Input placeholder="Search merchants" value={q} onChange={(e) => setQ(e.target.value)} className="h-11" />{sel.length > 1 && <Button variant="gold" className="h-11" onClick={() => merge(sel)}>Merge {sel.length}</Button>}</div>
      {shown.slice(0, 80).map((p) => (
        <Card key={p.key} className="mb-2">
          <div className="flex items-start gap-3">
            <input type="checkbox" className="mt-1.5 h-4 w-4" aria-label={`Select ${p.name}`} checked={sel.includes(p.key)} onChange={(e) => setSel(e.target.checked ? [...sel, p.key] : sel.filter((x) => x !== p.key))} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2"><span className="truncate font-semibold">{p.name}</span><span className="font-mono font-semibold">{money(p.total)}</span></div>
              <div className="text-xs text-muted-foreground">{p.count} payments · last {p.lastDate} · this month {money(p.thisMonth)} vs {money(p.lastMonth)}</div>
              <div className="mt-1 flex flex-wrap gap-1">{p.recurring && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Looks monthly</span>}{p.increase && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Big increase</span>}</div>
              {p.names.length > 1 && <div className="mt-1 text-[11px] text-muted-foreground">Original names: {p.names.map((n) => <span key={n} className="mr-2">{n}{pr.merchantAliases[normaliseMerchant(n)] && <Button size="sm" variant="ghost" aria-label={`Unmerge ${n}`} onClick={() => separate(n)}>Unmerge</Button>}</span>)}</div>}
            </div>
          </div>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">Merging only groups names for reports. Original statement names and amounts are kept unchanged.</p>
      {!!pr.merchantGroupingHistory?.length && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Merchant grouping history</summary><ul className="divide-y">{[...pr.merchantGroupingHistory].reverse().map(event => {
        const reversed = pr.merchantGroupingHistory?.some(item => item.reverses === event.id);
        return <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 break-words">{event.title} · {event.date.slice(0,10)} · {event.entryIds.length} entries{reversed && " · reversed"}</span>{!event.reverses && !reversed && <Button variant="outline" size="sm" onClick={() => { try { prepare(reverseMerchantGrouping(pr.merchantAliases, event, pr.merchantGroupingHistory), `Reverse ${event.title}`, event.id); } catch(e) { toast.error((e as Error).message); } }}>Reverse grouping</Button>}</li>;
      })}</ul></details>}
      <Dialog open={!!review} onOpenChange={o => { if (!o) setReview(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{review?.title}</DialogTitle></DialogHeader>
          <p className="text-sm">{review?.event.entryIds.length ?? 0} affected entries · Original names, amounts and receipts stay unchanged.</p>
          <ul className="max-h-64 overflow-auto divide-y">{review && merchantGroupingChanges(transactions, pr.merchantAliases, review.aliases).map(({entry:t,from,to}) => <li key={t.id} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0 break-words">{t.date} · {t.merchant ?? t.title}<span className="block text-xs text-muted-foreground">{from} → {to}</span></span><span className="shrink-0 font-mono">{money(t.amount)}</span></li>)}</ul>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReview(null)}>Cancel</Button><Button onClick={save}>{error ? "Retry save" : "Confirm grouping"}</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
