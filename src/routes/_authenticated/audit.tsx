import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Fold } from "@/components/Fold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { approvalHistory, entityObligations, groupBy, readinessTiles, reconHub, setFindingState } from "@/lib/books/audit";
import { closePeriod, POLICY, reopenPeriod } from "@/lib/books/periods";
import { missingInvoices } from "@/lib/gst-recon";
import { receivableStatus } from "@/lib/receivables";
import { useAuditAll } from "@/components/books/useAudit";
import { useBooks } from "@/components/books/useBooks";
import { fyRange, fyOf } from "@/lib/entities";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [
    { title: "Audit dashboard — Ledgerline" },
    { name: "description", content: "Audit readiness from verified records: reconciliations, open exceptions, closed periods and approvals in one place." },
    { property: "og:title", content: "Audit dashboard — Ledgerline" },
    { property: "og:description", content: "Audit readiness from verified records: reconciliations, open exceptions, closed periods and approvals in one place." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Audit,
});

const LEVEL = { automatic: "Done automatically", confirm: "Needs your confirmation", restricted: "Needs explicit approval" } as const;
type By = "risk" | "type" | "entity" | "fy" | "account" | "evidence";

function Audit() {
  const { transactions, documents, accounts, preferences } = useStore();
  const { books, save } = useBooks();
  const { open: items, reviewed } = useAuditAll();
  const entities = preferences.entities ?? [];
  const [by, setBy] = useState<By>("risk");
  const today = new Date().toISOString().slice(0, 10);
  const lastFy = fyOf(new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10));
  const [from, setFrom] = useState(fyRange(lastFy).start); const [to, setTo] = useState(fyRange(lastFy).end); const [note, setNote] = useState("");
  const obligations = useMemo(() => entities.flatMap((e) => entityObligations({ today, entities, books }, e.id)), [entities, books, today]);
  const tiles = useMemo(() => readinessTiles({ accounts, entries: transactions, items, books, docsMissing: missingInvoices(transactions, documents, 0).length, today, obligations, entitiesWithoutProfile: entities.filter((e) => !books.taxProfiles.some((p) => p.entityId === e.id)).length }), [accounts, transactions, items, books, documents, today, obligations, entities]);
  const history = useMemo(() => approvalHistory(books), [books]);
  const decide = async (key: string, status: "resolved" | "accepted" | "open") => {
    const note = status === "open" ? "" : window.prompt(status === "resolved" ? "What fixed it? (kept with the finding)" : "Why is this acceptable? (kept with the finding)") ?? "";
    if (status !== "open" && !note) return;
    try { await save({ findings: setFindingState(books.findings, key, status, note, new Date().toISOString()) }); toast.success(status === "open" ? "Finding reopened" : "Saved with your note"); } catch (e) { toast.error((e as Error).message); }
  };
  const hub = useMemo(() => reconHub(items, {
    cardUnrec: transactions.filter((t) => t.statementRef && !t.reconciledAt && accounts.find((a) => a.id === t.accountId)?.kind === "credit_card").length,
    loanUnrec: transactions.filter((t) => t.txnType === "loan_repayment" && !t.reconciledAt).length,
    suppliersMissing: missingInvoices(transactions, documents, 0).length,
    customersOpen: receivableStatus(preferences.receivables ?? [], transactions, today).filter((r) => !r.paidBy).length,
  }), [items, transactions, accounts, documents, preferences.receivables, today]);
  const groups = groupBy(items, by);
  const pending = books.proposedFields.filter((f) => f.status === "proposed");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <PageTitle title="Audit dashboard" sub={items.length ? `${items.length} open exceptions · they also appear in the Financial Inbox` : "Nothing open right now"} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{tiles.map((t) => <div key={t.label} className="rounded-2xl border bg-card p-3"><p className="text-[11px] text-muted-foreground">{t.label}</p><p className="font-mono text-lg font-semibold">{t.value}</p></div>)}</div>

      <Fold title="Reconciliations" hint="Bank, card, loan, supplier, customer, investment, intercompany, GST" defaultOpen>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{hub.map((h) => <Link key={h.kind} to={h.to} className="rounded-xl border px-3 py-2 text-sm"><span className="block text-xs text-muted-foreground">{h.kind}</span><b className={h.open ? "text-destructive" : "text-primary"}>{h.open ? `${h.open} open` : "Clear"}</b></Link>)}</div>
      </Fold>

      <div className="flex flex-wrap gap-1 text-xs">{(["risk", "type", "entity", "fy", "account", "evidence"] as By[]).map((b) => <button key={b} type="button" onClick={() => setBy(b)} className={`rounded-full border px-3 py-1 ${by === b ? "bg-primary text-primary-foreground" : "bg-card"}`}>By {b === "fy" ? "year" : b}</button>)}</div>
      {groups.map((g) => <section key={g.name} className="space-y-1"><h2 className="text-xs font-semibold uppercase text-muted-foreground">{g.name} · {g.items.length}</h2>
        {g.items.map((f) => <div key={f.key} className="rounded-2xl border bg-card px-4 py-3 text-sm">
          <Link to={f.to} className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words"><span className="mr-2 text-xs text-muted-foreground">{f.type}</span>{f.text}<span className="block text-[11px] text-muted-foreground">Evidence: {f.evidence}{f.fy ? ` · FY ${f.fy}` : ""}</span></span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${f.risk === "high" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{f.risk === "high" ? "Important" : f.risk === "medium" ? "Check" : "Low"}</span>
          </Link>
          <div className="mt-1 flex gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => decide(f.key, "resolved")}>Mark fixed</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => decide(f.key, "accepted")}>Accept with note</Button></div>
        </div>)}</section>)}

      {reviewed.length > 0 && <Fold title="Reviewed findings" hint={`${reviewed.length} marked fixed or accepted — still checked every time`}>
        <div className="space-y-1 text-sm">{reviewed.map((f) => <div key={f.key} className="flex items-start justify-between gap-2 rounded-xl border px-3 py-2"><span className="min-w-0 break-words">{f.text}<span className="block text-[11px] text-muted-foreground">{f.state.status === "resolved" ? "Fixed" : "Accepted"} {f.state.at.slice(0, 10)} · {f.state.note}</span></span><Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => decide(f.key, "open")}>Reopen</Button></div>)}</div>
      </Fold>}

      <Fold id="periods" title="Closed periods" hint={`${books.closedPeriods.length} closed · entries inside can't be changed`}>
        <div className="space-y-2 text-sm">
          {books.closedPeriods.map((p) => <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"><span>{p.from} → {p.to}<span className="block text-[11px] text-muted-foreground">Closed {p.closedOn}{p.note ? ` · ${p.note}` : ""}</span></span>
            <Button size="sm" variant="ghost" onClick={async () => { const reason = window.prompt("Reopening a closed period needs a reason (kept permanently):"); if (!reason) return; try { const r = reopenPeriod(books.closedPeriods, books.periodLog, p.id, reason, today); await save({ closedPeriods: r.periods, periodLog: r.log }); toast.success("Period reopened"); } catch (e) { toast.error((e as Error).message); } }}>Reopen</Button></div>)}
          <div className="grid grid-cols-2 gap-2"><label className="text-xs">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-xs">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Input className="col-span-2" placeholder="Note (e.g. FY audited and filed)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button size="sm" onClick={async () => { try { const r = closePeriod(books.closedPeriods, books.periodLog, from, to, note, today, crypto.randomUUID()); await save({ closedPeriods: r.periods, periodLog: r.log }); setNote(""); toast.success("Period closed"); } catch (e) { toast.error((e as Error).message); } }}>Close period</Button>
          {books.periodLog.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">History ({books.periodLog.length})</summary>{books.periodLog.slice().reverse().map((l, i) => <p key={i}>{l.at} · {l.action} · {l.reason}</p>)}</details>}
        </div>
      </Fold>

      <Fold title="Approval policy" hint="What runs automatically, what asks first, what needs explicit approval">
        <div className="grid gap-3 text-sm sm:grid-cols-3">{POLICY.map((p) => <div key={p.level}><p className="font-semibold">{LEVEL[p.level]}</p><ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{p.items.map((i) => <li key={i}>{i}</li>)}</ul></div>)}</div>
      </Fold>

      <Fold title="Approval history" hint={`${history.length} recorded decision${history.length === 1 ? "" : "s"}`}>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">No approvals recorded yet.</p>
          : <div className="space-y-1 text-xs">{history.slice(0, 200).map((h, i) => <p key={i} className="break-words"><span className="font-mono text-muted-foreground">{h.at}</span> · <b>{h.what}</b> · {h.detail}</p>)}</div>}
      </Fold>

      {pending.length > 0 && <Fold title="New fields found on documents" hint={`${pending.length} waiting — kept as document details until you approve`}>
        <div className="space-y-1 text-sm">{pending.map((f) => <div key={`${f.docType}:${f.label}`} className="flex items-center justify-between gap-2"><span>{f.label} <span className="text-xs text-muted-foreground">({f.docType.replace(/_/g, " ")}, seen {f.seen}×)</span></span>
          <span className="flex gap-1">{(["approved", "rejected"] as const).map((s) => <Button key={s} size="sm" variant="ghost" onClick={() => save({ proposedFields: books.proposedFields.map((x) => (x === f ? { ...x, status: s } : x)) })}>{s === "approved" ? "Keep as field" : "Ignore"}</Button>)}</span></div>)}
          <p className="text-[11px] text-muted-foreground">Approved fields stay searchable document details; no database columns are created automatically.</p></div>
      </Fold>}
    </div>
  );
}
