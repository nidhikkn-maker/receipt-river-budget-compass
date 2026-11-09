import { csvCell } from "@/lib/csv-safe";
import { SectionTabs } from "@/components/SectionTabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { money, type StatementLine } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { selectVisible, setChecked } from "@/lib/audit-checked";
import { AUDIT_FROM, AUDIT_LABEL, auditRecords, type AuditFinding, type AuditIssue, type AuditStatement } from "@/lib/transfer-audit";

export const Route = createFileRoute("/_authenticated/records-check")({
  head: () => ({
    meta: [
      { title: "Records check · Thapal" },
      { name: "description", content: "Read-only review of records from April 2026 against your uploaded statements." },
      { property: "og:title", content: "Records check · Thapal" },
      { property: "og:description", content: "Find misclassified transfers, duplicates and statement gaps without changing data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecordsCheck,
});

function RecordsCheck() {
  const { transactions, accounts, preferences, savePreferences } = useStore();
  const [limit, setLimit] = useState(30);
  const [showChecked, setShowChecked] = useState(false);
  const checked = useMemo(() => new Set(preferences.checkedAudit ?? []), [preferences.checkedAudit]);
  const [statements, setStatements] = useState<AuditStatement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issue, setIssue] = useState<AuditIssue | "all">("all");
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await supabase.from("import_batches").select("id,account_id,currency,raw_lines,period_from,period_to,status").neq("status", "cancelled");
      if (!live) return;
      if (r.error) { setError("Uploaded statements could not load. Retry in a moment."); return; }
      setStatements((r.data ?? []).map((b) => ({ id: b.id, accountId: b.account_id, currency: b.currency, lines: Array.isArray(b.raw_lines) ? (b.raw_lines as unknown as StatementLine[]) : [], from: b.period_from, to: b.period_to })));
    })();
    return () => { live = false; };
  }, []);

  const findings = useMemo(() => (statements ? auditRecords(transactions, accounts, statements) : []), [transactions, accounts, statements]);
  const counts = useMemo(() => findings.reduce<Record<string, number>>((a, f) => ({ ...a, [f.issue]: (a[f.issue] ?? 0) + 1 }), {}), [findings]);
  const open = findings.filter((f) => !checked.has(f.key));
  const shown = (showChecked ? findings.filter((f) => checked.has(f.key)) : open).filter((f) => issue === "all" || f.issue === issue);
  const batchAccount = (id?: string) => statements?.find((b) => b.id === id)?.accountId;
  const setCheckedKeys = async (keys: string[], on: boolean) => {
    const next = setChecked([...checked], keys, on);
    try {
      await savePreferences({ ...preferences, checkedAudit: next });
      setPicked((p) => p.filter((k) => !keys.includes(k)));
      toast.success(on ? `${keys.length} marked as checked` : `${keys.length} moved back to open`, on ? { action: { label: "Undo", onClick: () => void setCheckedKeys(keys, false) } } : undefined);
    } catch { toast.error("Couldn’t save. Nothing changed — try again."); }
  };
  const chosen = findings.filter((f) => picked.includes(f.key));
  const nextEntry = chosen.find((f) => f.entryId);
  const nextLine = chosen.find((f) => f.issue === "missing_in_ledger");

  const exportCsv = () => {
    const head = ["Reference", "Date", "Source", "Destination", "Amount", "Currency", "Current type", "Suggested type", "Issue", "Proposed correction", "Confidence", "Expected impact"];
    const rows = (chosen.length ? chosen : shown).map((f) => [f.reference, f.date, f.source, f.destination, f.amount, f.currency, f.currentType, f.suggestedType, AUDIT_LABEL[f.issue], f.proposal, f.confidence, f.impact]);
    const csv = [head, ...rows].map((r) => r.map((c) => csvCell(c)).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "records-check.csv"; a.click();
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SectionTabs group="health" active="records" />
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Records check</h1>
      <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Read-only · from {AUDIT_FROM} · compared with {statements?.length ?? "…"} uploaded statements. Marking items checked only tidies this list; it never changes your records.</p>

      {error && <Card title="Couldn’t load statements" className="mt-4"><p role="alert" className="text-sm text-destructive">{error}</p></Card>}
      {!statements && !error && <p className="mt-6 text-sm text-muted-foreground">Checking your records against uploaded statements…</p>}

      {statements && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant={!showChecked ? "default" : "outline"} onClick={() => { setShowChecked(false); setPicked([]); }}>Open {open.length}</Button>
            <Button size="sm" variant={showChecked ? "default" : "outline"} onClick={() => { setShowChecked(true); setPicked([]); }}>Checked {findings.length - open.length}</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button className="h-auto min-h-9 whitespace-normal text-left" size="sm" variant={issue === "all" ? "secondary" : "outline"} onClick={() => setIssue("all")}>All types</Button>
            {(Object.keys(AUDIT_LABEL) as AuditIssue[]).filter((k) => counts[k]).map((k) => (
              <Button key={k} className="h-auto min-h-9 whitespace-normal text-left" size="sm" variant={issue === k ? "secondary" : "outline"} onClick={() => setIssue(k)}>{AUDIT_LABEL[k]} {counts[k]}</Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Button size="sm" variant="ghost" onClick={() => setPicked(selectVisible(picked, shown.map((f) => f.key)))}>Select visible</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Clear</Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>Export {chosen.length ? `${chosen.length} selected` : "report"} (CSV)</Button>
          </div>
          {chosen.length > 0 && (
            <div className="sticky top-2 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
              <span className="w-full text-sm font-medium sm:w-auto">{chosen.length} selected</span>
              {showChecked
                ? <Button size="sm" variant="outline" onClick={() => setCheckedKeys(chosen.map((f) => f.key), false)}><RotateCcw className="mr-1 h-4 w-4" />Move back to open</Button>
                : <Button size="sm" onClick={() => setCheckedKeys(chosen.map((f) => f.key), true)}><CheckCircle2 className="mr-1 h-4 w-4" />Mark as checked</Button>}
              {nextEntry && <Button asChild size="sm" variant="outline"><Link to="/new" search={{ edit: nextEntry.entryId! }}>Fix entries one by one</Link></Button>}
              {nextLine && <Button asChild size="sm" variant="outline"><Link to="/new" search={draftFor(nextLine, batchAccount(nextLine.batchId))}><Plus className="mr-1 h-4 w-4" />Add lines one by one</Link></Button>}
              <p className="w-full text-xs text-muted-foreground">“Mark as checked” only hides items from this list. Fixes and new entries are always previewed and saved by you on the next page.</p>
            </div>
          )}
          {findings.length > 0 && shown.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{showChecked ? "Nothing marked as checked here yet." : "Everything here is checked."}</p>}
          {findings.length === 0 && <Card title="No issues found" className="mt-4"><p className="text-sm text-muted-foreground">Your records since April 2026 agree with the uploaded statements.</p></Card>}
          <ul className="mt-3 divide-y rounded-2xl border bg-card">
            {shown.slice(0, limit).map((f) => (
              <li key={f.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 p-3 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <Checkbox className="mt-1 h-5 w-5" aria-label={`Select ${f.reference}`} checked={picked.includes(f.key)} onCheckedChange={(v) => setPicked(v ? [...picked, f.key] : picked.filter((k) => k !== f.key))} />
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{AUDIT_LABEL[f.issue]}</span><span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + (f.confidence === "high" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>{f.confidence} confidence</span></div>
                  <div className="break-words text-xs text-muted-foreground">{f.date} · {f.source} → {f.destination} · ref {f.reference}</div>
                  <div className="text-xs">Now: {f.currentType} · Suggested: {f.suggestedType}</div>
                  <div className="text-xs text-muted-foreground">{f.proposal} · {f.impact}</div>
                </div>
                <div className="whitespace-nowrap text-right font-mono text-sm font-semibold">{money(f.amount, f.currency)}</div>
                <div className="col-span-2 col-start-2 flex flex-wrap gap-2 md:col-span-1 md:col-start-auto md:justify-end">
                  {f.entryId
                    ? <Button asChild size="sm" variant="outline" className="flex-1 md:flex-none"><Link to="/new" search={{ edit: f.entryId }}>{f.issue === "missing_in_statement" ? "Open entry" : "Fix entry"}</Link></Button>
                    : f.issue === "missing_in_ledger"
                      ? <Button asChild size="sm" variant="outline" className="flex-1 md:flex-none"><Link to="/new" search={draftFor(f, batchAccount(f.batchId))}><Plus className="mr-1 h-4 w-4" />Add to records</Link></Button>
                      : null}
                  {!f.entryId && <Button asChild size="sm" variant="ghost" className="flex-1 md:flex-none"><Link to="/inbox" search={{ section: "statements" }}>View statement</Link></Button>}
                  {checked.has(f.key)
                    ? <Button size="sm" variant="ghost" className="flex-1 md:flex-none" onClick={() => setCheckedKeys([f.key], false)}><RotateCcw className="mr-1 h-4 w-4" />Reopen</Button>
                    : <Button size="sm" variant="ghost" className="flex-1 md:flex-none" onClick={() => setCheckedKeys([f.key], true)}><CheckCircle2 className="mr-1 h-4 w-4" />Checked</Button>}
                </div>
              </li>
            ))}
          </ul>
          {shown.length > limit && <Button variant="ghost" className="mt-2 h-11 w-full" onClick={() => setLimit((n) => n + 30)}>Show 30 more · {shown.length - limit} left</Button>}
          {shown.length > 300 && <p className="mt-2 text-xs text-muted-foreground">Showing 300 of {shown.length}. Use the filters or export the full report.</p>}
        </>
      )}
    </div>
  );
}

/** Prefilled draft only — the entry page never saves without the user pressing Save. */
function draftFor(f: AuditFinding, account?: string) {
  const d: { amount: number; currency: string; date: string; title?: string; account?: string } = { amount: f.amount, currency: f.currency, date: f.date };
  if (f.reference && f.reference !== "—") d.title = f.reference.slice(0, 160);
  if (account) d.account = account;
  return d;
}
