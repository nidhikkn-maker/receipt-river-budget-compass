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
      {open && <ExpenseDialog expense={open} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />}
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

function Merchants() {
  const { transactions, preferences: pr, savePreferences } = useStore();
  const today = todayISO();
  const profiles = useMemo(() => merchantProfiles(transactions, pr.merchantAliases, today), [transactions, pr.merchantAliases, today]);
  const sugg = mergeSuggestions(profiles);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const save = async (a: typeof pr.merchantAliases, msg: string) => { try { await savePreferences({ ...pr, merchantAliases: a }); setSel([]); toast.success(msg); } catch (e) { toast.error((e as Error).message); } };
  const merge = (keys: string[]) => { const ps = profiles.filter((p) => keys.includes(p.key)); const target = ps[0]!.key; save(mergeMerchants(pr.merchantAliases, ps.slice(1).flatMap((p) => p.names), target), `Merged into ${ps[0]!.name}`); };
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
              {p.names.length > 1 && <div className="mt-1 text-[11px] text-muted-foreground">Original names: {p.names.map((n) => <span key={n} className="mr-2">{n}{pr.merchantAliases[normaliseMerchant(n)] && <button className="ml-1 underline" onClick={() => save(unmergeMerchant(pr.merchantAliases, n), "Separated")}>unmerge</button>}</span>)}</div>}
            </div>
          </div>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">Merging only groups names for reports. Original statement names and amounts are kept unchanged.</p>
    </>
  );
}
