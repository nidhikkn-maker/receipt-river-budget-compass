/**
 * Statement Desk review for every non-bank document (v6 §2–4, §6–16, §18, §27, §36, §38, §59, §62).
 * Upload → Identify → Extract → Validate → Match → Classify → Prepare → Confirm → Save → Reconcile → Audit.
 * Each step is recorded in a durable run, so an interrupted document resumes where it stopped; the run id is
 * the document id, so retrying a save never stores a second copy. Unknown terms stay blank and are asked.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, CircleDashed, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { extractDocument, type ExtractedDocument } from "@/lib/document-extract.functions";
import { DOC_LABEL, DOC_TYPES, duplicateDocuments, type DocField, type DocType } from "@/lib/documents";
import { ENTITY_KINDS } from "@/lib/entities";
import { autoName, fillLeaseFromTrusted, proposeAsset, proposeEntity, proposeFy, proposeLease, proposeProperty, proposeGstInvoice, proposeTaxStatement, suggestLinks, assetPayment, ROUTE_OF, trail, type IntakeContext, type Step } from "@/lib/books/intake";
import { proposeFundHoldings } from "@/lib/books/fund-statement";
import { commitIntake, type Confirmed } from "@/lib/books/commit";
import { emptyBooks, LEASE_TERMS, LEASE_TERM_LABEL, leaseUnknowns, requiresApproval, type Lease } from "@/lib/books/types";
import { HEAD_LABEL } from "@/lib/books/fy";
import { ASSET_KINDS, type AssetKind } from "@/lib/assets";
import { toObligations } from "@/lib/contracts";
import { closeRun, documentIdForRun, startRun, updateRun, type RunData } from "@/lib/books/runs";

const CONTEXT_TYPE: Partial<Record<IntakeContext, DocType>> = { entity: "incorporation", fy: "audited_financials", property: "property_deed", assets: "asset_invoice", gst: "gst_return" };
const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const isIso = (v: string | null | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export interface ResumeState { runId: string; read?: ExtractedDocument | undefined; docType?: DocType | undefined; fields?: DocField[] | undefined; data: RunData }

export function DocumentIntake({ file, context, onClose, resume, replacesId, onStatement }: { file: File; context?: IntakeContext | undefined; onClose: () => void; onStatement?: (() => void) | undefined; resume?: ResumeState | undefined; replacesId?: string | undefined }) {
  const store = useStore();
  const { preferences, savePreferences, addDocument, updateDocument, documents, accounts, loans } = store;
  const [linkAcc, setLinkAcc] = useState("");
  const [linkLoan, setLinkLoan] = useState("");
  const read = useServerFn(extractDocument);
  const runId = useRef(resume?.runId ?? crypto.randomUUID()).current;
  const runData = useRef<RunData>(resume?.data ?? {});
  const [x, setX] = useState<ExtractedDocument | null>(resume?.read ?? null);
  const [fields, setFields] = useState<DocField[]>(resume?.fields ?? []);
  const [docType, setDocType] = useState<DocType>(resume?.docType ?? (context ? CONTEXT_TYPE[context] ?? "other" : "other"));
  const [failed, setFailed] = useState<{ step: Step; note: string } | null>(null);
  const [stage, setStage] = useState<Step>(resume?.read ? "Confirm" : "Upload");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [leaseProperty, setLeaseProperty] = useState("");
  const [ownerOk, setOwnerOk] = useState(false);
  const [capOk, setCapOk] = useState(false);
  const books = preferences.books ?? emptyBooks();
  const entities = preferences.entities ?? [];

  const step = async (s: Step, patch: Parameters<typeof updateRun>[1] = {}) => {
    setStage(s);
    await updateRun(runId, { stage: s, ...patch }).catch(() => undefined); // progress is best-effort; the save itself is checked
  };

  useEffect(() => {
    if (resume?.read) return;
    let live = true;
    (async () => {
      let at: Step = "Upload";
      try {
        const run = await startRun(runId, file, context ?? "", replacesId ? { replacesId } : {});
        runData.current = run.data;
        at = "Identify"; await step("Identify");
        if (!(file.type.startsWith("image/") || /\.pdf$/i.test(file.name))) throw new Error("Only PDFs and photos can be read as documents");
        at = "Extract"; await step("Extract");
        const raw = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(file); });
        const prepared = await (await import("@/lib/image-prep")).prepareForReading(raw, file.type || "application/pdf");
        if (prepared.dataUrl.length > 4_000_000) throw new Error("File is too large to read (about 3 MB max)");
        const out = await read({ data: prepared });
        if (!live) return;
        if (!out.ok) throw new Error(out.error);
        const fs: DocField[] = (out.result.fields ?? []).map((f) => ({ ...f, originalValue: (f as { originalValue?: string }).originalValue ?? f.value, status: "read" as const }));
        const type = !context || out.result.docType !== "other" ? out.result.docType : docType;
        setX(out.result); setFields(fs); setDocType(type);
        at = "Validate"; await step("Validate");
        at = "Match"; await step("Match");
        at = "Classify"; await step("Classify");
        at = "Prepare records"; await step("Prepare records");
        runData.current = { ...runData.current, read: out.result, docType: type, fields: fs };
        await step("Confirm", { status: "waiting", data: runData.current });
      } catch (e) {
        if (!live) return;
        const note = (e as Error).message;
        setFailed({ step: at, note });
        await updateRun(runId, { stage: at, status: "failed", error: note }).catch(() => undefined);
      }
    })();
    return () => { live = false; };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = ROUTE_OF[docType];
  // Preselect the account/loan the document names; the owner can change it before saving [§6].
  const suggested = useMemo(() => (x ? suggestLinks(`${x.text ?? ""} ${fields.map((f) => `${f.label} ${f.value}`).join(" ")}`, accounts, loans.map((l) => ({ id: l.id, name: l.name }))) : null), [x, fields, accounts, loans]);
  const autoLinked = useRef(false);
  useEffect(() => {
    if (!suggested || autoLinked.current) return;
    autoLinked.current = true;
    if (suggested.accountId && !linkAcc) setLinkAcc(suggested.accountId);
    if (suggested.loanId && !linkLoan) setLinkLoan(suggested.loanId);
  }, [suggested]); // eslint-disable-line react-hooks/exhaustive-deps
  const proposal = useMemo(() => {
    if (!x) return null;
    // Proposed record ids derive from the run so a retry updates the same record.
    const id = runId;
    if (route === "entity" && x.entity) return { kind: "entity" as const, ...proposeEntity(x.entity, entities, id, today()) };
    if (route === "asset" && x.asset) {
      // Look in trusted records (the matching payment) before asking for missing details [§59].
      const pay = assetPayment(x.asset, store.transactions);
      const base = x.asset.cost == null && pay ? { ...x.asset, cost: pay.amount, purchaseDate: x.asset.purchaseDate ?? pay.date } : x.asset;
      // Owner-typed answers fill only what the document didn't print, so an incomplete suggestion stays editable [§7].
      const read = { ...base, name: base.name || edit["fillName"] || null, cost: base.cost ?? (Number(edit["fillCost"]) > 0 ? Number(edit["fillCost"]) : null), purchaseDate: base.purchaseDate ?? (isIso(edit["fillDate"]) ? edit["fillDate"]! : null) };
      const p = proposeAsset(read, entities, id, null);
      return { kind: "asset" as const, ...p, payment: pay, costFromPayment: x.asset.cost == null && !!pay, asset: p.asset ? { ...p.asset, ...(pay ? { transactionId: pay.id } : {}) } : null };
    }
    if (route === "property" && x.property) return { kind: "property" as const, ...proposeProperty(x.property, entities, id, null) };
    if (route === "lease" && x.lease) {
      const lr = x.lease;
      const p = proposeLease({ ...lr, tenant: lr.tenant || edit["fillTenant"] || null, rent: lr.rent ?? (Number(edit["fillRent"]) > 0 ? Number(edit["fillRent"]) : null), start: lr.start ?? (isIso(edit["fillStart"]) ? edit["fillStart"]! : null), end: lr.end ?? (isIso(edit["fillEnd"]) ? edit["fillEnd"]! : null) }, books.properties, id, null);
      if (!p.lease) return { kind: "lease" as const, ...p, sources: {} as Record<string, string> };
      const related = documents.filter((d) => books.docLinks.some((l) => l.docId === d.id && l.targetId === p.lease!.propertyId)).map((d) => ({ title: d.title, fields: d.fields ?? [] }));
      const filled = fillLeaseFromTrusted(p.lease, books.leases, related, books.fieldMappings ?? {});
      return { kind: "lease" as const, ...p, lease: filled.lease, unknown: leaseUnknowns(filled.lease), sources: filled.sources };
    }
    if (route === "gst" && x.gstInvoice) return { kind: "gst" as const, ...proposeGstInvoice(x.gstInvoice, entities.flatMap((e) => e.gstins), id, null) };
    if (route === "tax" && x.taxStatement) return { kind: "tax" as const, ...proposeTaxStatement(x.taxStatement, entities) };
    if (x.fund && x.fund.holdings.length) return { kind: "fund" as const, lines: proposeFundHoldings(x.fund, books.holdings, (i) => `${id.slice(0, 30)}-mf${i}`, DOC_LABEL[docType]) };
    if (route === "fy" && x.audited) return { kind: "fy" as const, ...proposeFy(x.audited as Parameters<typeof proposeFy>[0], entities, books.fyRecords, id, null) };
    return null;
  }, [x, route, edit, entities, books.properties, books.fyRecords, books.leases, books.docLinks, books.fieldMappings, books.holdings, documents, runId, docType]);

  const entityName = proposal?.kind === "entity" ? proposal.profile.name : entities.find((e) => e.pan && fields.some((f) => f.value.toUpperCase().includes(e.pan)))?.name;
  const title = autoName({ entity: entityName, date: x?.date ?? null, typeLabel: DOC_LABEL[docType], identifier: fields.find((f) => /^(cin|gstin|pan|invoice number|survey number)/i.test(f.label))?.value ?? null });
  const dup = useMemo(() => duplicateDocuments(documents.filter((d) => d.id !== documentIdForRun(runId)), { fileName: file.name, size: file.size, docType, docDate: x?.date ?? null, amount: x?.amount ?? null, merchant: x?.merchant ?? null })[0], [documents, file, docType, x, runId]);
  const v = (k: string, d: string | number | null | undefined) => edit[k] ?? (d == null ? "" : String(d));
  const optNum = (k: string, d: number | undefined) => { const s = edit[k]; if (s === undefined) return d; return s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s); };
  const ownerSuggested = !!proposal && "ownerSuggested" in proposal && proposal.ownerSuggested;
  const capOwner = proposal?.kind === "asset" ? proposal.asset?.ownerEntityId : undefined;
  const capMin = (capOwner ? books.policy?.capitalisationMinByEntity?.[capOwner] : undefined) ?? books.policy?.capitalisationMin;
  const needCap = proposal?.kind === "asset" && !!proposal.asset && requiresApproval(books.policy, "capitalise");
  const belowCap = proposal?.kind === "asset" && !!proposal.asset && capMin != null && proposal.asset.cost < capMin;

  const confirmed = (): Confirmed | null => {
    if (!proposal) return { route: "document" };
    if (proposal.kind === "entity") {
      const p = proposal.profile;
      return { route: "entity", profile: { ...p, name: v("name", p.name).trim(), pan: v("pan", p.pan).toUpperCase(), kind: (v("kind", p.kind) as typeof p.kind) } };
    }
    if (proposal.kind === "asset") {
      if (!proposal.asset || belowCap) return proposal.asset && belowCap ? { route: "document" } : null;
      const a = proposal.asset;
      const purchase = x?.asset?.purchaseDate ?? a.inUse;
      // Put-to-use date, useful life and residual value are never assumed [§32].
      const life = optNum("life", undefined) ?? x?.asset?.usefulLifeYears ?? undefined, resid = optNum("resid", undefined) ?? x?.asset?.residualPct ?? undefined;
      const printedUse = !!x?.asset?.putToUseOn;
      if ((edit["inUse"] === undefined && !printedUse) || life == null || resid == null) return null;
      return { route: "asset", asset: { ...a, usefulLifeYears: life, residualPct: resid, name: v("name", a.name), cost: Number(v("cost", a.cost)) || a.cost, inUse: v("inUse", a.inUse), purchaseDate: purchase, capitalisedOn: v("capOn", purchase), kind: v("akind", a.kind) as AssetKind, supplier: x?.asset?.supplier ?? undefined, warrantyUntil: x?.asset?.warrantyUntil ?? undefined, insurance: x?.asset?.insurance ?? undefined, ...(ownerSuggested && !ownerOk ? { ownerEntityId: undefined } : {}) } as typeof a };
    }
    if (proposal.kind === "property") {
      const cost = Number(v("cost", x?.property?.cost ?? "")) || 0;
      const date = v("acq", x?.property?.acquiredOn ?? "");
      const p = { ...proposal.property, name: v("name", proposal.property.name), ...(ownerSuggested && !ownerOk ? { ownerEntityId: undefined } : {}) };
      const asset = cost > 0 && isIso(date) ? { id: `${runId.slice(0, 30)}-asset`, name: p.name, kind: "property" as const, cost, inUse: date, purchaseDate: date, sharePct: 100, bookMethod: "slm" as const, bookRatePct: 0, ownerEntityId: p.ownerEntityId } : null;
      return { route: "property", property: p, asset };
    }
    if (proposal.kind === "lease") {
      if (!proposal.lease) return null;
      const l = proposal.lease;
      const lease: Lease = { ...l, propertyId: leaseProperty || l.propertyId, rent: Number(v("rent", l.rent)) };
      for (const k of LEASE_TERMS) { if (k === "gst") { const g = edit["gst"]; if (g !== undefined) lease.gst = g === "" ? undefined : g === "yes"; } else lease[k] = optNum(k, l[k]); }
      return { route: "lease", lease };
    }
    if (proposal.kind === "gst") return proposal.invoice ? { route: "gst", invoice: { ...proposal.invoice, number: v("invno", proposal.invoice.number), taxable: Number(v("taxable", proposal.invoice.taxable)) || proposal.invoice.taxable } } : null;
    if (proposal.kind === "tax") {
      if (!proposal.fy) return null;
      const whoId = v("taxwho", proposal.entityId ?? "personal");
      return { route: "tax", entityId: whoId, fy: proposal.fy, salary: proposal.salary, credits: proposal.credits.map((c) => ({ kind: c.kind, amount: c.amount, source: `${DOC_LABEL[docType]}${c.deductor ? ` · ${c.deductor}` : ""}` })) };
    }
    if (proposal.kind === "fund") {
      const ok = proposal.lines.filter((l) => l.holding);
      return ok.length ? { route: "fund", holdings: ok.map((l) => l.holding!), quotes: ok.flatMap((l) => (l.quote ? [l.quote] : [])) } : null;
    }
    if (proposal.kind === "fy") return proposal.record && (!ownerSuggested || ownerOk) ? { route: "fy", record: proposal.record } : null;
    return { route: "document" };
  };

  const save = async () => {
    const pendingAttempt = runData.current.intakeAttempt;
    if (pendingAttempt) {
      setSaving(true);
      try {
        await store.commitDocumentRecords(pendingAttempt.documentId, pendingAttempt.data, pendingAttempt.lock, pendingAttempt);
        await closeRun({ id: runId, data: runData.current }, 'done');
        setDone(pendingAttempt.route); setFailed(null); toast.success('Saved document records confirmed');
      } catch (e) { setFailed({ step: 'Save', note: (e as Error).message }); }
      finally { setSaving(false); }
      return;
    }
    const c = confirmed();
    if (!c) { toast.error(ownerSuggested && !ownerOk ? "Confirm which company this belongs to first" : "Fill the missing details first"); return; }
    const unlocated = fields.filter((f) => !f.page && !f.section?.trim()).length;
    if (unlocated) { toast.error(`${unlocated} detail${unlocated > 1 ? "s" : ""} need a page or section — open “Details read”`); return; }
    if (needCap && !capOk && c.route === "asset") { toast.error("Confirm capitalisation first"); return; }
    setSaving(true); setFailed(null);
    let at: Step = "Save";
    const docId = dup ? dup.id : documentIdForRun(runId);
    try {
      await step("Save");
      const fieldsOut = fields.map((f) => ({ ...f, originalValue: f.originalValue ?? f.value }));
      if (!dup) {
        await addDocument(file, { id: docId, title, docType, docDate: isIso(x?.date) ? x!.date : null, amount: x?.amount ?? null, currency: x?.currency || "INR", merchant: x?.merchant ?? null, notes: x?.notes ?? "", text: x?.text ?? "", transactionId: null, accountId: linkAcc || null, loanId: linkLoan || null, expiresOn: isIso(x?.expiresOn) ? x!.expiresOn : null, fields: fieldsOut, replacesId: replacesId ?? runData.current.replacesId ?? null });
      }
      await updateRun(runId, { documentId: docId }).catch(() => undefined);
      const withDoc: Confirmed = c.route === "asset" ? { ...c, asset: { ...c.asset, docId: c.asset.docId ?? docId } } : c.route === "lease" ? { ...c, lease: { ...c.lease, docId } } : c.route === "fy" ? { ...c, record: { ...c.record, docIds: [...new Set([...c.record.docIds, docId])] } } : c;
      at = "Reconcile"; await step("Reconcile");
      const next = commitIntake({ entities, assets: preferences.assets ?? [], books }, withDoc, { id: docId, title, docType, fieldLabels: fields.map((f) => f.label) }, today(), () => crypto.randomUUID());
      const known = new Set(preferences.contractObligations.map((o) => o.docId));
      const obs = !known.has(docId) ? toObligations(docId, x?.obligations ?? [], () => crypto.randomUUID()) : [];
      // Records and the evidence lock commit together: either both are saved or neither is [§3, §11].
      const expected = store.preferencesRevision;
      if (expected == null) throw new Error('Refresh your records before reviewing the document again');
      const attempt = { id: crypto.randomUUID(), documentId: docId, expected, lock: c.route !== 'document', route: c.route,
        data: { ...preferences, entities: next.entities, assets: next.assets, books: next.books, ...(obs.length ? { contractObligations: [...preferences.contractObligations, ...obs] } : {}) } };
      runData.current = { ...runData.current, intakeAttempt: attempt };
      await updateRun(runId, { data: runData.current });
      await store.commitDocumentRecords(docId, attempt.data, attempt.lock, attempt);
      at = "Audit"; await step("Audit");
      await closeRun({ id: runId, data: runData.current }, "done").catch(() => undefined);
      setDone(c.route);
      toast.success(dup ? "Linked to the copy already in DocuRepo" : "Saved to DocuRepo");
    } catch (e) {
      const msg = (e as Error).message;
      // Nothing is rolled back silently: the run keeps the stored document id so Retry continues from here.
      setFailed({ step: at, note: `${msg}. ${at === "Save" ? "The file may already be in DocuRepo — Retry will reuse it, not copy it again." : "The file is in DocuRepo; Retry will finish linking the records."}` });
      await updateRun(runId, { stage: at, status: "failed", error: msg }).catch(() => undefined);
    } finally { setSaving(false); }
  };

  const steps = trail(done ? "Audit" : stage, failed, route === "document" ? ["Reconcile"] : []);
  const missing = proposal && "missing" in proposal ? proposal.missing : [];
  const unknown = proposal?.kind === "lease" && proposal.lease ? LEASE_TERMS.filter((k) => proposal.lease![k] === undefined) : [];

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm" aria-label={`Document review ${file.name}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-semibold">{done ? "Saved" : x ? DOC_LABEL[docType] : "Reading document…"}</p><p className="truncate text-xs text-muted-foreground">{file.name}</p></div>
        <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <ol className="flex flex-wrap gap-1 text-[11px]">
        {steps.map((s) => <li key={s.step} title={s.note} className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${s.state === "done" ? "bg-primary/10 text-primary" : s.state === "failed" ? "bg-destructive/10 text-destructive" : s.state === "active" ? "bg-secondary font-semibold" : "text-muted-foreground"}`}>{s.state === "done" ? <Check className="size-3" /> : s.state === "failed" ? <AlertTriangle className="size-3" /> : <CircleDashed className="size-3" />}{s.step}</li>)}
      </ol>
      {failed && <p role="alert" className="text-destructive">{failed.step}: {failed.note}</p>}
      {failed && !x && <p className="text-xs text-muted-foreground">This document is listed under “Unfinished documents” so you can retry it later without uploading again.</p>}
      {x && !done && <>
        <label className="block">Document type
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>{DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_LABEL[t]}</option>)}</select>
        </label>
        <p className="text-xs text-muted-foreground">Will be filed as <b>{title}</b>; the original file name is kept.</p>
        {dup && <p className="rounded-lg bg-secondary px-3 py-2 text-xs">Already in DocuRepo as “{dup.title}” — the existing copy will be linked, not stored twice.</p>}
        {fields.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">Details read ({fields.length}) — tap a value to correct it</summary>
          <div className="mt-2 grid gap-2">{fields.map((f, i) => <label key={i} className="grid gap-0.5"><span className="text-xs">{f.label}{f.confidence !== "high" && <span className={`ml-1 ${f.confidence === "low" ? "text-destructive" : "text-muted-foreground"}`}>{f.confidence} confidence</span>}{f.status === "corrected" && <span className="ml-1 text-primary">corrected</span>}</span>
            <Input value={f.value} onChange={(e) => setFields(fields.map((y, j) => (j === i ? { ...y, value: e.target.value, status: "corrected" } : y)))} />
            {!f.page && <Input aria-label={`Page or section for ${f.label}`} className="h-7 text-xs" placeholder="Page or section where this appears (required)" value={f.section ?? ""} onChange={(e) => setFields(fields.map((y, j) => (j === i ? { ...y, section: e.target.value } : y)))} />}
            <span className="text-[11px] text-muted-foreground">{f.page ? `Page ${f.page} · ` : f.section ? `${f.section} · ` : ""}printed “{f.originalValue ?? f.quote}”{f.quote && f.originalValue && f.quote !== f.originalValue ? ` · “${f.quote}”` : ""}</span></label>)}</div></details>}

        {route === "statement" && onStatement && !done && <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-xs"><span>This looks like a bank or card statement. Read its entries so they can be matched and posted.</span><Button size="sm" onClick={onStatement}>Read entries</Button></div>}
        {ownerSuggested && <label className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-xs"><input type="checkbox" className="mt-0.5" checked={ownerOk} onChange={(e) => setOwnerOk(e.target.checked)} /><span>The name on this document matches <b>{entities.find((e) => e.id === (proposal?.kind === "fy" ? proposal.entityId : proposal?.kind === "asset" ? proposal.asset?.ownerEntityId : proposal?.kind === "property" ? proposal.property.ownerEntityId : null))?.name}</b>, but no PAN, CIN or GSTIN confirms it. Tick to confirm it belongs to this company.</span></label>}

        {proposal?.kind === "entity" && <div className="space-y-2 rounded-xl border p-3">
          <p className="font-semibold">{proposal.matchedBy ? `Matches ${proposal.profile.name} by ${proposal.matchedBy} — details will be added to it` : "New company profile"}</p>
          <Input aria-label="Legal name" value={v("name", proposal.profile.name)} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="PAN" placeholder="PAN" value={v("pan", proposal.profile.pan)} onChange={(e) => setEdit({ ...edit, pan: e.target.value })} />
            <select aria-label="Entity type" className="rounded-md border bg-background px-2" value={v("kind", proposal.profile.kind)} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(ENTITY_KINDS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}</select>
          </div>
          <p className="text-xs text-muted-foreground">{[proposal.profile.regNo && `CIN/LLPIN ${proposal.profile.regNo}`, proposal.profile.gstins.length && `${proposal.profile.gstins.length} GSTIN`, proposal.profile.incorporatedOn && `incorporated ${proposal.profile.incorporatedOn}`, proposal.profile.fyEnd && `year ends ${proposal.profile.fyEnd}`, proposal.profile.people?.length && `${proposal.profile.people.length} directors/partners`, proposal.profile.related?.length && `${proposal.profile.related.length} related entities`, proposal.profile.address].filter(Boolean).join(" · ")}</p>
        </div>}
        {proposal?.kind === "asset" && (proposal.asset ? <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
          <p className="col-span-2 font-semibold">{belowCap ? `Below your capitalisation limit (${inr(capMin!)}) — will be filed as an expense document, not an asset` : "Proposed asset"}</p>
          <Input aria-label="Asset name" className="col-span-2" value={v("name", proposal.asset.name)} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <label className="text-xs">Cost<Input aria-label="Cost" type="number" value={v("cost", proposal.asset.cost)} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} /></label>
          <label className="text-xs">Put to use<Input aria-label="Put to use" type="date" value={v("inUse", proposal.asset.inUse)} onChange={(e) => setEdit({ ...edit, inUse: e.target.value })} /></label>
          {proposal.payment && <p className="col-span-2 text-xs text-muted-foreground">Linked payment: ₹{proposal.payment.amount.toLocaleString("en-IN")} on {proposal.payment.date}{proposal.costFromPayment ? " — cost taken from this payment because the invoice total wasn't read" : ""}.</p>}
          <label className="text-xs">Useful life (years)<Input aria-label="Useful life" inputMode="decimal" placeholder={proposal.suggestedLife ? `Suggested ${proposal.suggestedLife}` : ""} value={v("life", null)} onChange={(e) => setEdit({ ...edit, life: e.target.value })} /></label>
          <label className="text-xs">Residual value (%)<Input aria-label="Residual value" inputMode="decimal" placeholder="e.g. 5" value={v("resid", null)} onChange={(e) => setEdit({ ...edit, resid: e.target.value })} /></label>
          {(edit["inUse"] === undefined || !v("life", null) || !v("resid", null)) && <p className="col-span-2 text-xs text-muted-foreground">Confirm the put-to-use date, useful life and residual value before saving.</p>}
          <label className="col-span-2 text-xs">Capitalised on<Input aria-label="Capitalised on" type="date" value={v("capOn", x.asset?.purchaseDate ?? proposal.asset.inUse)} onChange={(e) => setEdit({ ...edit, capOn: e.target.value })} /></label>
          <select aria-label="Asset category" className="col-span-2 rounded-md border bg-background px-2 py-2" value={v("akind", proposal.asset.kind)} onChange={(e) => setEdit({ ...edit, akind: e.target.value })}>{Object.entries(ASSET_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <p className="col-span-2 text-xs text-muted-foreground">{[x.asset?.supplier && `Supplier ${x.asset.supplier}`, x.asset?.purchaseDate && `invoice ${x.asset.purchaseDate}`, x.asset?.warrantyUntil && `warranty to ${x.asset.warrantyUntil}`, x.asset?.insurance && `insurance ${x.asset.insurance}`].filter(Boolean).join(" · ")}</p>
          {needCap && !belowCap && <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={capOk} onChange={(e) => setCapOk(e.target.checked)} />Capitalise this as a fixed asset (your approval policy asks for this){capMin == null ? " — no capitalisation limit set yet in Audit → Approvals" : ""}</label>}
        </div> : <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed p-3 text-xs"><p className="col-span-2 font-semibold">Not printed — fill in to continue: {proposal.missing.join(", ")}</p>{!x.asset?.name && <label>Asset name<Input aria-label="Asset name" type="text" value={edit["fillName"] ?? ""} onChange={(e) => setEdit({ ...edit, fillName: e.target.value })} /></label>}{x.asset?.cost == null && <label>Purchase cost<Input aria-label="Purchase cost" type="number" value={edit["fillCost"] ?? ""} onChange={(e) => setEdit({ ...edit, fillCost: e.target.value })} /></label>}{!x.asset?.purchaseDate && <label>Purchase date<Input aria-label="Purchase date" type="date" value={edit["fillDate"] ?? ""} onChange={(e) => setEdit({ ...edit, fillDate: e.target.value })} /></label>}</div>)}
        {proposal?.kind === "gst" && (proposal.invoice ? <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
          <p className="col-span-2 font-semibold">GST {proposal.invoice.kind === "sales" ? "sales" : "purchase"} invoice draft · {proposal.invoice.gstin}</p>
          <label className="text-xs">Invoice number<Input aria-label="Invoice number" value={v("invno", proposal.invoice.number)} onChange={(e) => setEdit({ ...edit, invno: e.target.value })} /></label>
          <label className="text-xs">Taxable value<Input aria-label="Taxable value" inputMode="decimal" value={v("taxable", proposal.invoice.taxable)} onChange={(e) => setEdit({ ...edit, taxable: e.target.value })} /></label>
          <p className="col-span-2 text-xs text-muted-foreground">{proposal.invoice.date} · {proposal.invoice.party || "party not printed"} {proposal.invoice.partyGstin} · IGST {proposal.invoice.igst} · CGST {proposal.invoice.cgst} · SGST {proposal.invoice.sgst}{proposal.invoice.cess ? ` · cess ${proposal.invoice.cess}` : ""}. Saved to the GST register for review; nothing is filed.</p>
        </div> : <p className="rounded-xl border border-dashed p-3 text-xs">GST invoice can't be prepared yet — missing: {proposal.missing.join(", ")}. It is kept in DocuRepo.</p>)}
        {proposal?.kind === "fund" && <div className="grid gap-2 rounded-xl border p-3 text-xs">
          <p className="font-semibold">Fund holdings on this statement</p>
          {proposal.lines.map((l, i) => <div key={i} className="grid gap-0.5 border-t pt-2 first:border-t-0 first:pt-0">
            <p className="font-medium">{l.holding?.name ?? x.fund?.holdings[i]?.scheme}</p>
            {l.holding && <p>{l.holding.quantity.toLocaleString("en-IN", { maximumFractionDigits: 3 })} units{l.quote ? ` · NAV ₹${l.quote.price} on ${l.quote.at.slice(0, 10)} · ₹${Math.round(l.holding.quantity * l.quote.price).toLocaleString("en-IN")}` : " · NAV not printed"}{l.holding.costBasis != null ? ` · cost ₹${l.holding.costBasis.toLocaleString("en-IN")}` : ""}</p>}
            <p className="text-muted-foreground">{l.existingId ? `Updates your existing holding (was ${l.previousUnits?.toLocaleString("en-IN")} units)` : "New holding"}{l.holding?.isin ? ` · ${l.holding.isin}` : ""}</p>
            {l.valueCheck && <p className="text-destructive">{l.valueCheck}</p>}
            {l.missing.length > 0 && <p className="text-destructive">Missing: {l.missing.join(", ")}{!l.holding ? " — not added" : ""}</p>}
          </div>)}
          <p className="text-muted-foreground">Units and NAV are taken exactly as printed and labelled "From statement". Nothing is posted to your bank accounts.</p>
        </div>}
        {proposal?.kind === "tax" && <div className="grid gap-2 rounded-xl border p-3 text-xs">
          <p className="font-semibold">Tax statement · FY {proposal.fy ?? "not printed"}</p>
          <label>Whose tax<select aria-label="Whose tax statement" className="w-full rounded-md border bg-background px-1 py-1" value={v("taxwho", proposal.entityId ?? "personal")} onChange={(e) => setEdit({ ...edit, taxwho: e.target.value })}><option value="personal">You (personal)</option>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          {proposal.salary != null && <p>Taxable salary as printed: ₹{proposal.salary.toLocaleString("en-IN")}</p>}
          {proposal.credits.map((c, i) => <p key={i}>{c.kind.toUpperCase()} ₹{c.amount.toLocaleString("en-IN")}{c.deductor ? ` · ${c.deductor}` : ""}</p>)}
          {proposal.missing.length > 0 && <p className="text-destructive">Missing: {proposal.missing.join(", ")}</p>}
          <p className="text-muted-foreground">These become taxes already paid and salary for that year. Each is recorded once per document.</p>
        </div>}
        {proposal?.kind === "property" && <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
          <p className="col-span-2 font-semibold">Proposed property</p>
          <Input aria-label="Property name" className="col-span-2" value={v("name", proposal.property.name)} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <Input aria-label="Acquisition cost" type="number" placeholder="Cost" value={v("cost", x.property?.cost)} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} />
          <Input aria-label="Acquired on" type="date" value={v("acq", x.property?.acquiredOn)} onChange={(e) => setEdit({ ...edit, acq: e.target.value })} />
          <p className="col-span-2 text-xs text-muted-foreground">{proposal.property.address}{x.property?.surveyNo ? ` · Survey ${x.property.surveyNo}` : ""}{proposal.property.notes ? ` · ${proposal.property.notes}` : ""}. Cost is kept once, in the asset register.</p>
        </div>}
        {proposal?.kind === "lease" && (proposal.lease ? <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
          <p className="col-span-2 font-semibold">Tenant {proposal.lease.tenant}: {proposal.lease.start} to {proposal.lease.end}</p>
          <label>Monthly rent<Input type="number" value={v("rent", proposal.lease.rent)} onChange={(e) => setEdit({ ...edit, rent: e.target.value })} /></label>
          <p className="self-end text-xs text-muted-foreground">{LEASE_TERMS.filter((k) => proposal.lease![k] !== undefined).map((k) => `${LEASE_TERM_LABEL[k]}: ${k === "gst" ? (proposal.lease!.gst ? "yes" : "no") : proposal.lease![k]}${proposal.sources[k] ? ` (from ${proposal.sources[k]})` : ""}`).join(" · ") || "No other terms printed"}</p>
          {unknown.length > 0 && <div className="col-span-2 space-y-1 rounded-lg bg-secondary/60 p-2">
            <p className="text-xs font-semibold">Not printed on the lease — answer only what you know (blank stays “not stated”):</p>
            <div className="grid grid-cols-2 gap-2">{unknown.map((k) => k === "gst"
              ? <label key={k} className="text-xs">{LEASE_TERM_LABEL[k]}<select className="w-full rounded-md border bg-background px-1 py-1" value={edit["gst"] ?? ""} onChange={(e) => setEdit({ ...edit, gst: e.target.value })}><option value="">Not stated</option><option value="yes">Yes</option><option value="no">No</option></select></label>
              : <label key={k} className="text-xs">{LEASE_TERM_LABEL[k]}<Input type="number" value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>)}</div>
          </div>}
          <p className="col-span-2 text-xs text-muted-foreground">The deposit is never counted as rent.</p>
          <select aria-label="Property for this lease" className="col-span-2 rounded-md border bg-background px-2 py-2" value={leaseProperty || proposal.lease.propertyId} onChange={(e) => setLeaseProperty(e.target.value)}><option value="">Choose property…</option>{books.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div> : <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed p-3 text-xs"><p className="col-span-2 font-semibold">Not printed — fill in to continue: {proposal.missing.join(", ")}</p>{!x.lease?.tenant && <label>Tenant<Input aria-label="Tenant" type="text" value={edit["fillTenant"] ?? ""} onChange={(e) => setEdit({ ...edit, fillTenant: e.target.value })} /></label>}{x.lease?.rent == null && <label>Monthly rent<Input aria-label="Monthly rent" type="number" value={edit["fillRent"] ?? ""} onChange={(e) => setEdit({ ...edit, fillRent: e.target.value })} /></label>}{!x.lease?.start && <label>Lease start<Input aria-label="Lease start" type="date" value={edit["fillStart"] ?? ""} onChange={(e) => setEdit({ ...edit, fillStart: e.target.value })} /></label>}{!x.lease?.end && <label>Lease end<Input aria-label="Lease end" type="date" value={edit["fillEnd"] ?? ""} onChange={(e) => setEdit({ ...edit, fillEnd: e.target.value })} /></label>}</div>)}
        {proposal?.kind === "fy" && <div className="space-y-1 rounded-xl border p-3">
          <p className="font-semibold">{proposal.record ? `Past-year accounts FY ${proposal.record.fy}` : "Past-year accounts"}</p>
          {proposal.record && Object.entries(proposal.record.audited).map(([k, a]) => <div key={k} className="flex justify-between text-xs"><span>{HEAD_LABEL[k as keyof typeof HEAD_LABEL]}</span><b>{inr(a ?? 0)}</b></div>)}
          {proposal.record?.details?.length ? <p className="text-xs text-muted-foreground">Detailed schedules read: {proposal.record.details.map((d) => `${d.schedule} (${d.lines.length} lines)`).join(", ")}</p> : null}
          {proposal.missingSchedules.length > 0 && <p className="text-xs text-destructive">Not in this upload: {proposal.missingSchedules.join(", ")} — left empty, not filled in.</p>}
        </div>}
        {(route === "document" || route === "loan") && <div className="grid grid-cols-2 gap-2 text-xs">
          {(suggested?.accountId || suggested?.loanId) && <p className="col-span-2 text-xs text-muted-foreground">Link suggested from the account or loan number printed on the document — check it.</p>}
          <label>Link to account<select className="mt-1 w-full rounded-md border bg-background px-2 py-1" value={linkAcc} onChange={(e) => setLinkAcc(e.target.value)}><option value="">Not linked</option>{accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Link to loan<select className="mt-1 w-full rounded-md border bg-background px-2 py-1" value={linkLoan} onChange={(e) => setLinkLoan(e.target.value)}><option value="">Not linked</option>{loans.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        </div>}
        {x.possiblyIncomplete && <p className="text-xs font-medium text-destructive">This document is long — some lines may not have been read. Check the original before relying on totals.</p>}
        {!!x.obligations?.length && <p className="text-xs text-muted-foreground">{x.obligations.length} payment obligation{x.obligations.length > 1 ? "s" : ""} found — they'll be listed on the document for review.</p>}
        {missing.length > 0 && <p className="text-xs text-destructive">Still needed: {missing.join(", ")}.{missing.includes("which company") && <> <Link to="/entities" className="underline">Add the company first</Link></>}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={saving} disabled={!!failed && !["Save", "Reconcile", "Audit"].includes(failed.step)}>{failed ? "Retry" : proposal ? "Confirm and save" : "Save to DocuRepo"}</Button>
          {runData.current.intakeAttempt && failed && <Button variant="outline" onClick={async () => {
            const attempt = runData.current.intakeAttempt;
            if (!attempt) return;
            const { data, error } = await (await import('@/integrations/supabase/client')).supabase.from('document_intake_commits').select('id').eq('id', attempt.id).maybeSingle();
            if (error) { toast.error(error.message); return; }
            if (data) { toast.message('This save already completed. Retry to confirm it.'); return; }
            await store.refresh();
            runData.current = { ...runData.current, intakeAttempt: undefined };
            await updateRun(runId, { data: runData.current }); setFailed(null);
          }}>Refresh and review again</Button>}
          <Button variant="ghost" onClick={async () => { await closeRun({ id: runId, data: runData.current }, "cancelled").catch(() => undefined); onClose(); }}>Discard</Button>
        </div>
      </>}
      {done && <p className="text-xs">Stored in DocuRepo and linked. Open <Link to={done === "entity" ? "/entities" : done === "fy" ? "/tax" : done === "document" ? "/vault" : "/assets"} className="font-semibold text-primary underline">{done === "entity" ? "Companies" : done === "fy" ? "Tax" : done === "document" ? "DocuRepo" : "Property & assets"}</Link>.</p>}
    </section>
  );
}
