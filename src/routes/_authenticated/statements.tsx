import { csvCell } from "@/lib/csv-safe";
import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs } from "@/components/SectionTabs";
import { AccountantSettings } from "@/components/AccountantSettings";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Inbox, ShieldCheck, Upload, X } from "lucide-react";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Clipped } from "@/components/Clipped";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { accountBalance } from "@/lib/ledger";
import type { TxnType } from "@/lib/ledger";
import { correctionPreview, type CorrectionPreview } from "@/lib/financial-corrections";
import type { FinancialReview } from "@/lib/financial-review";
import { identifyFile } from "@/lib/statement-pipeline/identify";
import { readStatementFile, readDocRows } from "@/lib/statement-pipeline/source";
import { parseInvestmentDoc, type InvestDoc } from "@/lib/investments/demat";
import { InvestmentReview } from "@/components/InvestmentReview";
import { DocumentIntake, type ResumeState } from "@/components/DocumentIntake";
import { UnfinishedRuns } from "@/components/books/UnfinishedRuns";
import { CONTEXTS, parseContext, type IntakeContext } from "@/lib/books/intake";
import { useServerFn } from "@tanstack/react-start";
import { extractStatement } from "@/lib/statement-extract.functions";
import type { StatementUpload } from "@/lib/preferences";
import { Link } from "@tanstack/react-router";
import { buildPlan, type AccountPlan, type StatementPlan } from "@/lib/statement-pipeline/plan";
import { applyUpload, undoUpload, type ApplyResult } from "@/lib/statement-pipeline/apply";
import { totals, type StmtFile } from "@/lib/statement-pipeline/line";
import { AccountantInbox } from "@/components/AccountantInbox";
import { emiTargets } from "@/lib/emi-match";
import { matchDraftsToLines, type DraftMatch } from "@/lib/statement-pipeline/draft-match";
import { reconSummary } from "@/lib/statement-pipeline/summary";
import { listDrafts, draftReceiptFile, linkDraftToTransaction, unlinkDraft, type Draft } from "@/lib/drafts";
import type { ReceiptDetails } from "@/lib/expenses";
import { NewStatementAccount, defaultEntityChoice } from "@/components/NewStatementAccount";
import { linkAccounts, stubEntity } from "@/lib/books/entity-accounts";
import { emptyBooks } from "@/lib/books/types";
import { newAccountFromHint } from "@/lib/statement-pipeline/apply";
import type { AccountHint } from "@/lib/statement-pipeline/line";
import { supabase } from "@/integrations/supabase/client";
import { suggestTransfers, transferApprovalBlocker, activeLinks, type TransferLinkRow } from "@/lib/transfer-match";

export const Route = createFileRoute("/_authenticated/statements")({
  validateSearch: (s: Record<string, unknown>): { tab?: "accountant"; context?: IntakeContext; replaces?: string } => {
    const context = parseContext(s["context"]);
    const replaces = typeof s["replaces"] === "string" && /^[0-9a-f-]{36}$/i.test(s["replaces"]) ? s["replaces"] : undefined;
    return { ...(s["tab"] === "accountant" ? { tab: "accountant" as const } : {}), ...(context ? { context } : {}), ...(replaces ? { replaces } : {}) };
  },
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
  const { tab, context, replaces } = Route.useSearch();
  /** Non-bank documents (company papers, deeds, leases, audited accounts, invoices) — reviewed here, stored in DocuRepo. */
  const [docs, setDocs] = useState<{ key: string; file: File; resume?: ResumeState; context?: IntakeContext | undefined }[]>([]);
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const [loaded, setLoaded] = useState<Loaded[]>([]);
  /** Investment documents (demat, trades, capital gains) go to their own review, never into the bank ledger. */
  const [invest, setInvest] = useState<{ key: string; file: File; doc: InvestDoc }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [hintEdits, setHintEdits] = useState<Record<string, Partial<AccountHint>>>({});
  const [links, setLinks] = useState<TransferLinkRow[] | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  /** Line keys whose receipt pairing the owner changed from the default (sure = on, check = off). */
  const [draftFlip, setDraftFlip] = useState<string[]>([]);
  useEffect(() => { listDrafts().then(setDrafts).catch(() => setDrafts([])); }, []);
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

  const originals = useRef(new Map<string, File>());
  const add = async (list: FileList | File[] | null, asStatement = false) => {
    if (!list?.length) return;
    setBusy(true);
    setErrors([]);
    const next: Loaded[] = [];
    const failed: string[] = [];
    for (const f of [...list]) {
      try {
        const inv = parseInvestmentDoc(await readDocRows(f).catch(() => []));
        if (inv) { setInvest((p) => [...p.filter((x) => x.file.name !== f.name), { key: `${f.name}-${f.size}-${f.lastModified}`, file: f, doc: inv }]); continue; }
        const asDoc = () => setDocs((p) => [...p.filter((x) => x.file.name !== f.name), { key: `${f.name}-${f.size}-${f.lastModified}`, file: f }]);
        const docLike = /\.(pdf|png|jpe?g|webp)$/i.test(f.name);
        if (!asStatement && context && context !== "investments" && docLike) { asDoc(); continue; }
        let read: Awaited<ReturnType<typeof readStatementFile>>;
        try { read = await readStatementFile(f, serverRead); }
        catch (e) { if (docLike) { asDoc(); continue; } throw e; }
        if (!read.files.some((x) => x.lines.length) && docLike) { asDoc(); continue; }
        const id = identifyFile(read.rows, read.files[0]?.lines ?? [], accounts);
        for (const file of read.files) {
          const t = totals(file.lines);
          const hint = id.hint ? { ...id.hint, name: file.currency === "INR" ? id.hint.name : `${id.hint.name} ${file.currency}` } : null;
          const accountId = file.accountId ?? id.accountId;
          const named = accounts.find((a) => a.id === accountId);
          originals.current.set(file.name, f);
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

  const drop = (raw: StmtFile): StmtFile => {
    const edits = hintEdits[raw.name];
    const file = edits && raw.hint ? { ...raw, hint: { ...raw.hint, ...edits } } : raw;
    const over = destinations[`${file.name}\u0000account`];
    if (!over) return file;
    if (over === "__new__") return { ...file, accountId: null, hint: file.hint ?? { name: file.name.replace(/\.[a-z]+$/i, "").slice(0, 40) || "New account", kind: "savings", issuer: "", lastFour: null } };
    return { ...file, accountId: over, hint: null };
  };

  const plan: StatementPlan | null = useMemo(() => {
    if (!loaded.length) return null;
    return buildPlan(loaded.map((l) => drop(l.file)), accounts, transactions, preferences.categories, emiTargets(store.loans, store.commitments, accounts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, destinations, accounts, transactions, preferences.categories, store.loans, store.commitments]);

  const draftMatches: DraftMatch[] = useMemo(() => {
    if (!plan) return [];
    return matchDraftsToLines(plan.accounts.flatMap((a) => [...a.auto, ...a.ask].map((d) => d.line)), drafts);
  }, [plan, drafts]);
  const draftOn = (m: DraftMatch) => (m.certainty === "sure") !== draftFlip.includes(m.lineKey);
  const draftLinksFor = (a: AccountPlan) => {
    const keys = new Set([...a.auto, ...a.ask].map((d) => d.line.key));
    return Object.fromEntries(draftMatches.filter((m) => keys.has(m.lineKey) && draftOn(m)).flatMap((m) => {
      const d = drafts.find((x) => x.id === m.draftId); if (!d) return [];
      const x = d.data; const exact = Math.abs(m.amountGap) < 0.005;
      return [[m.lineKey, { draftId: d.id, overrides: { title: x.title || x.merchant, merchant: x.merchant, category: x.category, description: x.description, ...(exact && x.receiptDetails ? { receiptDetails: x.receiptDetails as ReceiptDetails } : {}) }, files: async () => (await Promise.all(d.receipts.map(draftReceiptFile))).filter((f): f is File => !!f) }]];
    }));
  };

  const api = () => {
    const s = storeRef.current;
    return { save: s.save, remove: s.remove, reconcile: s.reconcile, addAccount: s.addAccount, setArchived: s.setArchived, refresh: s.refresh, transactions: s.transactions, linkDraft: linkDraftToTransaction, unlinkDraft };
  };

  const apply = async () => {
    if (!plan) return;
    const requests = plan.accounts
      .map((a) => ({
        account: a,
        decisions: [...a.auto, ...a.ask.filter((d) => accepted.includes(d.line.key))],
        destination: destinations[a.file.name] ?? null,
        draftLinks: draftLinksFor(a),
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
      void loadLinks();
      listDrafts().then(setDrafts).catch(() => {}); setDraftFlip([]);
      const upload: StatementUpload = { id: crypto.randomUUID(), at: new Date().toISOString(), label: plan.accounts.map((a) => a.file.name).join(", ").slice(0, 200), posted: r.posted, reconciled: r.reconciled, createdAccounts: r.createdAccounts };
      // Keep each statement original once in DocuRepo, evidence-locked, so posted lines trace back to their file [§3].
      const kept = new Set<File>();
      for (const a of plan.accounts) {
        const f = originals.current.get(a.file.name);
        if (!f || kept.has(f) || !requests.some((q) => q.account === a)) continue;
        kept.add(f);
        const ds = a.file.lines.map((l) => l.date).sort();
        try { await storeRef.current.addDocument(f, { title: `Statement · ${a.file.name}`, docType: a.file.hint?.kind === "credit_card" || /card/i.test(a.file.name) ? "card_statement" : "bank_statement", docDate: ds[ds.length - 1] ?? null, amount: null, currency: a.file.currency, merchant: null, notes: `Statement Desk upload ${upload.id}: ${a.file.lines.length} lines (${ds[0] ?? "?"} to ${ds[ds.length - 1] ?? "?"}).`, transactionId: null, accountId: a.file.accountId, loanId: null, expiresOn: null, evidenceLocked: true }); }
        catch { toast.error(`Posted, but the original of ${f.name} couldn’t be stored in DocuRepo.`); }
      }
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

  const loadLinks = async () => {
    const q = await supabase.from("transfer_links").select("*");
    setLinks(q.error ? [] : ((q.data ?? []) as unknown as TransferLinkRow[]));
  };
  const createFor = async (l: Loaded) => {
    const f = drop(l.file);
    if (!f.hint) return;
    try {
      const id = await storeRef.current.addAccount(newAccountFromHint(f.hint, f.opening));
      setDestinations((d) => ({ ...d, [`${l.file.name}\u0000account`]: id }));
      const st = storeRef.current; const ents = st.preferences.entities ?? [];
      const choice = defaultEntityChoice(f.hint, ents);
      if (choice) {
        const e = choice === "__new" ? stubEntity(f.hint.holder ?? f.hint.name) : null;
        const books = st.preferences.books ?? emptyBooks();
        await st.savePreferences({ ...st.preferences, entities: e ? [...ents, e] : ents, books: { ...books, entityAccounts: linkAccounts(books.entityAccounts ?? {}, e ? e.id : choice, [id]) } });
      }
      setLoaded((xs) => xs.map((x) => (x.file.name === l.file.name ? { ...x, accountName: f.hint!.name } : x)));
      toast.success(`${f.hint.name} added — this statement is now matched against it`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add the account"); }
  };
  // Transfers touching what this upload just posted; clear ones are ticked, amount-only ones wait for a decision.
  const postedSet = new Set(result?.posted ?? []);
  const transferHints = links && result ? suggestTransfers(transactions, accounts, links).filter((s) => postedSet.has(s.debit.id) || (s.credit && postedSet.has(s.credit.id))) : [];
  const linkClear = async () => {
    const clear = transferHints.filter((s) => s.strength === "strong" && !transferApprovalBlocker(s.debit, s.credit, s.destId, accounts));
    let ok = 0; const failed: string[] = [];
    for (const [i, s] of clear.entries()) {
      setLinking(`Linking ${i + 1} of ${clear.length}…`);
      const id = activeLinks(links ?? []).find((x) => x.debit_id === s.debit.id && !x.credit_id)?.id ?? crypto.randomUUID();
      try { await storeRef.current.confirmTransfer({ id, debit: s.debit, destId: s.destId, credit: s.credit }); ok++; }
      catch (e) { failed.push((e as Error).message); }
    }
    setLinking(null); await loadLinks();
    if (ok) toast.success(`${ok} transfer${ok > 1 ? "s" : ""} linked between your accounts`);
    if (failed.length) toast.error(`${failed.length} not linked — ${failed[0]}`);
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
    const q = csvCell;
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

  if (tab === "accountant") return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold"><Inbox className="size-5" /> Statement Desk</h1>
      <SectionTabs group="statements" active="accountant" />
      <AccountantSettings />
    </div>
  );
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <SectionTabs group="statements" active="upload" />
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Inbox className="size-5" /> Statement Desk</h1>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> Drop in any financial or legal document — bank, card, loan, demat, trades, capital gains, company papers, audited accounts, deeds, leases, invoices; PDF, photo, CSV or Excel. They are read on this device, matched against your records, and nothing is saved until you say so.</p>
      </header>

      {context && <p className="rounded-xl bg-secondary px-3 py-2 text-sm">Adding for <b>{CONTEXTS[context]}</b> — any document you drop is identified, read and filed in DocuRepo, then you confirm what it creates.</p>}
      <AccountantInbox onFiles={add} />

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

        <UnfinishedRuns active={docs.map((d) => d.resume?.runId ?? d.key)} onResume={(file, resume, ctx) => setDocs((p) => [...p.filter((y) => y.resume?.runId !== resume.runId), { key: resume.runId, file, resume, context: parseContext(ctx) }])} />
        {docs.map((x) => <DocumentIntake key={x.key} file={x.file} context={x.context ?? context} resume={x.resume} replacesId={replaces} onClose={() => setDocs((p) => p.filter((y) => y.key !== x.key))} onStatement={() => { setDocs((p) => p.filter((y) => y.key !== x.key)); void add([x.file], true); }} />)}
        {invest.map((x) => <InvestmentReview key={x.key} file={x.file} doc={x.doc} onClose={() => setInvest((p) => p.filter((y) => y.key !== x.key))} onUploadMore={() => inputRef.current?.click()} />)}

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
                  {(destinations[`${l.file.name}\u0000account`] ?? l.file.accountId ?? "__new__") === "__new__" && (
                    <NewStatementAccount hint={drop(l.file).hint} file={l.file} accounts={accounts} entities={preferences.entities ?? []}
                      onEdit={(patch) => setHintEdits((h) => ({ ...h, [l.file.name]: { ...h[l.file.name], ...patch } }))}
                      onCreate={() => createFor(l)} />
                  )}
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
              {(() => { const r = reconSummary(a); const cur = a.file.currency; return (
                <section aria-label="Reconciliation summary" className={`space-y-2 rounded-xl border-2 p-3 text-sm ${r.ok ? "border-border" : "border-warning bg-warning/10"}`}>
                  <h3 className="font-semibold">{r.ok ? "Before you save · everything agrees" : "Before you save · check these"}</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    {([["Already in the app", r.matched], ["Will save", r.toSave], ["Unmatched lines", r.unmatchedLines], ["In app, not on statement", r.notOnStatement]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>)}
                  </dl>
                  <ul className="space-y-0.5 text-xs">
                    <li>{r.statementGap === null ? "Statement balances: opening or closing not printed, so the file can't check itself." : r.statementGap === 0 ? "Statement balances: opening + entries = printed closing." : `Statement balances don't add up — off by ${money(Math.abs(r.statementGap), cur)}.`}</li>
                    <li>{r.appGap === null ? (a.newerEntries ? "App balance: the app has newer entries, so it isn't compared." : "App balance: can't be compared without a printed closing figure.") : Math.abs(r.appGap) < 0.01 ? "App balance after saving matches the statement's closing figure." : `App balance after saving differs from the statement by ${money(Math.abs(r.appGap), cur)}.`}</li>
                    {r.needDecision > 0 && <li>{r.needDecision} line{r.needDecision > 1 ? "s" : ""} need your decision below.</li>}
                    {r.held > 0 && <li>{r.held} line{r.held > 1 ? "s are" : " is"} held back until the balance adds up.</li>}
                    {r.elsewhere > 0 && <li>{r.elsewhere} line{r.elsewhere > 1 ? "s look" : " looks"} saved on another account.</li>}
                    {r.wrongKind > 0 && <li>{r.wrongKind} record{r.wrongKind > 1 ? "s were" : " was"} saved the wrong way (money in vs out).</li>}
                  </ul>
                </section>); })()}
              {(() => { const keys = new Set([...a.auto, ...a.ask].map((d) => d.line.key)); const ms = draftMatches.filter((m) => keys.has(m.lineKey)); if (!ms.length) return null; const lineOf = (k: string) => [...a.auto, ...a.ask].find((d) => d.line.key === k)!.line; return (
                <section aria-label="Receipt drafts matched" className="space-y-2">
                  <h3 className="font-semibold">Receipts matched to bank lines · {ms.length}</h3>
                  <p className="text-xs text-muted-foreground">Ticked receipts attach their photo, shop and category to the bank entry; the bank amount and date are kept. Unsure ones start unticked.</p>
                  <ul className="divide-y divide-border rounded-xl border border-border text-sm">{ms.map((m) => { const d = drafts.find((x) => x.id === m.draftId); const l = lineOf(m.lineKey); return (
                    <li key={m.lineKey} className="flex items-start gap-3 p-2">
                      <Checkbox aria-label={`Use receipt ${d?.data.merchant ?? ""} for ${l.description}`} checked={draftOn(m)} onCheckedChange={() => setDraftFlip((xs) => xs.includes(m.lineKey) ? xs.filter((x) => x !== m.lineKey) : [...xs, m.lineKey])} />
                      <span className="min-w-0 flex-1"><span className="block truncate">{d?.data.merchant || d?.data.title || "Receipt"} · {d?.data.date} → {l.date} · {l.description}</span><span className={`block text-xs ${m.certainty === "sure" ? "text-muted-foreground" : "text-warning"}`}>{m.certainty === "sure" ? "Sure match" : "Check this"} · {m.reasons.join(" · ")}</span></span>
                      <span className="shrink-0 tabular-nums">{money(l.amount, l.currency)}</span>
                    </li>); })}</ul>
                </section>); })()}

              {a.auto.length > 0 && (
                <section aria-label="Saved automatically">
                  <h3 className="font-semibold">Saved automatically · {a.auto.length}</h3>
                  <Clipped className="mt-1 divide-y divide-border rounded-xl border border-border text-sm" items={a.auto} render={(d) => (
                      <li key={d.line.key} className="flex items-start justify-between gap-3 p-2">
                        <span className="min-w-0"><span className="block truncate">{d.line.date} · {d.line.description}</span><span className="text-xs text-muted-foreground">{d.draft.category} · {d.reason}</span></span>
                        <span className="shrink-0 tabular-nums">{d.line.direction === "debit" ? "−" : "+"}{money(d.line.amount, d.line.currency)}</span>
                      </li>
                    )} />
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
                  <Clipped className="mt-1 divide-y divide-border rounded-xl border border-border text-sm" items={a.ask} render={(d) => (
                      <li key={d.line.key} className="flex items-start gap-3 p-2">
                        <Checkbox aria-label={`Save ${d.line.description}`} checked={accepted.includes(d.line.key)} onCheckedChange={(v) => setAccepted((xs) => (v === true ? [...new Set([...xs, d.line.key])] : xs.filter((x) => x !== d.line.key)))} />
                        <span className="min-w-0 flex-1"><span className="block truncate">{d.line.date} · {d.line.description}</span><span className="block text-xs text-muted-foreground">{d.draft.category} · {d.reason}</span></span>
                        <span className="shrink-0 tabular-nums">{d.line.direction === "debit" ? "−" : "+"}{money(d.line.amount, d.line.currency)}</span>
                      </li>
                    )} />
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
                  <Clipped className="mt-1 divide-y divide-border rounded-xl border border-border text-sm" items={a.wrongKind} render={(m) => (
                      <li key={m.line.key} className="flex items-start justify-between gap-3 p-2">
                        <span className="min-w-0"><span className="block break-words [overflow-wrap:anywhere]">{m.line.date} · {m.record?.name}</span><span className="text-xs text-muted-foreground">{m.reasons.join(" · ")}</span></span>
                        <span className="shrink-0 tabular-nums">{money(m.line.amount, m.line.currency)}</span>
                      </li>
                    )} />
                  <Button className="mt-2" variant="outline" onClick={() => prepareFix(a)}>Correct these to match the statement</Button>
                </section>
              )}

              {a.later.length > 0 && (
                <section aria-label="Held back">
                  <h3 className="font-semibold">Held back · {a.later.length}</h3>
                  <Clipped className="mt-1 divide-y divide-border rounded-xl border border-border text-sm" items={a.later} render={(l) => (
                      <li key={l.line.key} className="p-2"><span className="block truncate">{l.line.date} · {l.line.description} · {money(l.line.amount, l.line.currency)}</span><span className="text-xs text-muted-foreground">{l.reason}</span></li>
                    )} />
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

          <Dialog open={!!fix} onOpenChange={(o) => { if (!o) setFix(null); }}>
            <DialogContent aria-label="Change preview" className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Check before applying</DialogTitle>
                <DialogDescription>{fix?.preview.records.length} records in {fix?.name} {fix?.preview.choice.accountId ? "will move to this statement's account" : `will be re-typed as ${String(fix?.preview.choice.txnType)}`}</DialogDescription>
              </DialogHeader>
              <ul className="divide-y rounded-xl border text-sm">{fix?.preview.balanceChanges.map((b) => <li key={b.id} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 truncate">{b.name}</span><span className="shrink-0 font-mono">{b.change >= 0 ? "+" : ""}{money(b.change)}</span></li>)}</ul>
              <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setFix(null)}>Cancel</Button><Button onClick={applyFix}>Confirm and apply</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={apply} disabled={!!progress}>{progress ?? `Apply everything (${plan.totals.auto + accepted.length} to save)`}</Button>
            {askKeys.length > 0 && <Button variant="outline" onClick={() => setAccepted(askKeys)}>Accept all {askKeys.length} asking items</Button>}
            {result && <Button variant="outline" onClick={() => void undo(result)}>Undo this upload ({result.posted.length} posted)</Button>}
            <Button variant="ghost" onClick={exportCsv}><Download className="size-4" /> Export the plan</Button>
          </div>
          {transferHints.length > 0 && (
            <Card className="space-y-2 p-3" aria-label="Transfers between your accounts">
              <h3 className="font-semibold">Transfers between your accounts · {transferHints.length}</h3>
              <p className="text-xs text-muted-foreground">Clear matches share a reference or name the other account. Ones that only match on amount stay for you to decide on the Transfers page.</p>
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">{transferHints.map((s) => (
                <li key={s.key} className="flex items-start justify-between gap-3 p-2">
                  <span className="min-w-0"><span className="block truncate">{s.debit.date} · {s.debit.title}</span><span className="text-xs text-muted-foreground">{accounts.find((a) => a.id === s.debit.accountId)?.name ?? "—"} → {accounts.find((a) => a.id === s.destId)?.name ?? "—"} · {s.strength === "strong" ? "clear match" : "check this"}</span></span>
                  <span className="shrink-0 tabular-nums">{money(s.debit.amount)}</span>
                </li>))}</ul>
              <div className="flex flex-wrap gap-2">
                {transferHints.some((s) => s.strength === "strong") && <Button size="sm" disabled={!!linking} onClick={() => void linkClear()}>{linking ?? `Link ${transferHints.filter((s) => s.strength === "strong").length} clear matches`}</Button>}
                <Button size="sm" variant="outline" asChild><Link to="/transfers">Review on Transfers page</Link></Button>
              </div>
            </Card>
          )}
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
