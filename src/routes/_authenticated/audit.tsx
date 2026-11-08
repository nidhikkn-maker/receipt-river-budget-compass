import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { evidenceCsv, registerEvidence } from "@/lib/books/evidence";
import { derivedEvidence } from "@/lib/books/derived-evidence";
import { downloadBlob } from "@/lib/reports";
import { Fold } from "@/components/Fold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { loanRecon, supplierRecon, customerRecon, investmentRecon, intercompanyRecon } from "@/lib/books/recon";
import { accountBalance, balanceAsOf } from "@/lib/ledger";
import { buildPeriodFigures } from "@/lib/books/period-figures";
import { useDemat } from "@/components/books/useBooks";
import { fieldExtensionPlan } from "@/lib/books/intake";
import { approvalHistory, entityObligations, groupBy, readinessTiles, reconHub, setFindingState } from "@/lib/books/audit";
import { closableYears, POLICY } from "@/lib/books/periods";
import { PeriodEvidence } from "@/components/books/PeriodEvidence";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { missingInvoices } from "@/lib/gst-recon";
import { receivableStatus } from "@/lib/receivables";
import { useAuditAll } from "@/components/books/useAudit";
import { useBooks } from "@/components/books/useBooks";
import { fyRange, fyOf } from "@/lib/entities";
import { effectiveEntity } from '@/lib/books/entity-accounts';
import { ReconciliationDetails } from '@/components/books/ReconciliationDetails';
import { reconciliationAnchor } from '@/lib/books/reconciliation-context';
import {corporateStatements} from '@/lib/books/corporate-statements';
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

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
  const { transactions, documents, accounts, preferences, loans, refresh, downloadFile } = useStore();
  const demat = useDemat();
  const { books, save } = useBooks();
  const { open: items, reviewed } = useAuditAll();
  const entities = preferences.entities ?? [];
  const [by, setBy] = useState<By>("risk");
  const today = new Date().toISOString().slice(0, 10);
  const lastFy = fyOf(new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10));
  const [from, setFrom] = useState(fyRange(lastFy).start); const [to, setTo] = useState(fyRange(lastFy).end); const [note, setNote] = useState("");
  const [periodRequest, setPeriodRequest] = useState<{ key: string; id: string; period: string } | null>(null);
  const changePeriod = async (action: 'closed' | 'reopened', start: string, end: string, reason: string, period?: string) => {
    const key = JSON.stringify([action, start, end, reason, period]);
    const request = periodRequest?.key === key ? periodRequest : { key, id: crypto.randomUUID(), period: period ?? crypto.randomUUID() };
    setPeriodRequest(request);
    // Freeze the calculated figures with the close evidence so the closed period stays reproducible.
    const corporate=action==='closed'?entities.filter(e=>e.kind==='company').map(e=>corporateStatements({entityId:e.id,entities,entries:transactions,accounts,books,documents,from:start,to:end})):[];
    const unresolved=corporate.flatMap(w=>w.issues.map(i=>`${w.entityName}: ${i.message}`));
    if(unresolved.length)throw Error(`Company accounts need review before closing: ${unresolved.slice(0,4).join('; ')}`);
    const figures = action === 'closed' ? {...buildPeriodFigures({
      from: start, to: end,
      entries: transactions.map((t) => ({ date: t.date, amount: t.amount, txnType: t.txnType ?? "expense", reconciled: !!t.reconciledAt })),
      accounts: accounts.map((a) => ({ id: a.id, balanceAt: (upto: string) => balanceAsOf(a, transactions, upto) })),
      invoices: books.gstInvoices, journals: books.journals,
    }),corporate} : null;
    const { error } = await supabase.rpc('change_accounting_period', {
      _id: request.id, _action: action, _period: request.period, _from: start, _to: end, _reason: reason,
      _expected: { closedPeriods: books.closedPeriods, periodLog: books.periodLog } as unknown as Json,
      ...(figures ? { _figures: figures as unknown as Json } : {}),
    });
    if (error) throw new Error(error.message);
    await refresh(); setPeriodRequest(null); setNote('');
  };
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
  // Figure-level reconciliations [§24]; differences are for review only.
  const fyNow = fyOf(today);
  const [reconFy,setReconFy]=useState(fyNow);
  const recon = useMemo(() => {
    const ledgerAt = (id: string, date: string) => { const a = accounts.find((x) => x.id === id); return a ? accountBalance(a, transactions.filter((t) => t.date <= date)) : 0; };
    const partyRows = (kind:'purchase'|'sales') => [...new Set(books.gstInvoices.map(i=>i.gstin))].flatMap<ReturnType<typeof supplierRecon>[number] | ReturnType<typeof customerRecon>[number]>(registration=>{
      const matches=entities.filter(e=>e.gstins.includes(registration));const entity=matches.length===1?matches[0]?.id:undefined;
      const entries=matches.length>1?[]:transactions.filter(t=>entity?effectiveEntity(t,books.entityAccounts??{})===entity:!effectiveEntity(t,books.entityAccounts??{}));
      const payments=entries.filter(t=>(t.txnType??'expense')===(kind==='purchase'?'expense':'income')).map(t=>({id:t.id,amount:t.amount,date:t.date,text:`${t.title} ${t.merchant??''} ${t.description}`}));
      const invoices=books.gstInvoices.filter(i=>i.gstin===registration);
      return kind==='purchase'?supplierRecon(invoices,payments,fyRange(reconFy).start,fyRange(reconFy).end,books.allocationOrder):customerRecon(invoices,payments,fyRange(reconFy).start,fyRange(reconFy).end,books.allocationOrder);
    });
    return {
      loan: loanRecon(loans, documents.filter((d) => d.docType === "loan_statement").map((d) => ({ loanId: d.loanId ?? null, date: d.docDate, outstanding: d.amount })), ledgerAt).filter((r) => Math.abs(r.difference) > 1),
      supplier: partyRows('purchase').filter((r): r is ReturnType<typeof supplierRecon>[number] => 'paid' in r),
      customer: partyRows('sales').filter((r): r is ReturnType<typeof customerRecon>[number] => 'received' in r),
      investment: investmentRecon((demat ?? []).flatMap((d) => d.holdings)),
      inter: intercompanyRecon(transactions, books.entityAccounts ?? {}),
    };
  }, [loans, documents, accounts, transactions, books, demat, reconFy, entities]);
  const entName = (id: string) => entities.find((e) => e.id === id)?.name ?? id;
  const groups = groupBy(items, by);
  const pending = books.proposedFields.filter((f) => f.status === "proposed");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <PageTitle title="Checks & history of changes" sub={items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} to look at · also shown in Review` : "Nothing needs your attention right now"} />
      <Link to="/report-status" className="text-sm text-primary underline">Required reports status, evidence and tests</Link>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{tiles.map((t) => <div key={t.label} className="rounded-2xl border bg-card p-3"><p className="text-[11px] text-muted-foreground">{t.label}</p><p className="font-mono text-lg font-semibold">{t.value}</p></div>)}</div>

      <FigureSources assets={preferences.assets ?? []} books={books} docs={documents} titleOf={(id) => transactions.find((t) => t.id === id)?.title} />
      <Fold title="Balance checks" hint="Bank, card, loan, supplier, customer, investment, between-company and GST (reconciliations)" defaultOpen>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{hub.map((h) => <Link key={h.kind} to={h.to} className="rounded-xl border px-3 py-2 text-sm"><span className="block text-xs text-muted-foreground">{h.kind}</span><b className={h.open ? "text-destructive" : "text-primary"}>{h.open ? `${h.open} open` : "Clear"}</b></Link>)}</div>
        <div className="mt-3 space-y-2 text-xs">
          <label className="flex items-center gap-2">Comparison financial year<select aria-label="Comparison financial year" className="rounded-md border bg-background px-2 py-1" value={reconFy} onChange={e=>setReconFy(e.target.value)}>{[...new Set([fyNow,...books.gstInvoices.map(i=>fyOf(i.date))])].sort().reverse().map(y=><option key={y} value={y}>{y}</option>)}</select></label>
          <label className="flex flex-wrap items-center gap-2">Payments settle unnamed invoices
            <select className="rounded-md border bg-background px-2 py-1" value={books.allocationOrder ?? "oldest"} onChange={async (e) => { try { await save({ allocationOrder: e.target.value as "oldest" | "largest" | "smallest" }); toast.success("Settlement order saved"); } catch (err) { toast.error((err as Error).message); } }}>
              <option value="oldest">oldest first</option><option value="largest">largest first</option><option value="smallest">smallest first</option>
            </select>
            <span className="text-muted-foreground">A payment naming an invoice always settles that invoice first.</span>
          </label>
          <details><summary className="cursor-pointer">Loan vs lender statement · {recon.loan.length ? `${recon.loan.length} differ` : "agree or no statement"}</summary>{recon.loan.map((r) => <p key={r.loanId} className="break-words">{r.name} on {r.statementDate}: lender {inr(r.lender)} · ledger {inr(r.ledger)} · <b className="text-destructive">difference {inr(r.difference)}</b></p>)}{!recon.loan.length && <p className="text-muted-foreground">Upload the lender's statement on Statement Desk and link it to the loan to compare.</p>}</details>
          <details><summary className="cursor-pointer">Supplier invoices vs payments · FY {reconFy} · {recon.supplier.length} differ</summary>{recon.supplier.map((r) => <div key={r.gstin + r.party}><p className="break-words">{r.party} {r.gstin}: invoiced {inr(r.invoiced)} ({r.invoices}) · paid {inr(r.paid)} ({r.payments}) · <b className={r.difference > 0 ? "text-destructive" : ""}>{r.difference > 0 ? `${inr(r.difference)} unpaid` : `${inr(-r.difference)} paid without invoice`}</b></p>{r.allocation && r.allocation.lines.length > 0 && <ul className="ml-3 text-muted-foreground">{r.allocation.lines.map((l) => <li key={l.number + l.date}>{l.number} · {l.date} · {inr(l.amount)} · {l.status === "paid" ? "settled" : l.status === "part" ? `part paid, ${inr(l.outstanding)} due` : `unpaid ${inr(l.outstanding)}`}{l.ageDays ? ` · ${l.ageDays} days` : ""}</li>)}{r.allocation.unallocated > 1 && <li>Unallocated / advance {inr(r.allocation.unallocated)}</li>}</ul>}</div>)}</details>
          <details><summary className="cursor-pointer">Customer invoices vs receipts · FY {reconFy} · {recon.customer.length} differ</summary>{recon.customer.map((r) => <div key={r.gstin + r.party}><p className="break-words">{r.party} {r.gstin}: invoiced {inr(r.invoiced)} ({r.invoices}) · received {inr(r.received)} ({r.receipts}) · <b className={r.outstanding > 0 ? "text-destructive" : ""}>{r.outstanding > 0 ? `${inr(r.outstanding)} still owed` : `${inr(-r.outstanding)} received without invoice`}</b></p>{r.allocation && r.allocation.lines.length > 0 && <ul className="ml-3 text-muted-foreground">{r.allocation.lines.map((l) => <li key={l.number + l.date}>{l.number} · {l.date} · {inr(l.amount)} · {l.status === "paid" ? "settled" : l.status === "part" ? `part paid, ${inr(l.outstanding)} due` : `unpaid ${inr(l.outstanding)}`}{l.ageDays ? ` · ${l.ageDays} days` : ""}</li>)}{r.allocation.unallocated > 1 && <li>Unallocated / advance {inr(r.allocation.unallocated)}</li>}</ul>}</div>)}</details>
          <details><summary className="cursor-pointer">Holdings vs transaction history · {recon.investment.length} differ</summary>{recon.investment.map((r) => <p key={r.isin} className="break-words">{r.name} ({r.isin}): statement {r.statement} · from transactions {r.fromTransactions} · difference {r.difference}{r.unresolved.length ? ` · ${r.unresolved.length} action quantities need checking` : ''}</p>)}</details>
          <details><summary className="cursor-pointer">Between companies · {recon.inter.length} pair{recon.inter.length === 1 ? "" : "s"}</summary>{recon.inter.map((r) => <p key={r.a + r.b} className="break-words">{entName(r.a)} → {entName(r.b)} {inr(r.aToB)} · {entName(r.b)} → {entName(r.a)} {inr(r.bToA)} · net {r.net >= 0 ? `${entName(r.b)} owes ${entName(r.a)}` : `${entName(r.a)} owes ${entName(r.b)}`} {inr(Math.abs(r.net))}{r.unconfirmed ? ` · ${r.unconfirmed} not confirmed` : ""}</p>)}{!recon.inter.length && <p className="text-muted-foreground">Link accounts to each company in its tax profile to see transfers between them.</p>}</details>
        </div>
      </Fold>

      <div className="flex flex-wrap gap-1 text-xs">{(["risk", "type", "entity", "fy", "account", "evidence"] as By[]).map((b) => <button key={b} type="button" onClick={() => setBy(b)} className={`rounded-full border px-3 py-1 ${by === b ? "bg-primary text-primary-foreground" : "bg-card"}`}>By {b === "fy" ? "year" : b}</button>)}</div>
      {groups.map((g) => <section key={g.name} className="space-y-1"><h2 className="text-xs font-semibold uppercase text-muted-foreground">{g.name} · {g.items.length}</h2>
        {g.items.map((f) => <div key={f.key} className="rounded-2xl border bg-card px-4 py-3 text-sm">
          <Link to={f.to} {...(f.comparison?{hash:reconciliationAnchor(f.key)}:{})} className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words"><span className="mr-2 text-xs text-muted-foreground">{f.type}</span>{f.text}<span className="block text-[11px] text-muted-foreground">Evidence: {f.evidence}{f.fy ? ` · FY ${f.fy}` : ""}</span></span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${f.risk === "high" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{f.risk === "high" ? "Important" : f.risk === "medium" ? "Check" : "Low"}</span>
          </Link>
          <ReconciliationDetails key={JSON.stringify(f.comparison)} item={f} entries={transactions} docs={documents} download={downloadFile}/>
          <div className="mt-1 flex gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => decide(f.key, "resolved")}>Mark fixed</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => decide(f.key, "accepted")}>Accept with note</Button></div>
        </div>)}</section>)}

      {reviewed.length > 0 && <Fold title="Reviewed findings" hint={`${reviewed.length} marked fixed or accepted — still checked every time`}>
        <div className="space-y-1 text-sm">{reviewed.map((f) => <div key={f.key} className="flex items-start justify-between gap-2 rounded-xl border px-3 py-2"><span className="min-w-0 break-words">{f.text}<span className="block text-[11px] text-muted-foreground">{f.state.status === "resolved" ? "Fixed" : "Accepted"} {f.state.at.slice(0, 10)} · {f.state.note}</span></span><Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => decide(f.key, "open")}>Reopen</Button></div>)}</div>
      </Fold>}

      <Fold id="periods" title="Closed periods" hint={`${books.closedPeriods.length} closed · entries inside can't be changed`}>
        <div className="space-y-2 text-sm">
          {books.closedPeriods.map((p) => <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"><span>{p.from} → {p.to}<span className="block text-[11px] text-muted-foreground">Closed {p.closedOn}{p.note ? ` · ${p.note}` : ""}</span></span>
            <Button size="sm" variant="ghost" onClick={async () => { const reason = window.prompt("Reopening a closed period needs a reason (kept permanently):"); if (!reason) return; try { await changePeriod('reopened', p.from, p.to, reason, p.id); toast.success("Period reopened"); } catch (e) { toast.error((e as Error).message); } }}>Reopen</Button></div>)}
          <div className="grid grid-cols-2 gap-2"><label className="text-xs">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-xs">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Input className="col-span-2" placeholder="Note (e.g. FY audited and filed)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button size="sm" onClick={async () => { if (!window.confirm(`Close ${from} to ${to} and retain the saved records as evidence?`)) return; try { await changePeriod('closed', from, to, note); toast.success("Period closed with evidence"); } catch (e) { toast.error((e as Error).message); } }}>Close period</Button>
          {closableYears(books.closedPeriods, today).length > 0 && <div className="flex flex-wrap items-center gap-1 text-xs"><span className="text-muted-foreground">Freeze a whole year:</span>{closableYears(books.closedPeriods, today).map((fy) => <Button key={fy} size="sm" variant="outline" className="h-7" onClick={async () => { if (!window.confirm(`Freeze FY ${fy}? Entries, opening balances and GST invoices dated 1 April ${fy.slice(0, 4)} – 31 March ${Number(fy.slice(0, 4)) + 1} can't be changed until it is reopened with a reason.`)) return; try { const r = fyRange(fy); await changePeriod('closed', r.start, r.end, note || `FY ${fy} frozen`); toast.success(`FY ${fy} frozen`); } catch (e) { toast.error((e as Error).message); } }}>Freeze FY {fy}</Button>)}</div>}
          <PeriodEvidence revision={JSON.stringify(books.periodLog)} />
          {books.periodLog.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">History ({books.periodLog.length})</summary>{books.periodLog.slice().reverse().map((l, i) => <p key={i}>{l.at} · {l.action} · {l.reason}</p>)}</details>}
        </div>
      </Fold>

      <Fold title="Approval policy" hint="What runs automatically, what asks first, what needs explicit approval">
        <div className="grid gap-3 text-sm sm:grid-cols-3">{POLICY.map((p) => <div key={p.level}><p className="font-semibold">{LEVEL[p.level]}</p><ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{p.items.map((i) => <li key={i}>{i}</li>)}</ul></div>)}</div>
        <div className="mt-3 space-y-1 text-xs"><p className="font-semibold">Capitalisation limit (purchases below this stay as expenses)</p>
          {[{ id: "", name: "Default for everyone" }, ...(preferences.entities ?? [])].map((e) => {
            const cur = e.id ? books.policy?.capitalisationMinByEntity?.[e.id] : books.policy?.capitalisationMin;
            return <label key={e.id || "all"} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{e.name}</span>
              <Input aria-label={`Capitalisation limit ${e.name}`} className="h-8 w-32" inputMode="decimal" placeholder={e.id ? "Use default" : "Not set"} defaultValue={cur ?? ""} onBlur={async (x) => {
                const raw = x.target.value.trim(); const n = raw === "" ? undefined : Number(raw);
                if (n !== undefined && !(Number.isFinite(n) && n >= 0)) { toast.error("Enter a number"); return; }
                const pol = books.policy ?? { require: {} as never };
                const by = { ...(pol.capitalisationMinByEntity ?? {}) }; if (e.id) { if (n === undefined) delete by[e.id]; else by[e.id] = n; }
                await save({ policy: { ...pol, ...(e.id ? { capitalisationMinByEntity: by } : { capitalisationMin: n }) } });
              }} /></label>;
          })}</div>
      </Fold>

      <Fold title="Approval history" hint={`${history.length} recorded decision${history.length === 1 ? "" : "s"}`}>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">No approvals recorded yet.</p>
          : <div className="space-y-1 text-xs">{history.slice(0, 200).map((h, i) => <p key={i} className="break-words"><span className="font-mono text-muted-foreground">{h.at}</span> · <b>{h.what}</b> · {h.detail}</p>)}</div>}
      </Fold>

      {pending.length > 0 && <Fold title="New fields found on documents" hint={`${pending.length} waiting — kept as document details until you approve`}>
        <div className="space-y-2 text-sm">{pending.map((f) => { const ext = fieldExtensionPlan(f, books.proposedFields.filter((x) => x.status === "approved"), books.fieldMappings ?? {}); return <div key={`${f.docType}:${f.label}`} className="space-y-1 rounded-xl border p-2"><div className="flex items-center justify-between gap-2"><span className="min-w-0 break-words">{f.label} <span className="text-xs text-muted-foreground">({f.docType.replace(/_/g, " ")}, seen {f.seen}×)</span></span>
          <span className="flex shrink-0 gap-1">{(["approved", "rejected"] as const).map((s) => <Button key={s} size="sm" variant="ghost" disabled={s === "approved" && !ext.compatible} onClick={() => save({ proposedFields: books.proposedFields.map((x) => (x === f ? { ...x, status: s, plan: ext.plan, compatible: ext.compatible, decidedOn: today } : x)) })}>{s === "approved" ? "Keep as field" : "Ignore"}</Button>)}</span></div>
          <p className="text-[11px] text-muted-foreground">Plan: {ext.plan}</p>
          <p className={`text-[11px] ${ext.compatible ? "text-primary" : "text-destructive"}`}>Compatibility check: {ext.compatible ? "passed" : ext.problems.join("; ")}</p></div>; })}
          <p className="text-[11px] text-muted-foreground">Approved fields stay searchable document details; no database columns are created automatically.</p></div>
      </Fold>}
    </div>
  );
}

function FigureSources({ assets, books, docs, titleOf }: { assets: import("@/lib/assets").Asset[]; books: import("@/lib/books/types").BooksData; docs: { id: string; title: string }[]; titleOf: (id: string) => string | undefined }) {
  const rows = useMemo(() => registerEvidence({ assets, books, docs, entryTitle: titleOf }), [assets, books, docs]); // eslint-disable-line react-hooks/exhaustive-deps
  const derived = useMemo(() => derivedEvidence({ assets, books, docs, entryTitle: titleOf }), [assets, books, docs]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = rows.filter((r) => !r.source).length;
  return (
    <Fold title="Where each figure came from" hint={rows.length ? `${rows.length - missing} of ${rows.length} register figures traced to a document or entry` : "No register figures yet"}>
      <div className="space-y-2 text-xs">
        {rows.length > 0 && <div className="max-h-80 divide-y overflow-y-auto rounded-lg border">{rows.map((r, i) => <div key={`${r.recordId}:${i}`} className="flex flex-wrap justify-between gap-2 px-2 py-1"><span className="min-w-0">{r.register} · {r.label}<span className="block text-muted-foreground">{r.source ? `${r.source.kind === "document" ? "Document" : "Entry"}: ${r.source.title}` : "No source — attach the document"}</span></span><span className="font-mono">{inr(r.amount)}</span></div>)}</div>}
        {rows.length > 0 && <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([evidenceCsv(rows)], { type: "text/csv" }), "figure-sources.csv")}>Download CSV</Button>}
        {derived.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">Calculated figures · {derived.length} — what each one is made of</summary>
          <Button size="sm" variant="outline" onClick={()=>downloadBlob(new Blob([JSON.stringify(derived.map(d=>({...d,inputs:d.allInputs??d.inputs})),null,2)],{type:'application/json'}),'calculated-figure-dependencies.json')}>Download full inputs</Button>
          <div className="mt-1 max-h-80 space-y-1 overflow-y-auto">{derived.map((d) => <details key={d.id} className="rounded-lg border px-2 py-1">
            <summary className="flex cursor-pointer flex-wrap justify-between gap-2"><span className="min-w-0">{d.label}{d.unsourced > 0 && <span className="text-destructive"> · {d.unsourced} input{d.unsourced === 1 ? "" : "s"} without a source</span>}</span><span className="font-mono">{inr(d.amount)}</span></summary>
            <div className="mt-1 divide-y border-t">{d.inputs.map((i, n) => <div key={n} className="flex flex-wrap justify-between gap-2 py-1"><span className="min-w-0 text-muted-foreground">{i.label}<span className="block">{i.source ? `${i.source.kind === "document" ? "Document" : "Entry"}: ${i.source.title}` : "No source — attach the document"}</span></span><span className="font-mono">{inr(i.amount)}</span></div>)}</div>
            {!!d.omittedInputs&&<p className="text-muted-foreground">{d.omittedInputs} additional inputs retained in the register; this list shows the first 100.</p>}
          </details>)}</div>
        </details>}
        <p className="text-muted-foreground">Read-only. A figure counts as traced only when its record names a document, a document is linked to it, or it is linked to a ledger entry.</p>
      </div>
    </Fold>
  );
}
