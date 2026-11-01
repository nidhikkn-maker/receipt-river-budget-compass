import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Inbox, ShieldCheck, Upload, X } from "lucide-react";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { accountBalance } from "@/lib/ledger";
import type { TxnType } from "@/lib/ledger";
import { correctionPreview, type CorrectionPreview } from "@/lib/financial-corrections";
import type { FinancialReview } from "@/lib/financial-review";
import { identifyFile } from "@/lib/statement-pipeline/identify";
import { readStatementFile } from "@/lib/statement-pipeline/source";
import { useServerFn } from "@tanstack/react-start";
import { extractStatement } from "@/lib/statement-extract.functions";
import type { StatementUpload } from "@/lib/preferences";
import { Link } from "@tanstack/react-router";
import { buildPlan, type AccountPlan, type StatementPlan } from "@/lib/statement-pipeline/plan";
import { applyUpload, undoUpload, type ApplyResult } from "@/lib/statement-pipeline/apply";
import { totals, type StmtFile } from "@/lib/statement-pipeline/line";

export const Route = createFileRoute("/_authenticated/statements")({
  head: () => ({
    meta: [
      { title: "Statement Desk · Ledgerline" },
      { name: "description", content: "Upload many bank statements at once and let Ledgerline match, categorise and post them with your say-so." },
      { property: "og:title", content: "Statement Desk · Ledgerline" },
      { property: "og:description", content: "One upload: matching, categorising, account linking and posting, with every step shown first." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatementDeskPage,
});

/** What one uploaded file would change, held together so the screen can show it before saving. */
interface Loaded {
  file: StmtFile;
  accountName: string;
  entries: number;
  debits: number;
  credits: number;
}

function StatementDeskPage() {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [fix, setFix] = useState<{ preview: CorrectionPreview; name: string } | null>(null);
  const fixOp = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractStatement);
  const serverRead = async (f: File) => {
    if (f.size > 14_000_000) throw Error(`${f.name}: too large for the scan reader (14 MB max)`);
    const dataUrl = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(f); });
    const mimeType = (/\.pdf$/i.test(f.name) ? "application/pdf" : f.type || "image/jpeg") as "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
    setProgress(`Reading scan ${f.name}…`);
    try {
      const res = await extract({ data: { dataUrl, mimeType } });
      if (!res.ok) throw Error(`${f.name}: ${res.error}`);
      return res.lines;
    } finally { setProgress(null); }
  };

  const { accounts, transactions, preferences } = store;
  const live = accounts.filter((a) => !a.archived);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setErrors([]);
    const next: Loaded[] = [];
    const failed: string[] = [];
    for (const f of [...list]) {
      try {
        const read = await readStatementFile(f, serverRead);
        const id = identifyFile(read.rows, read.files[0]?.lines ?? [], accounts);
        for (const file of read.files) {
          const t = totals(file.lines);
          const hint = id.hint ? { ...id.hint, name: file.currency === "INR" ? id.hint.name : `${id.hint.name} ${file.currency}` } : null;
          const accountId = file.accountId ?? id.accountId;
          const named = accounts.find((a) => a.id === accountId);
          next.push({ file: { ...file, accountId, hint }, accountName: named?.name ?? hint?.name ?? "unknown account", entries: t.count, debits: t.debits, credits: t.credits });
        }
      } catch (e) {
        failed.push(e instanceof Error ? e.message : `${f.name}: couldn’t be read`);
      }
    }
    setLoaded((prev) => [...prev.filter((p) => !next.some((n) => n.file.name === p.file.name)), ...next]);
    setErrors(failed);
    setBusy(false);
    if (next.length) toast.success(`${next.length} statement${next.length === 1 ? "" : "s"} read on this device`);
  };

  const drop = (file: StmtFile): StmtFile => {
    const over = destinations[`${file.name}\u0000account`];
    if (!over) return file;
    if (over === "__new__") return { ...file, accountId: null, hint: file.hint ?? { name: file.name.replace(/\.[a-z]+$/i, "").slice(0, 40) || "New account", kind: "savings", issuer: "", lastFour: null } };
    return { ...file, accountId: over, hint: null };
  };

  const plan: StatementPlan | null = useMemo(() => {
    if (!loaded.length) return null;
    return buildPlan(loaded.map((l) => drop(l.file)), accounts, transactions, preferences.categories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, destinations, accounts, transactions, preferences.categories]);

  const api = () => {
    const s = storeRef.current;
    return { save: s.save, remove: s.remove, reconcile: s.reconcile, addAccount: s.addAccount, setArchived: s.setArchived, refresh: s.refresh, transactions: s.transactions };
  };

  const apply = async () => {
    if (!plan) return;
    const requests = plan.accounts
      .map((a) => ({
        account: a,
        decisions: [...a.auto, ...a.ask.filter((d) => accepted.includes(d.line.key))],
        destination: destinations[a.file.name] ?? null,
        reconcileIds: a.matched.filter((m) => m.record && !m.record.reconciledAt).map((m) => ({ id: m.record!.id, ref: `${m.line.file} · ${m.line.date} · ${m.line.amount.toFixed(2)}` })),
      }))
      .filter((r) => r.decisions.length || r.reconcileIds.length);
    if (!requests.length) {
      toast.error("Nothing selected to save yet.");
      return;
    }
    try {
      setProgress("Saving…");
      const r = await applyUpload(requests, api(), setProgress);
      setResult(r);
      setAccepted([]);
      const upload: StatementUpload = { id: crypto.randomUUID(), at: new Date().toISOString(), label: plan.accounts.map((a) => a.file.name).join(", ").slice(0, 200), posted: r.posted, reconciled: r.reconciled, createdAccounts: r.createdAccounts };
      try { const s = storeRef.current; await s.savePreferences({ ...s.preferences, statementUploads: [upload, ...(s.preferences.statementUploads ?? [])].slice(0, 10) }); }
      catch { toast.error("Saved, but undo history couldn’t sync to your other devices."); }
      toast.success(`${r.posted.length} entries posted · ${r.reconciled.length} records marked as matched${r.createdAccounts.length ? ` · ${r.createdAccounts.length} account${r.createdAccounts.length === 1 ? "" : "s"} created` : ""}`, {
        action: { label: "Undo", onClick: () => void undo(r) },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nothing was saved — try again.");
    } finally {
      setProgress(null);
    }
  };

  const undo = async (r: ApplyResult, uploadId?: string) => {
    try {
      setProgress("Undoing…");
      const { left } = await undoUpload(r, api());
      setResult(null);
      const s = storeRef.current;
      const list = s.preferences.statementUploads ?? [];
      const target = uploadId ?? list.find((u) => u.posted.join() === r.posted.join() && u.reconciled.join() === r.reconciled.join())?.id;
      if (target && !left.length) await s.savePreferences({ ...s.preferences, statementUploads: list.filter((u) => u.id !== target) });
      if (left.length) toast.error(`${left.length} item${left.length === 1 ? "" : "s"} couldn’t be reversed — try Undo again.`);
      else toast.success("Upload reversed — your records are as they were");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t reverse the upload.");
    } finally {
      setProgress(null);
    }
  };

  const prepareFix = (a: AccountPlan) => {
    const dirs = new Set(a.wrongKind.map((m) => m.line.direction));
    if (dirs.size !== 1) {
      toast.error("Money out and money in are mixed here — act on each group separately.");
      return;
    }
    const kindFix: TxnType = [...dirs][0] === "debit" ? "expense" : "income";
    const rows = a.wrongKind.map((m) => ({
      transaction: transactions.find((t) => t.id === m.record!.id)!,
      issues: [],
      group: "account",
      status: "Suggested Correction",
      confidence: m.confidence,
      targetAccountIds: [a.accountId ?? ""],
      evidence: m.reasons,
    })) as unknown as FinancialReview[];
    if (rows.some((r) => !r.transaction)) {
      toast.error("A record changed since this was read. Reload and try again.");
      return;
    }
    try {
      fixOp.current = crypto.randomUUID();
      setFix({ preview: correctionPreview(rows, { txnType: kindFix }, accounts, transactions), name: a.file.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t prepare the change.");
    }
  };

  const prepareMove = (a: AccountPlan) => {
    if (!a.accountId) return;
    const rows = a.elsewhere.map((m) => ({ transaction: transactions.find((t) => t.id === m.record.id)!, issues: [], group: "account", status: "Suggested Correction", confidence: 1, targetAccountIds: [a.accountId], evidence: ["Same amount and date on this statement"] })) as unknown as FinancialReview[];
    if (rows.some((r) => !r.transaction)) { toast.error("A record changed since this was read. Reload and try again."); return; }
    try {
      fixOp.current = crypto.randomUUID();
      setFix({ preview: correctionPreview(rows, { accountId: a.accountId }, accounts, transactions), name: a.file.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t prepare the move.");
    }
  };

  const applyFix = async () => {
    if (!fix) return;
    try {
      await store.correctFinancialEntries(fix.preview, fixOp.current);
      toast.success(`${fix.preview.records.length} records now match the statement`, { action: { label: "Undo", onClick: () => void store.undoFinancialCorrection(fixOp.current) } });
      setFix(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nothing changed — try again.");
    }
  };

  const exportCsv = () => {
    if (!plan) return;
    const q = (s: string | number) => `"${String(s).replaceAll('"', '""')}"`;
    const rows = ["file,account,date,description,amount,direction,outcome,reason"];
    for (const a of plan.accounts) {
      for (const m of a.matched) rows.push([a.file.name, a.name, m.line.date, m.line.description, m.line.amount, m.line.direction, "already recorded", m.reasons.join("; ")].map(q).join(","));
      for (const m of a.wrongKind) rows.push([a.file.name, a.name, m.line.date, m.line.description, m.line.amount, m.line.direction, "saved the wrong way", m.reasons.join("; ")].map(q).join(","));
      for (const d of [...a.auto, ...a.ask]) rows.push([a.file.name, a.name, d.line.date, d.line.description, d.line.amount, d.line.direction, d.group === "auto" ? "save automatically" : "needs your decision", d.reason].map(q).join(","));
      for (const l of a.later) rows.push([a.file.name, a.name, l.line.date, l.line.description, l.line.amount, l.line.direction, "held back", l.reason].map(q).join(","));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = "statement-desk-plan.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const askKeys = plan?.accounts.flatMap((a) => a.ask.map((d) => d.line.key)) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Inbox className="size-5" /> Statement Desk</h1>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> Drop in as many statements as you like — PDF, CSV or Excel. They are read on this device, matched against your records, and nothing is saved until you say so.</p>
      </header>

      <Card className="space-y-3 p-4">
        <div
          className="rounded-2xl border border-dashed p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files); }}
        >
          <Upload className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-1 text-sm">Drag statements here, or</p>
          <Button className="mt-2" variant="outline" onClick={() => inputRef.current?.click()}>Choose files</Button>
          <input ref={inputRef} aria-label="Statement files" type="file" multiple accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        </div>
        {busy && <p role="status" className="text-sm text-muted-foreground">Reading statements on this device…</p>}
        {progress && <p role="status" className="text-sm text-muted-foreground">{progress}</p>}
        {errors.length > 0 && <ul className="space-y-1 text-sm text-destructive" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

        {loaded.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {loaded.map((l) => (
              <li key={l.file.name} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.file.name}</p>
                  <p className="text-xs text-muted-foreground">{l.entries} entries · out {money(l.debits, l.file.currency)} · in {money(l.credits, l.file.currency)} · closing {l.file.closing !== null ? money(l.file.closing, l.file.currency) : "not printed"}</p>
                  <p className="text-xs">Account: <span className="font-medium">{l.accountName}</span>{l.file.accountId ? "" : " · new account"}</p>
                  <label className="mt-1 block text-xs text-muted-foreground">This statement belongs to
                    <select
                      className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                      value={destinations[`${l.file.name}\u0000account`] ?? l.file.accountId ?? "__new__"}
                      onChange={(e) => setDestinations((d) => ({ ...d, [`${l.file.name}\u0000account`]: e.target.value }))}
                    >
                      <option value="__new__">Create a new account for it</option>
                      {live.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                </div>
                <Button variant="ghost" size="sm" aria-label={`Remove ${l.file.name}`} onClick={() => setLoaded((xs) => xs.filter((x) => x.file.name !== l.file.name))}><X className="size-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {plan && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              { label: "Already recorded", value: plan.totals.matched },
              { label: "Saved automatically", value: plan.totals.auto },
              { label: "Needs your decision", value: plan.totals.ask },
              { label: "Held back", value: plan.totals.later },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground">{t.label}</div>
                <div className="font-display text-lg font-semibold">{t.value}</div>
              </div>
            ))}
          </div>

          {plan.accounts.map((a) => (
            <Card key={a.file.name} title={a.file.name} className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                {a.isNew ? `New account: ${a.name}` : a.name}
                {a.appBalance !== null ? ` · balance in the app ${money(a.appBalance)}` : ""}
                {a.gate && a.newerEntries ? " · the app has newer entries than this statement, so its closing balance isn’t compared" : a.gate ? ` · after these postings ${money(a.gate.after)}${a.gate.difference !== null ? ` · statement says ${money(a.gate.after + a.gate.difference)}` : " · no printed closing figure"}` : ""}
              </p>
              {a.gateHeld && a.gate && <p className="text-sm text-destructive" role="status">Balance check off by {money(Math.abs(a.gate.difference ?? 0))} — postings for this account are held until it adds up.</p>}

              {a.auto.length > 0 && (
                <section aria-label="Saved automatically">
                  <h3 className="font-semibold">Saved automatically · {a.auto.length}</h3>
                  <ul className="mt-1 divide-y divide-border rounded-xl border border-border text-sm">
                    {a.auto.map((d) => (
                      <li key={d.line.key} className="flex items-start justify-between gap-3 p-2">
                        <span className="min-w-0"><span className="block truncate">{d.line.date} · {d.line.description}</span><span className="text-xs text-muted-foreground">{d.draft.category} · {d.reason}</span></span>
                        <span className="shrink-0 tabular-nums">{d.line.direction === "debit" ? "−" : "+"}{money(d.line.amount, d.line.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {a.ask.length > 0 && (
                <section aria-label="Needs your decision">
                  <h3 className="font-semibold">Needs your decision · {a.ask.length}</h3>
                  {a.ask.some((d) => d.needsDestination) && (
                    <label className="mt-1 block text-sm text-muted-foreground">Movements on this statement go to
                      <select className="mt-0.5 h-10 w-full rounded-md border border-input bg-background px-2" value={destinations[a.file.name] ?? ""} onChange={(e) => setDestinations((d) => ({ ...d, [a.file.name]: e.target.value }))}>
                        <option value="">Choose account…</option>
                        {live.filter((x) => x.id !== a.accountId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </label>
                  )}
                  <ul className="mt-1 divide-y divide-border rounded-xl border border-border text-sm">
                    {a.ask.map((d) => (
                      <li key={d.line.key} className="flex items-start gap-3 p-2">
                        <Checkbox aria-label={`Save ${d.line.description}`} checked={accepted.includes(d.line.key)} onCheckedChange={(v) => setAccepted((xs) => (v === true ? [...new Set([...xs, d.line.key])] : xs.filter((x) => x !== d.line.key)))} />
                        <span className="min-w-0 flex-1"><span className="block truncate">{d.line.date} · {d.line.description}</span><span className="block text-xs text-muted-foreground">{d.draft.category} · {d.reason}</span></span>
                        <span className="shrink-0 tabular-nums">{d.line.direction === "debit" ? "−" : "+"}{money(d.line.amount, d.line.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {a.elsewhere.length > 0 && (
              <section aria-label="Saved on another account">
                <h3 className="font-semibold">Saved on another account · {a.elsewhere.length}</h3>
                <ul className="space-y-1 text-sm">{a.elsewhere.map((m) => <li key={m.line.key} className="flex justify-between gap-2"><span className="min-w-0 truncate">{m.line.date} · {m.record.name} — on {m.accountName}</span><span className="shrink-0 tabular-nums">{money(m.line.amount, m.line.currency)}</span></li>)}</ul>
                <Button size="sm" variant="outline" className="mt-1" onClick={() => prepareMove(a)}>Preview moving {a.elsewhere.length} here</Button>
              </section>
              )}
              {a.wrongKind.length > 0 && (
                <section aria-label="Saved the wrong way">
                  <h3 className="font-semibold">Saved the wrong way · {a.wrongKind.length}</h3>
                  <p className="text-sm text-muted-foreground">These records sit on this account but the statement shows the money going the other way.</p>
                  <ul className="mt-1 divide-y divide-border rounded-xl border border-border text-sm">
                    {a.wrongKind.map((m) => (
                      <li key={m.line.key} className="flex items-start justify-between gap-3 p-2">
                        <span className="min-w-0"><span className="block truncate">{m.line.date} · {m.record?.name}</span><span className="text-xs text-muted-foreground">{m.reasons.join(" · ")}</span></span>
                        <span className="shrink-0 tabular-nums">{money(m.line.amount, m.line.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-2" variant="outline" onClick={() => prepareFix(a)}>Correct these to match the statement</Button>
                </section>
              )}

              {a.later.length > 0 && (
                <section aria-label="Held back">
                  <h3 className="font-semibold">Held back · {a.later.length}</h3>
                  <ul className="mt-1 divide-y divide-border rounded-xl border border-border text-sm">
                    {a.later.map((l) => (
                      <li key={l.line.key} className="p-2"><span className="block truncate">{l.line.date} · {l.line.description} · {money(l.line.amount, l.line.currency)}</span><span className="text-xs text-muted-foreground">{l.reason}</span></li>
                    ))}
                  </ul>
                </section>
              )}

              {a.unexplained.length > 0 && (
                <section aria-label="Records with no statement line">
                  <h3 className="font-semibold">Records with no statement line · {a.unexplained.length}</h3>
                  <p className="text-sm text-muted-foreground">These are on this account but no uploaded statement explains them. Upload the missing statement, or check them in the records check.</p>
                </section>
              )}
            </Card>
          ))}

          {fix && (
            <div role="region" aria-label="Change preview" className="space-y-2 rounded-2xl border border-primary p-3 text-sm">
              <p className="font-medium">{fix.preview.records.length} records in {fix.name} {fix.preview.choice.accountId ? "will move to this statement's account" : `will be re-typed as ${String(fix.preview.choice.txnType)}`}</p>
              <ul className="space-y-0.5">{fix.preview.balanceChanges.map((b) => <li key={b.id}>{b.name}: balance {b.change >= 0 ? "+" : ""}{money(b.change)}</li>)}</ul>
              <div className="flex gap-2"><Button variant="outline" onClick={() => setFix(null)}>Cancel</Button><Button onClick={applyFix}>Confirm and apply</Button></div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={apply} disabled={!!progress}>{progress ?? `Apply everything (${plan.totals.auto + accepted.length} to save)`}</Button>
            {askKeys.length > 0 && <Button variant="outline" onClick={() => setAccepted(askKeys)}>Accept all {askKeys.length} asking items</Button>}
            {result && <Button variant="outline" onClick={() => void undo(result)}>Undo this upload ({result.posted.length} posted)</Button>}
            <Button variant="ghost" onClick={exportCsv}><Download className="size-4" /> Export the plan</Button>
          </div>
        </>
      )}

      {(preferences.statementUploads ?? []).length > 0 && (
        <Card className="space-y-2 p-3" aria-label="Recent uploads">
          <h2 className="font-medium">Recent uploads (any device)</h2>
          <ul className="space-y-2">
            {(preferences.statementUploads ?? []).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate">{u.label || "Upload"}</span><span className="text-xs text-muted-foreground">{new Date(u.at).toLocaleString()} · {u.posted.length} posted · {u.reconciled.length} matched</span></span>
                <Button size="sm" variant="outline" disabled={!!progress} onClick={() => void undo(u, u.id)}>Undo</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Scanned PDFs and photos are read on the server (needs AI document reading on in Settings); their lines always wait for your decision. <Link to="/statement-accounts" className="underline">See statement coverage and move entries</Link>.</p>
    </div>
  );
}
