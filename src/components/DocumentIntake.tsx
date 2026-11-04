/**
 * Statement Desk review for every non-bank document (v6 §2–4, §6–16, §18, §27, §36, §38).
 * Upload → Identify → Extract → Validate → Match → Classify → Prepare → Confirm → Save → Reconcile → Audit.
 * The original file goes to DocuRepo and the proposed record is saved together; if either fails, nothing is kept.
 */
import { useEffect, useMemo, useState } from "react";
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
import { autoName, proposeAsset, proposeEntity, proposeFy, proposeLease, proposeProperty, ROUTE_OF, trail, type IntakeContext, type Step } from "@/lib/books/intake";
import { commitIntake, type Confirmed } from "@/lib/books/commit";
import { emptyBooks } from "@/lib/books/types";
import { HEAD_LABEL } from "@/lib/books/fy";
import { ASSET_KINDS, type AssetKind } from "@/lib/assets";

const CONTEXT_TYPE: Partial<Record<IntakeContext, DocType>> = { entity: "incorporation", fy: "audited_financials", property: "property_deed", assets: "asset_invoice", gst: "gst_return" };
const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

export function DocumentIntake({ file, context, onClose }: { file: File; context?: IntakeContext | undefined; onClose: () => void }) {
  const store = useStore();
  const { preferences, savePreferences, addDocument, removeDocument, documents } = store;
  const read = useServerFn(extractDocument);
  const [x, setX] = useState<ExtractedDocument | null>(null);
  const [fields, setFields] = useState<DocField[]>([]);
  const [docType, setDocType] = useState<DocType>(context ? CONTEXT_TYPE[context] ?? "other" : "other");
  const [failed, setFailed] = useState<{ step: Step; note: string } | null>(null);
  const [stage, setStage] = useState<Step>("Extract");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [leaseProperty, setLeaseProperty] = useState("");
  const books = preferences.books ?? emptyBooks();
  const entities = preferences.entities ?? [];

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!(file.type.startsWith("image/") || /\.pdf$/i.test(file.name))) throw Object.assign(new Error("Only PDFs and photos can be read as documents"), { step: "Identify" });
        const raw = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(file); });
        const prepared = await (await import("@/lib/image-prep")).prepareForReading(raw, file.type || "application/pdf");
        if (prepared.dataUrl.length > 4_000_000) throw Object.assign(new Error("File is too large to read (about 3 MB max)"), { step: "Extract" });
        const out = await read({ data: prepared });
        if (!live) return;
        if (!out.ok) throw Object.assign(new Error(out.error), { step: "Extract" });
        setX(out.result); setFields((out.result.fields ?? []).map((f) => ({ ...f, status: "read" as const })));
        if (!context || out.result.docType !== "other") setDocType(out.result.docType);
        setStage("Confirm");
      } catch (e) {
        if (live) setFailed({ step: ((e as { step?: Step }).step ?? "Extract"), note: (e as Error).message });
      }
    })();
    return () => { live = false; };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = ROUTE_OF[docType];
  const proposal = useMemo(() => {
    if (!x) return null;
    const id = crypto.randomUUID();
    if (route === "entity" && x.entity) return { kind: "entity" as const, ...proposeEntity(x.entity, entities, id, today()) };
    if (route === "asset" && x.asset) return { kind: "asset" as const, ...proposeAsset(x.asset, entities, id, null) };
    if (route === "property" && x.property) return { kind: "property" as const, ...proposeProperty(x.property, entities, id, null) };
    if (route === "lease" && x.lease) return { kind: "lease" as const, ...proposeLease(x.lease, books.properties, id, null) };
    if (route === "fy" && x.audited) return { kind: "fy" as const, ...proposeFy(x.audited, entities, books.fyRecords, id, null) };
    return null;
  }, [x, route, entities, books.properties, books.fyRecords]);

  const entityName = proposal?.kind === "entity" ? proposal.profile.name : entities.find((e) => fields.some((f) => f.value.toUpperCase().includes(e.pan) && e.pan))?.name;
  const title = autoName({ entity: entityName, date: x?.date ?? null, typeLabel: DOC_LABEL[docType], identifier: fields.find((f) => /^(cin|gstin|pan|invoice number|survey number)/i.test(f.label))?.value ?? null });
  const dup = useMemo(() => duplicateDocuments(documents, { fileName: file.name, size: file.size, docType, docDate: x?.date ?? null, amount: x?.amount ?? null, merchant: x?.merchant ?? null })[0], [documents, file, docType, x]);
  const v = (k: string, d: string | number | null | undefined) => edit[k] ?? (d == null ? "" : String(d));

  const confirmed = (): Confirmed | null => {
    if (!proposal) return { route: "document" };
    if (proposal.kind === "entity") {
      const p = proposal.profile;
      return { route: "entity", profile: { ...p, name: v("name", p.name).trim(), pan: v("pan", p.pan).toUpperCase(), kind: (v("kind", p.kind) as typeof p.kind) } };
    }
    if (proposal.kind === "asset") {
      if (!proposal.asset) return null;
      const a = proposal.asset;
      return { route: "asset", asset: { ...a, name: v("name", a.name), cost: Number(v("cost", a.cost)) || a.cost, inUse: v("inUse", a.inUse), kind: v("akind", a.kind) as AssetKind, supplier: x?.asset?.supplier ?? undefined, warrantyUntil: x?.asset?.warrantyUntil ?? undefined, insurance: x?.asset?.insurance ?? undefined } };
    }
    if (proposal.kind === "property") {
      const cost = Number(v("cost", x?.property?.cost ?? "")) || 0;
      const date = v("acq", x?.property?.acquiredOn ?? "");
      const p = { ...proposal.property, name: v("name", proposal.property.name) };
      const asset = cost > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { id: crypto.randomUUID(), name: p.name, kind: "property" as const, cost, inUse: date, sharePct: 100, bookMethod: "slm" as const, bookRatePct: 0, ownerEntityId: p.ownerEntityId } : null;
      return { route: "property", property: p, asset };
    }
    if (proposal.kind === "lease") {
      if (!proposal.lease) return null;
      return { route: "lease", lease: { ...proposal.lease, propertyId: leaseProperty || proposal.lease.propertyId, rent: Number(v("rent", proposal.lease.rent)), deposit: Number(v("deposit", proposal.lease.deposit)) } };
    }
    if (proposal.kind === "fy") return proposal.record ? { route: "fy", record: proposal.record } : null;
    return { route: "document" };
  };

  const save = async () => {
    const c = confirmed();
    if (!c) { toast.error("Fill the missing details first"); return; }
    setSaving(true); setStage("Save");
    let newDoc: string | null = null;
    try {
      const docId = dup ? dup.id : (newDoc = await addDocument(file, { title, docType, docDate: x?.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null, amount: x?.amount ?? null, currency: x?.currency || "INR", merchant: x?.merchant ?? null, notes: x?.notes ?? "", text: x?.text ?? "", transactionId: null, accountId: null, loanId: null, expiresOn: x?.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(x.expiresOn) ? x.expiresOn : null, fields }));
      const withDoc: Confirmed = c.route === "asset" ? { ...c, asset: { ...c.asset, docId: c.asset.docId ?? docId } } : c.route === "lease" ? { ...c, lease: { ...c.lease, docId } } : c.route === "fy" ? { ...c, record: { ...c.record, docIds: [...new Set([...c.record.docIds, docId])] } } : c;
      const next = commitIntake({ entities, assets: preferences.assets ?? [], books }, withDoc, { id: docId, title, docType, fieldLabels: fields.map((f) => f.label) }, today(), () => crypto.randomUUID());
      await savePreferences({ ...preferences, entities: next.entities, assets: next.assets, books: next.books });
      setStage("Audit"); setDone(c.route);
      toast.success(dup ? "Linked to the copy already in DocuRepo" : "Saved to DocuRepo");
    } catch (e) {
      if (newDoc) { const d = store.documents.find((y) => y.id === newDoc); if (d) await removeDocument(d).catch(() => undefined); }
      setFailed({ step: "Save", note: `${(e as Error).message} — nothing was kept` });
    } finally { setSaving(false); }
  };

  const steps = trail(done ? "Audit" : stage, failed, route === "document" ? ["Reconcile"] : []);
  const missing = proposal && "missing" in proposal ? proposal.missing : [];

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
      {x && !done && <>
        <label className="block">Document type
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>{DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_LABEL[t]}</option>)}</select>
        </label>
        <p className="text-xs text-muted-foreground">Will be filed as <b>{title}</b>; the original file name is kept.</p>
        {dup && <p className="rounded-lg bg-secondary px-3 py-2 text-xs">Already in DocuRepo as “{dup.title}” — the existing copy will be linked, not stored twice.</p>}
        {fields.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">Details read ({fields.length}) — tap a value to correct it</summary>
          <div className="mt-2 grid gap-2">{fields.map((f, i) => <label key={i} className="grid gap-0.5"><span className="text-xs">{f.label}{f.confidence !== "high" && <span className={`ml-1 ${f.confidence === "low" ? "text-destructive" : "text-muted-foreground"}`}>{f.confidence} confidence</span>}{f.status === "corrected" && <span className="ml-1 text-primary">corrected</span>}</span>
            <Input value={f.value} onChange={(e) => setFields(fields.map((y, j) => (j === i ? { ...y, value: e.target.value, status: "corrected" } : y)))} />
            <span className="text-[11px] text-muted-foreground">{f.page ? `Page ${f.page} · ` : ""}“{f.quote}”</span></label>)}</div></details>}

        {proposal?.kind === "entity" && <div className="space-y-2 rounded-xl border p-3">
          <p className="font-semibold">{proposal.matchedBy ? `Matches ${proposal.profile.name} by ${proposal.matchedBy} — details will be added to it` : "New company profile"}</p>
          <Input aria-label="Legal name" value={v("name", proposal.profile.name)} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="PAN" placeholder="PAN" value={v("pan", proposal.profile.pan)} onChange={(e) => setEdit({ ...edit, pan: e.target.value })} />
            <select aria-label="Entity type" className="rounded-md border bg-background px-2" value={v("kind", proposal.profile.kind)} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(ENTITY_KINDS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}</select>
          </div>
          <p className="text-xs text-muted-foreground">{[proposal.profile.regNo && `CIN/LLPIN ${proposal.profile.regNo}`, proposal.profile.gstins.length && `${proposal.profile.gstins.length} GSTIN`, proposal.profile.incorporatedOn && `incorporated ${proposal.profile.incorporatedOn}`, proposal.profile.people?.length && `${proposal.profile.people.length} directors/partners`, proposal.profile.address].filter(Boolean).join(" · ")}</p>
        </div>}
        {proposal?.kind === "asset" && (proposal.asset ? <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
          <p className="col-span-2 font-semibold">Proposed asset — capitalisation needs your confirmation</p>
          <Input aria-label="Asset name" className="col-span-2" value={v("name", proposal.asset.name)} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <Input aria-label="Cost" type="number" value={v("cost", proposal.asset.cost)} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} />
          <Input aria-label="Put to use" type="date" value={v("inUse", proposal.asset.inUse)} onChange={(e) => setEdit({ ...edit, inUse: e.target.value })} />
          <select aria-label="Asset category" className="col-span-2 rounded-md border bg-background px-2 py-2" value={v("akind", proposal.asset.kind)} onChange={(e) => setEdit({ ...edit, akind: e.target.value })}>{Object.entries(ASSET_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <p className="col-span-2 text-xs text-muted-foreground">{[x.asset?.supplier && `Supplier ${x.asset.supplier}`, x.asset?.warrantyUntil && `warranty to ${x.asset.warrantyUntil}`, x.asset?.insurance && `insurance ${x.asset.insurance}`].filter(Boolean).join(" · ")}</p>
        </div> : null)}
        {proposal?.kind === "property" && <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
          <p className="col-span-2 font-semibold">Proposed property</p>
          <Input aria-label="Property name" className="col-span-2" value={v("name", proposal.property.name)} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <Input aria-label="Acquisition cost" type="number" placeholder="Cost" value={v("cost", x.property?.cost)} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} />
          <Input aria-label="Acquired on" type="date" value={v("acq", x.property?.acquiredOn)} onChange={(e) => setEdit({ ...edit, acq: e.target.value })} />
          <p className="col-span-2 text-xs text-muted-foreground">{proposal.property.address}{x.property?.surveyNo ? ` · Survey ${x.property.surveyNo}` : ""}. Cost is kept once, in the asset register.</p>
        </div>}
        {proposal?.kind === "lease" && (proposal.lease ? <div className="grid grid-cols-2 gap-2 rounded-xl border p-3">
          <p className="col-span-2 font-semibold">Tenant {proposal.lease.tenant}: {proposal.lease.start} to {proposal.lease.end}</p>
          <label>Monthly rent<Input type="number" value={v("rent", proposal.lease.rent)} onChange={(e) => setEdit({ ...edit, rent: e.target.value })} /></label>
          <label>Security deposit<Input type="number" value={v("deposit", proposal.lease.deposit)} onChange={(e) => setEdit({ ...edit, deposit: e.target.value })} /></label>
          <p className="col-span-2 text-xs text-muted-foreground">Due on day {proposal.lease.dueDay} · escalation {proposal.lease.escalationPct}% every {proposal.lease.escalationEveryMonths} months · notice {proposal.lease.noticeDays} days{proposal.lease.paymentTerms ? ` · ${proposal.lease.paymentTerms}` : ""}. The deposit is never counted as rent.</p>
          <select aria-label="Property for this lease" className="col-span-2 rounded-md border bg-background px-2 py-2" value={leaseProperty || proposal.lease.propertyId} onChange={(e) => setLeaseProperty(e.target.value)}><option value="">Choose property…</option>{books.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div> : null)}
        {proposal?.kind === "fy" && <div className="space-y-1 rounded-xl border p-3">
          <p className="font-semibold">{proposal.record ? `Past-year accounts FY ${proposal.record.fy}` : "Past-year accounts"}</p>
          {proposal.record && Object.entries(proposal.record.audited).map(([k, a]) => <div key={k} className="flex justify-between text-xs"><span>{HEAD_LABEL[k as keyof typeof HEAD_LABEL]}</span><b>{inr(a ?? 0)}</b></div>)}
          {proposal.missingSchedules.length > 0 && <p className="text-xs text-destructive">Not in this upload: {proposal.missingSchedules.join(", ")} — left empty, not filled in.</p>}
        </div>}
        {missing.length > 0 && <p className="text-xs text-destructive">Still needed: {missing.join(", ")}.{missing.includes("which company") && <> <Link to="/entities" className="underline">Add the company first</Link></>}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={saving} disabled={!!failed && failed.step !== "Save"}>{proposal ? "Confirm and save" : "Save to DocuRepo"}</Button>
          <Button variant="ghost" onClick={onClose}>Discard</Button>
        </div>
      </>}
      {done && <p className="text-xs">Stored in DocuRepo and linked. Open <Link to={done === "entity" ? "/entities" : done === "fy" ? "/tax" : done === "document" ? "/vault" : "/assets"} className="font-semibold text-primary underline">{done === "entity" ? "Companies" : done === "fy" ? "Tax" : done === "document" ? "DocuRepo" : "Property & assets"}</Link>.</p>}
    </section>
  );
}
