import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Undo2, SlidersHorizontal, CheckSquare, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { centreCategoryPreview, centreReview, matchesReview, REVIEW_FILTERS, selectedReviewSummary, selectReviewIds, MISSING_FIELDS, missingFieldMatches, type MissingField, type ReviewFilter } from "@/lib/review-centre";
import { reviewCohorts } from "@/lib/financial-review-intelligence";
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
import { ReviewMappingPanel } from "./ReviewMappingPanel";
import { ReviewRecurringPanel } from "./ReviewRecurringPanel";
import { recurringSeed } from "@/lib/review-recurring";
import { verifiedRecovery } from '@/lib/review-recovery';
import { readReviewContext, writeReviewContext } from '@/lib/offline';

export function FinancialReview({ items, onOpen, initialFilter = "all" }: { items: InboxItem[]; onOpen: (e: Expense) => void; initialFilter?: ReviewFilter }) {
  const { transactions, accounts, preferences, commitments, bulkSetCategory, undoCategoryBatch, userId } = useStore();
  const categories = preferences.categories.filter(c => !c.archived && c.name !== "Miscellaneous").map(c => c.name);
  const [rules, setRules] = useState<ImportRule[]>([]);
  const [ruleStatus, setRuleStatus] = useState("Loading classification rules…");
  const loadRules = async () => { try { setRules(await listImportRules()); setRuleStatus(""); } catch { setRuleStatus("Classification rules could not load. Other evidence remains available."); } };
  useEffect(() => { let active = true; void listImportRules().then(result => { if (active) { setRules(result); setRuleStatus(""); } }).catch(() => { if (active) setRuleStatus("Classification rules could not load. Other evidence remains available."); }); return () => { active = false; }; }, []);
  const rows = useMemo(() => applyReviewRules(centreReview(items, transactions, accounts, categories), rules, categories), [items, transactions, accounts, preferences.categories, rules]);
  const [group, setGroup] = useState<ReviewFilter>(initialFilter);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [action, setAction] = useState<"category" | "financial" | "rules" | "mapping" | "recurring" | null>(null);
  const [missingField, setMissingField] = useState<MissingField>('all');
  const [view, setView] = useState("transactions");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof centreCategoryPreview> | null>(null);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const filtered = rows.filter(r => {
    const e = r.transaction;
    return matchesReview(r, group) && missingFieldMatches(r, missingField) && (account === "all" || e.accountId === account) &&
      (workspace === "all" || e.scope === workspace) && (organisation === "all" || e.department === organisation) &&
      (confidence === "all" || r.confidence === confidence) && (!from || e.date >= from) && (!to || e.date <= to) &&
      (!minimum || e.amount >= Number(minimum)) && (!maximum || e.amount <= Number(maximum)) &&
      `${e.title} ${e.merchant ?? ""} ${e.description} ${e.department ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });
  filtered.sort((a, b) => sort === "amount" ? b.transaction.amount - a.transaction.amount : sort === "merchant" ? (a.transaction.merchant ?? a.transaction.title).localeCompare(b.transaction.merchant ?? b.transaction.title) : b.transaction.date.localeCompare(a.transaction.date));
  const visible = filtered.slice(0, limit);
  const picked = rows.filter(r => selected.has(r.transaction.id));
  const focused = rows.find(r => r.transaction.id === detail);
  const recovery = focused ? verifiedRecovery(focused.transaction, accounts, preferences) : null;
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const pick = (ids: string[]) => setSelected(prev => selectReviewIds(prev, rows.filter(r => ids.includes(r.transaction.id))));
  const summary = selectedReviewSummary(picked);
  const cohorts = reviewCohorts(filtered, commitments ?? []);
  const [saveError, setSaveError] = useState("");
  const [completed, setCompleted] = useState(0);
  useEffect(() => { setGroup(initialFilter); }, [initialFilter]);
  const [contextReady, setContextReady] = useState(false);
  const [contextStatus, setContextStatus] = useState('');
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const media = window.matchMedia('(max-width: 767px)'); const update = () => setNarrow(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  useEffect(() => {
    let active = true;
    if (!userId) { setContextReady(true); return; }
    void readReviewContext(userId).then(saved => {
      if (!active || !saved) return;
      setSelected(new Set(saved.selected)); setQuery(saved.query); setCategory(saved.category);
      setAccount(saved.account); setWorkspace(saved.workspace); setOrganisation(saved.organisation);
      if (initialFilter === 'all' && saved.group in REVIEW_FILTERS) setGroup(saved.group as ReviewFilter);
      if (saved.selected.length) setContextStatus('Unconfirmed review restored on this device.');
    }).catch(() => { if (active) setContextStatus('Review context could not restore.'); }).finally(() => { if (active) setContextReady(true); });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!contextReady || !userId) return;
    const timer = setTimeout(() => { void writeReviewContext(userId, { selected: [...selected], query, group, category, account, workspace, organisation }).catch(() => setContextStatus('Unfinished selection could not save on this device.')); }, 250);
    return () => clearTimeout(timer);
  }, [contextReady, userId, selected, query, group, category, account, workspace, organisation]);
  const selector = (label: string, value: string, set: (v: string) => void, options: [string, string][]) => <Select value={value} onValueChange={set}><SelectTrigger aria-label={label} className="min-w-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{label}</SelectItem>{options.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>;
  const showPreview = () => { try { setSaveError(''); setPreview(centreCategoryPreview(picked, category)); } catch (e) { toast.error((e as Error).message); } };
  const previewSuggested = () => {
    const category = picked[0]?.suggestedCategory;
    if (!category || picked.some(r => r.group !== "ready" || r.suggestedCategory !== category)) { toast.error("Select ready suggestions for one category. Other categories need separate confirmation."); return; }
    try { setPreview(centreCategoryPreview(picked, category)); } catch (e) { toast.error((e as Error).message); }
  };
  const apply = async () => {
    if (!preview) return;
    if (!categories.includes(preview.category) || !previewStillCurrent(preview, transactions)) { toast.error("These records changed. Close this preview and review the latest changes."); return; }
    const currentRows = rows.filter(r => preview.records.some(e => e.id === r.transaction.id));
    categoryReviewPreview(currentRows, preview.category);
    const signature = `${preview.fingerprint}|${preview.category}`;
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    let id: string;
    try { id = await bulkSetCategory(preview.records.map(e => e.id), preview.category, operation.current.id); setSaveError(""); setCompleted(preview.records.length); } catch (e) { setSaveError(e instanceof Error ? e.message : "Save failed"); return; }
    const excludedIds = new Set(preview.excluded.map(e => e.id));
    setLastBatch(id); operation.current = null; setPreview(null); setSelected(excludedIds);
    toast.success("Categories saved. Account balances and reconciliation are unchanged.");
  };
  const evidence = focused ? <div className="space-y-3"><h3 className="break-words font-semibold">{focused.transaction.title}</h3><p className="text-sm">{focused.status} · {focused.confidence} confidence</p><div className="text-sm"><p>{focused.transaction.date} · {money(focused.transaction.amount)}</p><p>Account: {accounts.find(a => a.id === focused.transaction.accountId)?.name ?? "Unknown"}</p><p>Saved type: {TXN_LABEL[focused.transaction.txnType ?? "expense"]}</p><p>Organisation: {focused.transaction.department || "Unknown"}</p></div><ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">{focused.evidence.map((s, i) => <li key={i}>{s}</li>)}</ul>{focused.suggestedType && <p className="text-sm font-medium">Proposed: {TXN_LABEL[focused.suggestedType]}{focused.targetAccountIds.length === 1 ? ` → ${accounts.find(a => a.id === focused.targetAccountIds[0])?.name}` : " · receiving account needs confirmation"}</p>}<div className="border-t pt-3"><p className="text-xs font-medium text-muted-foreground">Saved narration (not changed by this review)</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{focused.transaction.description || "Not available in this record"}</p><p className="mt-2 break-words text-xs text-muted-foreground">Statement reference: {focused.transaction.statementRef || "Unknown"}</p></div><Button variant="outline" onClick={() => onOpen(focused.transaction)}>Review transaction</Button></div> : <p className="text-sm text-muted-foreground">No transaction selected.</p>;

  return <section className="space-y-4" aria-label="Smart financial review">
    {contextStatus && <p role="status" className="text-xs text-muted-foreground">{contextStatus}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">{rows.length} transactions needing attention</h2>{completed > 0 && <p role="status" className="text-sm text-success">Category correction applied to {completed} transactions. Remaining issues stay in review.</p>}</div><Button asChild variant="outline" size="sm"><Link to="/historical-import">Statement imports</Link></Button></div>
    {ruleStatus && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><p>{ruleStatus}</p>{ruleStatus.includes("could not") && <Button variant="ghost" size="sm" onClick={loadRules}>Retry rules</Button>}</div>}
    <div className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1 basis-48" aria-label="Search financial review" placeholder="Search merchant or narration" value={query} onChange={e => setQuery(e.target.value)} /><Select value={group} onValueChange={v => { setGroup(v as ReviewFilter); setLimit(40); }}><SelectTrigger className="w-full sm:w-56" aria-label="Review issue filter"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(REVIEW_FILTERS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}><SlidersHorizontal />Filters</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><CheckSquare />Select<ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => pick(visible.map(r => r.transaction.id))}>Select all visible ({visible.length})</DropdownMenuItem><DropdownMenuItem onSelect={() => pick(filtered.map(r => r.transaction.id))}>Select all matching ({filtered.length})</DropdownMenuItem><DropdownMenuItem onSelect={() => pick(visible.map(r => r.transaction.id))}>Select current page ({visible.length})</DropdownMenuItem><DropdownMenuItem disabled={!focused?.transaction.merchant} onSelect={() => { const cohort = cohorts.find(c => c.rows.some(r => r.transaction.id === detail)); if (cohort) pick(cohort.rows.map(r => r.transaction.id)); else if (focused) pick([focused.transaction.id]); }}>Select current merchant group</DropdownMenuItem><DropdownMenuItem onSelect={() => setSelected(new Set())}>Clear selection</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    {group === "missing" && <Select value={missingField} onValueChange={v => setMissingField(v as MissingField)}><SelectTrigger aria-label="Missing field filter" className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(MISSING_FIELDS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>}
    {filtersOpen && <div className="space-y-3 border-y py-3"><div className="grid gap-2 sm:grid-cols-3">{selector("All accounts", account, setAccount, accounts.map(a => [a.id, a.name]))}{selector("All workspaces", workspace, setWorkspace, Object.entries(SCOPE_LABEL))}{selector("All organisations", organisation, setOrganisation, [...new Set(rows.map(r => r.transaction.department).filter((x): x is string => !!x))].map(x => [x, x]))}</div><div className="grid grid-cols-2 gap-2 lg:grid-cols-5"><label className="text-xs">From<Input aria-label="Review from date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-xs">To<Input aria-label="Review to date" type="date" value={to} onChange={e => setTo(e.target.value)} /></label><label className="text-xs">Minimum ₹<Input type="number" min="0" value={minimum} onChange={e => setMinimum(e.target.value)} /></label><label className="text-xs">Maximum ₹<Input type="number" min="0" value={maximum} onChange={e => setMaximum(e.target.value)} /></label>{selector("All confidence", confidence, setConfidence, ["high", "medium", "low"].map(x => [x, x]))}</div><Button size="sm" variant="ghost" onClick={() => { setQuery(""); setAccount("all"); setWorkspace("all"); setOrganisation("all"); setConfidence("all"); setFrom(""); setTo(""); setMinimum(""); setMaximum(""); setGroup("all"); setMissingField("all"); }}>Reset filters</Button></div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{filtered.length} matching · {visible.length} shown</p><div className="flex gap-2"><Select value={view} onValueChange={setView}><SelectTrigger aria-label="Review view" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="transactions">Transactions</SelectItem><SelectItem value="merchants">Merchant groups</SelectItem></SelectContent></Select><Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="Review sort" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="date">Newest date</SelectItem><SelectItem value="amount">Highest amount</SelectItem><SelectItem value="merchant">Merchant A–Z</SelectItem></SelectContent></Select></div></div>
    {picked.length > 0 && <div className="sticky top-24 z-20 space-y-2 border bg-background p-3 shadow-sm" role="region" aria-label="Selected transaction summary"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{picked.length} transactions selected</strong><Button variant="ghost" size="sm" onClick={() => { setSelected(new Set()); setAction(null); }}>Clear selection</Button></div><p className="text-xs">Selected transaction total: <span className="tabular-nums">{money(summary.total)}</span> · {summary.accounts} accounts · {summary.organisations.length} organisations</p><p className="text-xs text-muted-foreground">{summary.types.map(t => TXN_LABEL[t]).join(" / ")} · {summary.missing} missing information · {summary.conflicts} conflicts</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setAction("category")}>Categorise</Button><Button size="sm" variant="outline" onClick={() => setAction("financial")}>Account & financial type</Button><Button size="sm" variant="outline" onClick={() => setAction("mapping")}>Organisation & activity</Button><Button size="sm" variant="outline" onClick={() => { const entry = picked[0]?.transaction; if (!entry) return; try { recurringSeed(entry, null); setAction("recurring"); } catch (e) { toast.error((e as Error).message); } }}>Mark recurring</Button><Button size="sm" variant="outline" onClick={() => setAction("rules")}>Merchant rules</Button><Button size="sm" variant="ghost" onClick={() => { if (picked[0]) onOpen(picked[0].transaction); }}>Other details</Button></div></div>}
    {lastBatch && <Button variant="outline" size="sm" onClick={async () => { await undoCategoryBatch(lastBatch); setLastBatch(null); toast.success("Original categories restored."); }}><Undo2 />Undo correction</Button>}
    {view === "merchants" && <ul className="divide-y">{cohorts.map(c => <li key={c.key} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><h3 className="break-words font-medium">{c.label}</h3><p className="text-xs text-muted-foreground">{c.rows.length} transactions · selected transaction value {money(selectedReviewSummary(c.rows).total)} · {c.rows[0]?.confidence} confidence</p><p className="text-xs">{c.rows[0]?.transaction.department || "Organisation unknown"} · {c.rows[0]?.suggestedCategory ? `Suggested ${c.rows[0].suggestedCategory}` : "Classification needs review"}</p>{c.cadence && <p className="text-xs text-muted-foreground">Possible {c.cadence}-day recurring pattern · {c.profileIds.length} existing profiles</p>}</div><Button variant="outline" size="sm" onClick={() => pick(c.rows.map(r => r.transaction.id))}>Select group</Button></li>)}{!cohorts.length && <li className="py-4 text-sm text-muted-foreground">No safely comparable merchant groups. Individual transactions remain below.</li>}</ul>}
    {!!picked.length && picked.some(r => r.group !== "category" && !(r.group === "ready" && r.suggestedCategory)) && <p className="text-sm text-muted-foreground">Bulk categories require resolved financial types and accounts, without duplicate or split conflicts. Review the other selected records first.</p>}
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.6fr)] xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0"><div className="hidden overflow-x-auto xl:block"><table className="w-full text-left text-xs"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Select</th>{["Date", "Merchant", "Account", "Amount", "Type / category", "Organisation", "Confidence / status"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{visible.map(r => { const e = r.transaction; return <tr key={e.id} className="border-b"><td className="p-2"><Checkbox aria-label={`Select ${e.title}`} checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} /></td><td className="whitespace-nowrap p-2">{e.date}</td><td className="max-w-48 p-2"><Button variant="link" className="h-auto whitespace-normal p-0 text-left text-xs" onClick={() => setDetail(e.id)}>{e.merchant || e.title}</Button></td><td className="p-2">{accounts.find(a => a.id === e.accountId)?.name ?? "Unknown"}</td><td className="whitespace-nowrap p-2 tabular-nums">{money(e.amount)}</td><td className="p-2">{TXN_LABEL[r.suggestedType ?? e.txnType ?? "expense"]}<br />{r.suggestedCategory ?? e.category}</td><td className="p-2">{e.department || "Unknown"}</td><td className="p-2">{r.confidence}<br />{r.status}</td></tr>; })}</tbody></table></div>
        <ul className="divide-y xl:hidden">{visible.map(r => { const e = r.transaction; return <li key={e.id} className="flex items-start gap-3 py-3"><Checkbox className="mt-1 shrink-0" aria-label={`Select ${e.title}`} checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} /><div className="min-w-0 flex-1"><Button variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left" onClick={() => setDetail(e.id)}>{e.merchant || e.title}</Button><p className="text-xs text-muted-foreground">{e.date} · {accounts.find(a => a.id === e.accountId)?.name ?? "Unknown account"}</p><p className="text-xs">{r.status} · {r.confidence}</p><p className="text-xs text-muted-foreground">{r.suggestedType ? `Proposed ${TXN_LABEL[r.suggestedType]}` : r.suggestedCategory ? `Suggested ${r.suggestedCategory}` : e.category}</p></div><span className="shrink-0 whitespace-nowrap text-sm tabular-nums">{money(e.amount)}</span></li>; })}</ul>
        {!filtered.length && <p className="py-8 text-center text-sm text-muted-foreground">No transactions match this review.</p>}{filtered.length > limit && <Button variant="outline" className="mt-3" onClick={() => setLimit(n => n + 40)}>Show more ({filtered.length - limit})</Button>}
      </div><aside className="hidden min-w-0 self-start border-l pl-4 md:sticky md:top-48 md:block">{evidence}</aside>
    </div>
    <Dialog open={!!focused && narrow} onOpenChange={v => { if (!v) setDetail(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Transaction evidence</DialogTitle><DialogDescription>Saved information and proposed corrections</DialogDescription></DialogHeader>{evidence}</DialogContent></Dialog>
    <Dialog open={action === "category"} onOpenChange={v => { if (!v) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>Categorise selected transactions</DialogTitle><DialogDescription>{picked.length} transactions selected · review before applying</DialogDescription></DialogHeader><Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Bulk review category"><SelectValue placeholder="Assign category" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Button disabled={!picked.length || !category} onClick={() => { showPreview(); setAction(null); }}>Preview category changes</Button><Button variant="outline" onClick={() => { previewSuggested(); setAction(null); }}>Apply suggested category</Button><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button></DialogContent></Dialog>
    <Dialog open={action === "financial"} onOpenChange={v => { if (!v) setAction(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Account & financial type</DialogTitle><DialogDescription>{picked.length} transactions · source money stays unchanged</DialogDescription></DialogHeader>{action === "financial" && <FinancialCorrectionPanel rows={picked} onSaved={() => { setSelected(new Set()); setAction(null); }} />}</DialogContent></Dialog>
    <Dialog open={action === "mapping"} onOpenChange={v => { if (!v) setAction(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Organisation & activity mapping</DialogTitle><DialogDescription>{picked.length} selected transactions · preview before saving</DialogDescription></DialogHeader>{action === "mapping" && <ReviewMappingPanel rows={picked} onSaved={excluded => { setSelected(new Set(excluded)); setAction(null); toast.success("Mapping applied. Remaining issues stay under review."); }} />}</DialogContent></Dialog>
    <Dialog open={action === "recurring"} onOpenChange={v => { if (!v) setAction(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Recurring payment profile</DialogTitle><DialogDescription>One selected merchant · planned payment, not a new expense</DialogDescription></DialogHeader>{action === "recurring" && picked[0] && <ReviewRecurringPanel expense={picked[0].transaction} cadence={cohorts.find(c => c.rows.some(r => r.transaction.id === picked[0]?.transaction.id))?.cadence ?? null} onSaved={() => { setAction(null); toast.success("Recurring profile saved. Existing transactions are unchanged."); }} />}</DialogContent></Dialog>
    <Dialog open={action === "rules"} onOpenChange={v => { if (!v) setAction(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Merchant classifications</DialogTitle><DialogDescription>Confirmed rules and recurring hints</DialogDescription></DialogHeader><FinancialReviewIntelligence rows={filtered} commitments={commitments ?? []} onSelect={ids => setSelected(new Set(ids))} ruleExpense={picked[0]?.transaction} category={category} /></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={v => { if (!v) setPreview(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Confirm category correction</DialogTitle><DialogDescription>{preview?.records.length} transactions · {preview ? money(preview.amount) : ""} reallocated to {preview?.category}</DialogDescription></DialogHeader><p className="text-sm">{preview?.selectedCount} selected · {preview?.records.length} included · {preview?.excluded.length} excluded · {preview?.remainingIssues} remaining issues</p>{!!preview?.excluded.length && <details><summary className="cursor-pointer text-sm font-medium">Excluded transactions</summary><ul className="space-y-2 text-xs">{preview.excluded.map(e => <li key={e.id}>{e.title} · {e.reason}</li>)}</ul></details>}<p className="text-sm">Balances, income, spending totals, original amounts, financial types and statement reconciliation remain unchanged. Only category reporting changes.</p><ul className="divide-y text-sm">{preview?.records.map(e => <li key={e.id} className="py-2"><p className="break-words font-medium">{e.date} · {e.title} · {money(e.amount)}</p><p className="text-xs text-muted-foreground">{e.id}</p><p>{e.category} → {preview.category}</p></li>)}</ul>{saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}<p className="text-xs text-muted-foreground">An audited correction is saved. Undo is available unless a later edit conflicts.</p><div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button loadingText="Applying changes…" onClick={apply}>{saveError ? "Unable to Save — Retry" : "Confirm & Apply Changes"}</Button></div></DialogContent></Dialog>
  </section>;
}