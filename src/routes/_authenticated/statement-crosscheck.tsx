import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { correctionPreview, type CorrectionPreview } from "@/lib/financial-corrections";
import type { FinancialReview } from "@/lib/financial-review";
import type { TxnType } from "@/lib/ledger";
import { Download, FileSearch, ShieldCheck } from "lucide-react";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { accountBalance, isLiability } from "@/lib/ledger";
import { isAmex, parseAmexStatement, balanceGate, lineId, missingLines, pairTransfers, crossCheck, parseBalanceStatement, rowsFromItems, statementTotals, type BalanceLine, type CrossRecord, type CrossResult } from "@/lib/statement-crosscheck";

export const Route = createFileRoute("/_authenticated/statement-crosscheck")({
  head: () => ({
    meta: [
      { title: "Statement cross-check · Ledgerline" },
      { name: "description", content: "Read-only check of records saved on one account against another account's statements." },
      { property: "og:title", content: "Statement cross-check · Ledgerline" },
      { property: "og:description", content: "Find records saved on the wrong account without changing anything." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CrossCheckPage,
});

type Parsed = { name: string; lines: BalanceLine[]; opening: number | null; closing: number | null };

async function readPdf(file: File): Promise<Parsed> {
  if (!/\.pdf$/i.test(file.name)) throw Error(`${file.name}: choose a PDF statement`);
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await task.promise;
    const rows: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 80); n++) {
      const c = await (await doc.getPage(n)).getTextContent();
      rows.push(...rowsFromItems(c.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : []))));
    }
    const p = isAmex(rows) ? parseAmexStatement(rows, file.name) : parseBalanceStatement(rows, file.name);
    if (!p.lines.length) throw Error(`${file.name}: no entries found in this layout`);
    return { name: file.name, ...p };
  } finally { await task.destroy(); }
}

const LABEL: Record<CrossResult["result"], string> = { found: "Found on other statement", found_wrong_kind: "Found — wrong kind", not_found: "Not found" };

function CrossCheckPage() {
  const { transactions, accounts, correctFinancialEntries, undoFinancialCorrection, save, remove, preferences, savePreferences } = useStore();
  const money_accounts = accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(() => money_accounts.find((a) => /movac/i.test(a.name))?.id ?? money_accounts[0]?.id ?? "");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState("2026-09-30");
  const [home, setHome] = useState<Parsed[]>([]);
  const [other, setOther] = useState<Parsed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CrossResult["result"] | "all">("all");
  const [targetId, setTargetId] = useState(() => money_accounts.find((a) => /idfc krupa/i.test(a.name))?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const op = useRef("");

  const load = async (files: FileList | null, set: (p: Parsed[]) => void) => {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try { set(await Promise.all([...files].map(readPdf))); } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t read that statement"); } finally { setBusy(false); }
  };

  const records: CrossRecord[] = useMemo(() => transactions
    .filter((e) => e.accountId === accountId && e.date >= from && e.date <= to)
    .map((e) => ({ id: e.id, date: e.date, amount: e.amount, kind: e.txnType ?? "expense", name: e.merchant || e.title, description: e.description })), [transactions, accountId, from, to]);

  const out = useMemo(() => (other.length ? crossCheck(records, home.flatMap((p) => p.lines), other.flatMap((p) => p.lines)) : null), [records, home, other]);
  const count = (r: CrossResult["result"]) => out?.results.filter((x) => x.result === r) ?? [];
  const total = (xs: CrossResult[]) => xs.reduce((s, x) => s + x.amount, 0);
  const shown = (out?.results ?? []).filter((r) => filter === "all" || r.result === filter);

  const actionable = (out?.results ?? []).filter((r) => r.result !== "not_found");
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));
  const prepare = () => {
    try {
      if (!targetId || targetId === accountId) throw Error("Choose which account the other statements belong to (different from the records account).");
      const sel = actionable.filter((r) => picked.includes(r.id));
      if (!sel.length) throw Error("Select at least one found record.");
      const dirs = new Set(sel.map((r) => r.line!.direction));
      if (dirs.size > 1) throw Error("Selected records mix money in and money out. Act on each group separately.");
      const wrongKind = sel.some((r) => r.result === "found_wrong_kind");
      const kindFix: TxnType | undefined = wrongKind ? ([...dirs][0] === "debit" ? "expense" : "income") : undefined;
      if (wrongKind && sel.some((r) => r.result !== "found_wrong_kind")) throw Error("Act on “Found” and “Wrong kind” records separately.");
      const rows = sel.map((r) => ({ transaction: transactions.find((t) => t.id === r.id)!, issues: [], group: "account", status: "Suggested Correction", confidence: r.confidence, targetAccountIds: [targetId], evidence: r.reasons }) as unknown as FinancialReview);
      if (rows.some((r) => !r.transaction)) throw Error("A selected record changed. Reload and try again.");
      op.current = crypto.randomUUID();
      setPreview(correctionPreview(rows, { accountId: targetId, ...(kindFix ? { txnType: kindFix } : {}) }, accounts, transactions));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn’t prepare the change"); }
  };
  const apply = async () => {
    if (!preview) return;
    try {
      await correctFinancialEntries(preview, op.current);
      setApplied(op.current); setPreview(null); setPicked([]);
      toast.success(`${preview.records.length} records corrected`, { action: { label: "Undo", onClick: () => void undo(op.current) } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Nothing changed — try again."); }
  };
  const undo = async (id: string) => {
    try { await undoFinancialCorrection(id); setApplied(null); toast.success("Original account and type restored"); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn’t undo — a later edit may block it."); }
  };
  const homeLines = home.flatMap((p) => p.lines);
  // Includes transfers already posted from another account into this one, so they are not reported missing or posted twice.
  const accountRecords = useMemo(() => transactions.filter((e) => !e.transferCounterpartOf && (e.accountId === accountId || e.toAccountId === accountId) && e.date >= from && e.date <= to).map((e) => ({ date: e.date, amount: e.amount })), [transactions, accountId, from, to]);
  const missing = useMemo(() => pairTransfers(missingLines(accountRecords, homeLines), other.flatMap((p) => p.lines)), [accountRecords, home, other]);
  const acct = accounts.find((a) => a.id === accountId);
  const closing = home.length ? home[home.length - 1]!.closing : null;
  const gate = acct && home.length ? balanceGate(accountBalance(acct, transactions as never), missing, closing, isLiability(acct.kind)) : null;
  const [posting, setPosting] = useState<string | null>(null);
  // Saved in owner preferences so the batch can be undone from any signed-in device.
  const batch = preferences.statementBatches?.[accountId] ?? [];
  const keepBatch = async (ids: string[]) => {
    const next = { ...(preferences.statementBatches ?? {}) };
    if (ids.length) next[accountId] = ids; else delete next[accountId];
    await savePreferences({ ...preferences, statementBatches: next });
  };
  const undoBatch = async () => {
    const left: string[] = [];
    for (const id of batch) { const e = transactions.find((t) => t.id === id); if (!e) continue; try { await remove(e); } catch { left.push(id); } }
    await keepBatch(left);
    if (left.length) toast.error(`${left.length} entries couldn’t be removed — try Undo again.`); else toast.success("Statement posting batch reversed");
  };
  const postMissing = async () => {
    if (!acct || !gate?.ok) return;
    if (missing.some((m) => m.transferWith) && !targetId) { toast.error("Choose which account the other statements belong to, so transfers are posted between the right accounts."); return; }
    let done = 0;
    const ids: string[] = [...batch];
    try {
      for (const m of missing) {
        setPosting(`Saving ${done + 1} of ${missing.length}…`);
        const transfer = !!m.transferWith;
        const id = await lineId(accountId, m);
        await save({
          title: m.description.slice(0, 80) || "Statement entry", merchant: null, category: transfer ? "Transfer" : "Uncategorised", scope: "business", memberId: null,
          amount: m.amount, currency: "INR", paymentMethod: "bank_transfer", date: m.date, description: `Statement import · ${m.source}`, tags: ["statement-import"],
          txnType: transfer ? "transfer" : m.direction === "debit" ? "expense" : "income",
          accountId: transfer && m.direction === "credit" ? targetId : accountId,
          toAccountId: transfer ? (m.direction === "debit" ? targetId : accountId) : null,
        }, { createId: id, noRefresh: true });
        if (!ids.includes(id)) ids.push(id);
        await keepBatch([...ids]);
        done++;
      }
      toast.success(`${done} statement entries posted to ${acct.name}`);
    } catch (e) { toast.error(`${done} saved; stopped at entry ${done + 1}: ${e instanceof Error ? e.message : "try again"}. Retrying will not duplicate saved entries.`); }
    finally { setPosting(null); }
  };
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";

  const exportCsv = () => {
    const q = (s: string | number) => `"${String(s).replaceAll('"', '""')}"`;
    const csv = ["record_date,kind,amount,name,result,confidence,score,reasons,statement_date,statement_direction,statement_file,statement_description",
      ...(out?.results ?? []).map((r) => [r.date, r.kind, r.amount, r.name, LABEL[r.result], r.confidence, r.score, r.reasons.join("; "), r.line?.date ?? "", r.line?.direction ?? "", r.line?.source ?? "", r.line?.description ?? ""].map(q).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "statement-crosscheck.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><FileSearch className="size-5" /> Statement cross-check</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><ShieldCheck className="size-4" /> Statements are read on this device and are never saved or attached. Matching is read-only; records change only when you review and confirm an action below.</p>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm sm:col-span-1">Records saved on
          <select className="h-11 w-full rounded-md border border-input bg-background px-2" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {money_accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">From<input type="date" className="h-11 w-full rounded-md border border-input bg-background px-2" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="space-y-1 text-sm">To<input type="date" className="h-11 w-full rounded-md border border-input bg-background px-2" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="space-y-1 text-sm sm:col-span-3 sm:grid sm:grid-cols-2 sm:gap-3">
          <span className="block">1. This account’s own statement (optional — records on it are set aside)
            <input aria-label="Own account statement" type="file" accept=".pdf" multiple className="mt-1 block w-full text-sm" onChange={(e) => void load(e.target.files, setHome)} /></span>
          <span className="block">2. Other account statements to search (e.g. IDFC Krupa April–September)
            <input aria-label="Other account statements" type="file" accept=".pdf" multiple className="mt-1 block w-full text-sm" onChange={(e) => void load(e.target.files, setOther)} /></span>
        </label>
        {busy && <p className="text-sm text-muted-foreground sm:col-span-3" role="status">Reading statements…</p>}
        {error && <p className="text-sm text-destructive sm:col-span-3" role="alert">{error}</p>}
        {[...home, ...other].map((p) => { const t = statementTotals(p.lines); const ok = p.opening !== null && p.closing !== null && Math.abs(p.opening - t.debits + t.credits - p.closing) < 0.02; return (
          <p key={p.name} className="text-xs text-muted-foreground sm:col-span-3">{p.name}: {t.count} entries · out {money(t.debits)} · in {money(t.credits)} · closing {p.closing !== null ? money(p.closing) : "—"} · {ok ? "balances add up" : "balances don’t add up — check this file"}</p>
        ); })}
      </Card>

      <p className="text-sm text-muted-foreground">{records.length} records in this period{out ? ` · ${out.onHome} found on the account’s own statement · ${out.results.length} checked against other statements` : " · add other statements to start"}</p>

      {out && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {(["all", "found", "found_wrong_kind", "not_found"] as const).map((k) => { const xs = k === "all" ? out.results : count(k); return (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`min-h-11 rounded-lg border p-3 text-left ${filter === k ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                <div className="text-xs text-muted-foreground">{k === "all" ? "All checked" : LABEL[k]}</div>
                <div className="font-semibold">{xs.length} · {money(total(xs))}</div>
              </button>
            ); })}
          </div>
          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">Act on matches</h2>
            <p className="text-sm text-muted-foreground">Selected records move to the account the statement belongs to; “wrong kind” records also take the statement’s direction. You see every change first, and can Undo. Statements are still not saved, and no new entries are posted.</p>
            <label className="block space-y-1 text-sm">Other statements belong to
              <select className="h-11 w-full rounded-md border border-input bg-background px-2" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Choose account…</option>
                {money_accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setPicked(actionable.filter((r) => r.result === "found" && r.confidence === "high").map((r) => r.id))}>Select high-confidence found</Button>
              <Button variant="outline" onClick={() => setPicked(actionable.filter((r) => r.result === "found_wrong_kind").map((r) => r.id))}>Select wrong kind</Button>
              <Button variant="ghost" onClick={() => setPicked([])}>Clear</Button>
              <Button onClick={prepare} disabled={!picked.length}>Review {picked.length} change{picked.length === 1 ? "" : "s"}</Button>
              {applied && <Button variant="outline" onClick={() => undo(applied)}>Undo last change</Button>}
            </div>
            {preview && (
              <div role="region" aria-label="Change preview" className="space-y-2 rounded-md border border-primary p-3 text-sm">
                <p className="font-medium">{preview.records.length} records: {accName(accountId)} → {accName(targetId)}{preview.choice.txnType ? `, kind → ${preview.choice.txnType}` : ""}</p>
                <ul className="space-y-0.5">{preview.balanceChanges.map((b) => <li key={b.id}>{b.name}: balance {b.change >= 0 ? "+" : ""}{money(b.change)}</li>)}</ul>
                <p>Income {preview.incomeChange >= 0 ? "+" : ""}{money(preview.incomeChange)} · Spending {preview.spendingChange >= 0 ? "+" : ""}{money(preview.spendingChange)}</p>
                <p className="text-xs text-muted-foreground">Statement matching on these records is cleared so they can be reconciled against the right account.</p>
                <div className="flex gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={apply}>Confirm and apply</Button></div>
              </div>
            )}
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">Post missing statement entries</h2>
            {!home.length ? <p className="text-sm text-muted-foreground">Add this account’s own statement (step 1) to find entries that have no record.</p> : (<>
              <p className="text-sm">{missing.length} statement entries on {acct?.name} have no record · {missing.filter((m) => m.transferWith).length} are transfers with another uploaded statement (posted once as a transfer, not income and spending).</p>
              {gate && <p className={`text-sm ${gate.ok ? "text-primary" : "text-destructive"}`} role="status">Balance in app now {money(gate.after - gate.net)} · after posting {money(gate.after)} · statement closing {closing !== null ? money(closing) : "—"}{gate.ok ? " · matches" : ` · off by ${money(gate.difference ?? 0)}. Posting is blocked: move wrong-account records first, and check the account’s starting balance equals the statement’s opening balance${home[0]?.opening != null ? ` (${money(home[0].opening)})` : ""}.`}</p>}
              <ul className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border text-sm">
                {missing.map((m, i) => <li key={i} className="flex justify-between gap-2 p-2"><span className="min-w-0 truncate">{m.date} · {m.description}{m.transferWith ? ` · transfer ↔ ${m.transferWith.source}` : ""}</span><span className="shrink-0 tabular-nums">{m.direction === "debit" ? "−" : "+"}{money(m.amount)}</span></li>)}
              </ul>
              <Button onClick={postMissing} disabled={!gate?.ok || !missing.length || !!posting}>{posting ?? `Confirm and post ${missing.length} entries`}</Button>
              {batch.length > 0 && <Button variant="outline" onClick={undoBatch}>Undo posting batch ({batch.length} entries)</Button>}
            </>)}
          </Card>
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="size-4" /> Export CSV</Button></div>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {shown.map((r) => <ResultRow key={r.id} r={r} picked={picked.includes(r.id)} onPick={r.result === "not_found" ? undefined : (on) => toggle(r.id, on)} />)}
            {!shown.length && <li className="p-3 text-sm text-muted-foreground">Nothing in this group.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

function Side({ title, date, amount, kind, text, diff }: { title: string; date?: string | undefined; amount?: number | undefined; kind?: string | undefined; text?: string | undefined; diff: { date: boolean; amount: boolean; kind: boolean } }) {
  const mark = (on: boolean) => (on ? "font-semibold text-destructive" : "");
  return (
    <div className="min-w-0 rounded-md border border-border p-3">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      {date === undefined ? <p className="text-sm text-muted-foreground">No matching statement entry</p> : (
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Date</dt><dd className={mark(diff.date)}>{date}</dd>
          <dt className="text-muted-foreground">Amount</dt><dd className={`tabular-nums ${mark(diff.amount)}`}>{amount !== undefined ? money(amount) : "—"}</dd>
          <dt className="text-muted-foreground">Kind</dt><dd className={mark(diff.kind)}>{kind}</dd>
          <dt className="text-muted-foreground">Description</dt><dd className="break-words">{text || "—"}</dd>
        </dl>
      )}
    </div>
  );
}

function ResultRow({ r, picked, onPick }: { r: CrossResult; picked: boolean; onPick?: ((on: boolean) => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const l = r.line ?? r.nearest;
  const isOut = !["income", "refund"].includes(r.kind);
  const diff = { date: !!l && l.date !== r.date, amount: !!l && Math.abs(l.amount - r.amount) > 0.005, kind: !!l && (l.direction === "debit") !== isOut };
  const tone = r.result === "found" ? "bg-primary/10 text-primary" : r.result === "found_wrong_kind" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return (
    <li className="flex gap-2 p-3 text-sm">
      {onPick ? <Checkbox className="mt-3" aria-label={`Select ${r.name}`} checked={picked} onCheckedChange={(v) => onPick(v === true)} /> : <span className="w-4" />}
      <div className="min-w-0 flex-1">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><div className="truncate font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.date} · saved as {r.kind}{r.line ? ` · ${r.line.source}` : ""}</div></div>
        <div className="flex shrink-0 flex-wrap items-center gap-2"><span className="tabular-nums">{money(r.amount)}</span><span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{LABEL[r.result]}</span><span className="rounded-full border border-border px-2 py-0.5 text-xs">{r.result === "not_found" ? "No match" : `${r.confidence} · ${r.score}`}</span></div>
      </button>
      <ul className="mt-1 flex flex-wrap gap-1">{r.reasons.map((x) => <li key={x} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{x}</li>)}</ul>
      {open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Side title="Saved record" date={r.date} amount={r.amount} kind={r.kind} text={[r.name, r.description].filter(Boolean).join(" — ")} diff={{ date: false, amount: false, kind: false }} />
          <Side title={r.line ? "Statement entry" : r.nearest ? "Nearest same-amount entry (not matched)" : "Statement entry"} date={l?.date} amount={l?.amount} kind={l ? `money ${l.direction === "debit" ? "out" : "in"}` : undefined} text={l ? `${l.description} (${l.source})` : undefined} diff={diff} />
        </div>
      )}
      </div>
    </li>
  );
}
