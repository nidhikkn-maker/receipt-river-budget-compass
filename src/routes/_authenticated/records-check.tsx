import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { money, type StatementLine } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { AUDIT_FROM, AUDIT_LABEL, auditRecords, type AuditIssue, type AuditStatement } from "@/lib/transfer-audit";

export const Route = createFileRoute("/_authenticated/records-check")({
  head: () => ({
    meta: [
      { title: "Records check · Ledgerline" },
      { name: "description", content: "Read-only review of records from April 2026 against your uploaded statements." },
      { property: "og:title", content: "Records check · Ledgerline" },
      { property: "og:description", content: "Find misclassified transfers, duplicates and statement gaps without changing data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecordsCheck,
});

function RecordsCheck() {
  const { transactions, accounts } = useStore();
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
  const shown = findings.filter((f) => issue === "all" || f.issue === issue);
  const chosen = findings.filter((f) => picked.includes(f.key));

  const exportCsv = () => {
    const head = ["Reference", "Date", "Source", "Destination", "Amount", "Currency", "Current type", "Suggested type", "Issue", "Proposed correction", "Confidence", "Expected impact"];
    const rows = (chosen.length ? chosen : shown).map((f) => [f.reference, f.date, f.source, f.destination, f.amount, f.currency, f.currentType, f.suggestedType, AUDIT_LABEL[f.issue], f.proposal, f.confidence, f.impact]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "records-check.csv"; a.click();
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Records check</h1>
      <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Read-only · from {AUDIT_FROM} · compared with {statements?.length ?? "…"} uploaded statements. Nothing here changes your data.</p>

      {error && <Card title="Couldn’t load statements" className="mt-4"><p role="alert" className="text-sm text-destructive">{error}</p></Card>}
      {!statements && !error && <p className="mt-6 text-sm text-muted-foreground">Checking your records against uploaded statements…</p>}

      {statements && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="h-auto min-h-9 whitespace-normal text-left" size="sm" variant={issue === "all" ? "default" : "outline"} onClick={() => setIssue("all")}>All {findings.length}</Button>
            {(Object.keys(AUDIT_LABEL) as AuditIssue[]).filter((k) => counts[k]).map((k) => (
              <Button key={k} className="h-auto min-h-9 whitespace-normal text-left" size="sm" variant={issue === k ? "default" : "outline"} onClick={() => setIssue(k)}>{AUDIT_LABEL[k]} {counts[k]}</Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Button size="sm" variant="ghost" onClick={() => setPicked(shown.map((f) => f.key))}>Select visible</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Clear</Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>Export {chosen.length ? `${chosen.length} selected` : "report"} (CSV)</Button>
            {chosen.length > 0 && <span className="w-full text-muted-foreground sm:w-auto">Open each selected item to preview and confirm a correction.</span>}
          </div>
          {findings.length === 0 && <Card title="No issues found" className="mt-4"><p className="text-sm text-muted-foreground">Your records since April 2026 agree with the uploaded statements.</p></Card>}
          <ul className="mt-3 divide-y rounded-2xl border bg-card">
            {shown.slice(0, 300).map((f) => (
              <li key={f.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 p-3 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <Checkbox className="mt-1 h-5 w-5" aria-label={`Select ${f.reference}`} checked={picked.includes(f.key)} onCheckedChange={(v) => setPicked(v ? [...picked, f.key] : picked.filter((k) => k !== f.key))} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{AUDIT_LABEL[f.issue]}</span><span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + (f.confidence === "high" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>{f.confidence} confidence</span></div>
                  <div className="break-words text-xs text-muted-foreground">{f.date} · {f.source} → {f.destination} · ref {f.reference}</div>
                  <div className="text-xs">Now: {f.currentType} · Suggested: {f.suggestedType}</div>
                  <div className="text-xs text-muted-foreground">{f.proposal} · {f.impact}</div>
                </div>
                <div className="whitespace-nowrap text-right font-mono text-sm font-semibold">{money(f.amount, f.currency)}</div>
                <div className="col-span-2 col-start-2 md:col-span-1 md:col-start-auto">{f.entryId ? <Button asChild size="sm" variant="outline" className="w-full md:w-auto"><Link to="/new" search={{ edit: f.entryId }}>Review</Link></Button>
                  : <Button asChild size="sm" variant="outline" className="w-full md:w-auto"><Link to="/inbox" search={{ section: "statements" }}>Review</Link></Button>}</div>
              </li>
            ))}
          </ul>
          {shown.length > 300 && <p className="mt-2 text-xs text-muted-foreground">Showing 300 of {shown.length}. Use the filters or export the full report.</p>}
        </>
      )}
    </div>
  );
}
