import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { money, SCOPE_LABEL, type Expense } from "@/lib/expenses";
import { TXN_LABEL } from "@/lib/ledger";
import type { InboxItem } from "@/lib/inbox";
import { categoryReviewPreview, financialReview, previewStillCurrent, REVIEW_GROUPS, type ReviewGroup } from "@/lib/financial-review";
import { applyReviewRules } from "@/lib/financial-review-intelligence";
import { listImportRules } from "@/lib/import-repository";
import type { ImportRule } from "@/lib/historical-import";
import { FinancialReviewIntelligence } from "./FinancialReviewIntelligence";
import { FinancialCorrectionPanel } from "./FinancialCorrectionPanel";

export function FinancialReview({ items, onOpen }: { items: InboxItem[]; onOpen: (e: Expense) => void }) {
  const { transactions, accounts, preferences, commitments, bulkSetCategory, undoCategoryBatch } = useStore();
  const categories = preferences.categories.filter(c => !c.archived && c.name !== "Miscellaneous").map(c => c.name);
  const [rules, setRules] = useState<ImportRule[]>([]);
  const [ruleStatus, setRuleStatus] = useState("Loading classification rules…");
  const loadRules = async () => { try { setRules(await listImportRules()); setRuleStatus(""); } catch { setRuleStatus("Classification rules could not load. Other evidence remains available."); } };
  useEffect(() => { let active = true; void listImportRules().then(result => { if (active) { setRules(result); setRuleStatus(""); } }).catch(() => { if (active) setRuleStatus("Classification rules could not load. Other evidence remains available."); }); return () => { active = false; }; }, []);
  const rows = useMemo(() => applyReviewRules(financialReview(items, transactions, accounts, categories), rules, categories), [items, transactions, accounts, preferences.categories, rules]);
  const [group, setGroup] = useState<ReviewGroup | "all">("all");
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const [workspace, setWorkspace] = useState("all");
  const [organisation, setOrganisation] = useState("all");
  const [confidence, setConfidence] = useState("all");
  const [sort, setSort] = useState("date");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [minimum, setMinimum] = useState(""); const [maximum, setMaximum] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(40);
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof categoryReviewPreview> | null>(null);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const filtered = rows.filter(r => {
    const e = r.transaction;
    return (group === "all" || r.group === group) && (account === "all" || e.accountId === account) &&
      (workspace === "all" || e.scope === workspace) && (organisation === "all" || e.department === organisation) &&
      (confidence === "all" || r.confidence === confidence) && (!from || e.date >= from) && (!to || e.date <= to) &&
      (!minimum || e.amount >= Number(minimum)) && (!maximum || e.amount <= Number(maximum)) &&
      `${e.title} ${e.merchant ?? ""} ${e.description} ${e.department ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });
  filtered.sort((a, b) => sort === "amount" ? b.transaction.amount - a.transaction.amount : sort === "merchant" ? (a.transaction.merchant ?? a.transaction.title).localeCompare(b.transaction.merchant ?? b.transaction.title) : b.transaction.date.localeCompare(a.transaction.date));
  const visible = filtered.slice(0, limit);
  const picked = rows.filter(r => selected.has(r.transaction.id));
  const focused = rows.find(r => r.transaction.id === detail);
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const pick = (ids: string[]) => setSelected(prev => new Set([...prev, ...ids]));
  const selector = (label: string, value: string, set: (v: string) => void, options: [string, string][]) => <Select value={value} onValueChange={set}><SelectTrigger aria-label={label} className="min-w-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{label}</SelectItem>{options.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>;
  const showPreview = () => { try { setPreview(categoryReviewPreview(picked, category)); } catch (e) { toast.error((e as Error).message); } };
  const previewSuggested = () => {
    const category = picked[0]?.suggestedCategory;
    if (!category || picked.some(r => r.group !== "ready" || r.suggestedCategory !== category)) { toast.error("Select ready suggestions for one category. Other categories need separate confirmation."); return; }
    try { setPreview(categoryReviewPreview(picked, category)); } catch (e) { toast.error((e as Error).message); }
  };
  const apply = async () => {
    if (!preview) return;
    if (!categories.includes(preview.category) || !previewStillCurrent(preview, transactions)) { toast.error("These records changed. Close this preview and review the latest changes."); return; }
    const currentRows = rows.filter(r => preview.records.some(e => e.id === r.transaction.id));
    categoryReviewPreview(currentRows, preview.category);
    const signature = `${preview.fingerprint}|${preview.category}`;
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    const id = await bulkSetCategory(preview.records.map(e => e.id), preview.category, operation.current.id);
    setLastBatch(id); operation.current = null; setPreview(null); setSelected(new Set());
    toast.success("Categories saved. Account balances and reconciliation are unchanged.");
  };
  const evidence = focused ? <div className="space-y-3"><h3 className="break-words font-semibold">{focused.transaction.title}</h3><p className="text-sm">{focused.status} · {focused.confidence} confidence</p><div className="text-sm"><p>{focused.transaction.date} · {money(focused.transaction.amount)}</p><p>Account: {accounts.find(a => a.id === focused.transaction.accountId)?.name ?? "Unknown"}</p><p>Saved type: {TXN_LABEL[focused.transaction.txnType ?? "expense"]}</p><p>Organisation: {focused.transaction.department || "Unknown"}</p></div><ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">{focused.evidence.map((s, i) => <li key={i}>{s}</li>)}</ul>{focused.suggestedType && <p className="text-sm font-medium">Proposed: {TXN_LABEL[focused.suggestedType]}{focused.targetAccountIds.length === 1 ? ` → ${accounts.find(a => a.id === focused.targetAccountIds[0])?.name}` : " · receiving account needs confirmation"}</p>}<div className="border-t pt-3"><p className="text-xs font-medium text-muted-foreground">Saved narration (not changed by this review)</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{focused.transaction.description || "Not available in this record"}</p><p className="mt-2 break-words text-xs text-muted-foreground">Statement reference: {focused.transaction.statementRef || "Unknown"}</p></div><Button variant="outline" onClick={() => onOpen(focused.transaction)}>Review transaction</Button></div> : <p className="text-sm text-muted-foreground">No transaction selected.</p>;

  return <section className="space-y-4" aria-label="Smart financial review">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Financial review · {rows.length} transactions</h2><Button asChild variant="outline" size="sm"><Link to="/historical-import">Statement review</Link></Button></div>
    {ruleStatus && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><p>{ruleStatus}</p>{ruleStatus.includes("could not") && <Button variant="ghost" size="sm" onClick={loadRules}>Retry rules</Button>}</div>}
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{(Object.entries(REVIEW_GROUPS) as [ReviewGroup, string][]).map(([key, label]) => <Button key={key} variant={group === key ? "secondary" : "outline"} className="h-auto min-h-16 justify-start whitespace-normal text-left" onClick={() => { setGroup(key); setLimit(40); }}><span><span className="block text-xl font-semibold">{rows.filter(r => r.group === key).length}</span><span className="text-xs">{label}</span></span></Button>)}</div>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant={group === "all" ? "secondary" : "ghost"} onClick={() => setGroup("all")}>All groups</Button><Button size="sm" variant="ghost" onClick={() => { setQuery(""); setAccount("all"); setWorkspace("all"); setOrganisation("all"); setConfidence("all"); setFrom(""); setTo(""); setMinimum(""); setMaximum(""); setGroup("all"); setSelected(new Set()); }}>Clear filters & selection</Button></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Input aria-label="Search financial review" placeholder="Merchant, narration or organisation" value={query} onChange={e => setQuery(e.target.value)} />{selector("All accounts", account, setAccount, accounts.map(a => [a.id, a.name]))}{selector("All workspaces", workspace, setWorkspace, Object.entries(SCOPE_LABEL))}{selector("All organisations", organisation, setOrganisation, [...new Set(rows.map(r => r.transaction.department).filter((x): x is string => !!x))].map(x => [x, x]))}</div>
    <details><summary className="cursor-pointer text-sm font-medium">Date, amount & confidence</summary><div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-5"><label className="text-xs">From<Input aria-label="Review from date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-xs">To<Input aria-label="Review to date" type="date" value={to} onChange={e => setTo(e.target.value)} /></label><label className="text-xs">Minimum ₹<Input type="number" min="0" value={minimum} onChange={e => setMinimum(e.target.value)} /></label><label className="text-xs">Maximum ₹<Input type="number" min="0" value={maximum} onChange={e => setMaximum(e.target.value)} /></label>{selector("All confidence", confidence, setConfidence, ["high", "medium", "low"].map(x => [x, x]))}</div></details>
    <div className="flex flex-wrap items-center gap-2 border-y py-3"><span className="text-sm font-medium">{picked.length} selected · {filtered.length} matching</span><Button variant="outline" size="sm" onClick={() => pick(visible.map(r => r.transaction.id))}>Select all visible</Button><Button variant="outline" size="sm" onClick={() => pick(filtered.map(r => r.transaction.id))}>Select matching transactions</Button><Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear selection</Button><Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Bulk review category" className="w-full sm:w-56"><SelectValue placeholder="Assign category" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Button disabled={!picked.length || !category} onClick={showPreview}>Preview category changes</Button>{lastBatch && <Button variant="outline" onClick={async () => { await undoCategoryBatch(lastBatch); setLastBatch(null); toast.success("Original categories restored."); }}><Undo2 className="mr-1 size-4" />Undo correction</Button>}</div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!picked.length} onClick={previewSuggested}>Confirm suggested changes</Button>{selector("Sort by newest date", sort, setSort, [["date", "Newest date"], ["amount", "Highest amount"], ["merchant", "Merchant A–Z"]])}</div>
    <FinancialReviewIntelligence rows={filtered} commitments={commitments ?? []} onSelect={ids => setSelected(new Set(ids))} ruleExpense={picked[0]?.transaction} category={category} />
    <FinancialCorrectionPanel rows={picked} onSaved={() => setSelected(new Set())} />
    {!!picked.length && picked.some(r => r.group !== "category" && !(r.group === "ready" && r.suggestedCategory)) && <p className="text-sm text-muted-foreground">Bulk categories require resolved financial types and accounts, without duplicate or split conflicts. Review the other selected records first.</p>}
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.6fr)] xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0"><div className="hidden overflow-x-auto xl:block"><table className="w-full text-left text-xs"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Select</th>{["Date", "Merchant", "Account", "Amount", "Type / category", "Organisation", "Confidence / status"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{visible.map(r => { const e = r.transaction; return <tr key={e.id} className="border-b"><td className="p-2"><Checkbox aria-label={`Select ${e.title}`} checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} /></td><td className="whitespace-nowrap p-2">{e.date}</td><td className="max-w-48 p-2"><Button variant="link" className="h-auto whitespace-normal p-0 text-left text-xs" onClick={() => setDetail(e.id)}>{e.merchant || e.title}</Button></td><td className="p-2">{accounts.find(a => a.id === e.accountId)?.name ?? "Unknown"}</td><td className="whitespace-nowrap p-2 tabular-nums">{money(e.amount)}</td><td className="p-2">{TXN_LABEL[r.suggestedType ?? e.txnType ?? "expense"]}<br />{r.suggestedCategory ?? e.category}</td><td className="p-2">{e.department || "Unknown"}</td><td className="p-2">{r.confidence}<br />{r.status}</td></tr>; })}</tbody></table></div>
        <ul className="divide-y xl:hidden">{visible.map(r => { const e = r.transaction; return <li key={e.id} className="flex items-start gap-3 py-3"><Checkbox className="mt-1 shrink-0" aria-label={`Select ${e.title}`} checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} /><div className="min-w-0 flex-1"><Button variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left" onClick={() => setDetail(e.id)}>{e.merchant || e.title}</Button><p className="text-xs text-muted-foreground">{e.date} · {accounts.find(a => a.id === e.accountId)?.name ?? "Unknown account"}</p><p className="text-xs">{r.status} · {r.confidence}</p><p className="text-xs text-muted-foreground">{r.suggestedType ? `Proposed ${TXN_LABEL[r.suggestedType]}` : r.suggestedCategory ? `Suggested ${r.suggestedCategory}` : e.category}</p></div><span className="shrink-0 whitespace-nowrap text-sm tabular-nums">{money(e.amount)}</span></li>; })}</ul>
        {!filtered.length && <p className="py-8 text-center text-sm text-muted-foreground">No transactions match this review.</p>}{filtered.length > limit && <Button variant="outline" className="mt-3" onClick={() => setLimit(n => n + 40)}>Show more ({filtered.length - limit})</Button>}
      </div><aside className="hidden min-w-0 border-l pl-4 md:block">{evidence}</aside>
    </div>
    <Dialog open={!!focused && typeof window !== "undefined" && window.innerWidth < 768} onOpenChange={v => { if (!v) setDetail(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Transaction evidence</DialogTitle><DialogDescription>Saved information and proposed corrections</DialogDescription></DialogHeader>{evidence}</DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={v => { if (!v) setPreview(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Confirm category correction</DialogTitle><DialogDescription>{preview?.records.length} transactions · {preview ? money(preview.amount) : ""} reallocated to {preview?.category}</DialogDescription></DialogHeader><p className="text-sm">Balances, income, spending totals, original amounts, financial types and statement reconciliation remain unchanged. Only category reporting changes.</p><ul className="divide-y text-sm">{preview?.records.map(e => <li key={e.id} className="py-2"><p className="break-words font-medium">{e.date} · {e.title} · {money(e.amount)}</p><p className="text-xs text-muted-foreground">{e.id}</p><p>{e.category} → {preview.category}</p></li>)}</ul><p className="text-xs text-muted-foreground">An audited correction is saved. Undo is available unless a later edit conflicts.</p><div className="flex gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={apply}>Confirm category changes</Button></div></DialogContent></Dialog>
  </section>;
}