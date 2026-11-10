import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ChevronRight, Columns2, FileStack, FileUp, Mic, Package, PencilLine, Plane, ReceiptText, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { SMART_ADD_EVENT, smartAddContext, type SmartAddIntent } from "@/lib/smart-add-event";
import { CONTEXTS, type IntakeContext } from "@/lib/books/intake";
import type { Scope } from "@/lib/expenses";
import type { QuickEntrySearch } from "@/lib/quick-entry";
import { todayISO } from "@/lib/use-position";
import { holdToastsClearOfFooter } from "@/lib/toast-placement";
import { SourcePreview, sourceKind } from "@/components/SourcePreview";
import { ReceiptAssetHandoff } from "@/components/ReceiptAssetHandoff";
import { SMART_ADD_ACCEPT } from "@/components/SmartAdd";
import { canConfirm, canvasRoute, CANVAS_KINDS, keyboardInset, kindHint, readReviewForm, STEP_LABELS, stepOf, type CanvasKind, type ReviewSummary } from "./canvas-model";

// The same review and intake screens the app already uses — no second parser, classifier or save path.
const ReceiptReview = lazy(() => import("@/routes/_authenticated/new").then((m) => ({ default: m.NewExpense })));
const StatementReview = lazy(() => import("@/routes/_authenticated/statements").then((m) => ({ default: m.StatementDeskPage })));
const ClaimReview = lazy(() => import("@/components/ExpenditureReportBuilder").then((m) => ({ default: m.ExpenditureReportBuilder })));

type Phase =
  | { kind: "add" }
  | { kind: "receipt"; files: File[]; search: QuickEntrySearch; key: number }
  | { kind: "statement"; files: File[]; context?: IntakeContext | undefined; key: number }
  | { kind: "done"; id?: string | undefined; label: string; followUp?: "asset" | "claim"; claimOpened?: boolean };

const KIND_ICON: Record<CanvasKind, typeof ReceiptText> = { receipt: ReceiptText, statement: FileStack, travel: Plane, asset: Package };

/** Wide screens (KK decision 5): only there may the owner open the original side by side with the details. */
const WIDE_QUERY = "(min-width: 1100px)";
function useWideScreen(): boolean {
  return useSyncExternalStore(
    (on) => { if (typeof window === "undefined" || !window.matchMedia) return () => {}; const m = window.matchMedia(WIDE_QUERY); m.addEventListener("change", on); return () => m.removeEventListener("change", on); },
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/**
 * iPhone keyboard (KK decision 9): keep the sheet, and so its one sticky action, inside the visible part of the
 * screen when the on-screen keyboard and its accessory bar are up. Writes the visual viewport to CSS variables.
 */
function useVisualViewportBox(layer: HTMLDivElement | null, open: boolean) {
  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!open || !layer || !vv) return;
    const apply = () => {
      const kb = keyboardInset(window.innerHeight, vv.height, vv.offsetTop);
      layer.style.setProperty("--sf-vv-top", `${Math.round(vv.offsetTop)}px`);
      layer.style.setProperty("--sf-vv-h", `${Math.round(vv.height)}px`);
      layer.dataset["keyboard"] = kb ? "open" : "closed";
    };
    apply();
    vv.addEventListener("resize", apply); vv.addEventListener("scroll", apply);
    return () => { vv.removeEventListener("resize", apply); vv.removeEventListener("scroll", apply); layer.style.removeProperty("--sf-vv-top"); layer.style.removeProperty("--sf-vv-h"); delete layer.dataset["keyboard"]; };
  }, [layer, open]);
}

/**
 * Signature Flow Smart Add — the Intelligent Canvas (UIX master §6 E01–E05, §8 Flow 3, §15 Journey C; captures 08–10).
 * 1 · Add: choose what it is and give the source (files, camera, voice or typing).
 * 2 · Review: the existing automatic reading and classification, with the original beside the fields (a
 *     source/data toggle on iPhone). Statements and registers go to Statement Desk, the authoritative intake.
 * 3 · Confirm: a summary of what will be entered. Nothing reaches the books until "Confirm and save"; the
 *     review's own Save is held here and only released by that confirmation.
 * Only shown in the proposed Signature Flow shell; today's UI keeps its Smart Add sheet.
 */
export function IntelligentCanvas({ open, onOpenChange, scope }: { open: boolean; onOpenChange: (open: boolean) => void; scope?: Scope | undefined }) {
  const { preferences } = useStore();
  const [kind, setKind] = useState<CanvasKind>("receipt");
  const [context, setContext] = useState<IntakeContext | undefined>();
  const [picked, setPicked] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "add" });
  const [confirming, setConfirming] = useState<ReviewSummary | null>(null);
  const [view, setView] = useState<"details" | "original">("details");
  // Desktop review is the narrow canvas of reference 09; the owner may open the original beside the details.
  const [sideBySide, setSideBySide] = useState(false);
  const wideScreen = useWideScreen();
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  useVisualViewportBox(layer, open);
  const [shown, setShown] = useState(0);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const release = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => { if (pending.current) return; setPhase({ kind: "add" }); setPicked([]); setConfirming(null); setView("details"); setSideBySide(false); setShown(0); }, []);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const [reviewReady, setReviewReady] = useState(false);

  // Notifications never cover the sticky footer actions (or the iPhone safe area) while the sheet is open.
  const footRef = useRef<HTMLElement>(null);
  useEffect(() => (open ? holdToastsClearOfFooter(footRef.current) : undefined), [open]);
  // Closing the sheet, or browser Back/Forward, never carries a confirmation over: the owner confirms again.
  useEffect(() => { if (!open) setConfirming(null); }, [open]);
  useEffect(() => { const back = () => setConfirming(null); window.addEventListener("popstate", back); return () => window.removeEventListener("popstate", back); }, []);

  // The sticky "Continue to confirmation" mirrors the review's own button: enabled only when the review allows saving.
  useEffect(() => {
    const host = fieldsRef.current;
    if (!host) return;
    const sync = () => { const b = [...host.querySelectorAll<HTMLButtonElement>('form button[type="submit"]')].pop(); setReviewReady(!!b && !b.disabled); };
    sync();
    const o = new MutationObserver(sync);
    o.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
    return () => o.disconnect();
  });

  // Other screens open Smart Add with a purpose (DocuRepo, Assets, Investments…): preselect the matching intake.
  useEffect(() => {
    const on = (e: Event) => {
      const intent = (e as CustomEvent<{ intent?: SmartAddIntent }>).detail?.intent;
      const ctx = smartAddContext(intent);
      if (ctx === "assets") { setKind("asset"); setContext("assets"); }
      else if (ctx) { setKind("statement"); setContext(ctx); }
      else setContext(undefined);
    };
    window.addEventListener(SMART_ADD_EVENT, on);
    return () => window.removeEventListener(SMART_ADD_EVENT, on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[role="listbox"],[data-radix-popper-content-wrapper]')) onOpenChange(false); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onOpenChange]);

  const activeTrip = useMemo(() => {
    const today = todayISO();
    return preferences.trips.filter((t) => t.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
  }, [preferences.trips]);
  const base: QuickEntrySearch = scope ? { scope } : {};

  const add = (list: FileList | File[] | null) => { const files = Array.from(list ?? []); if (files.length) setPicked((p) => [...p, ...files]); };
  const begin = (files: File[], mode: QuickEntrySearch["mode"] = "scan") => {
    const route = canvasRoute(kind, files);
    setShown(0); setView("details"); setConfirming(null);
    if (route === "statement") setPhase({ kind: "statement", files, context: kind === "asset" ? "assets" : context, key: Date.now() });
    else setPhase({ kind: "receipt", files, search: { ...base, mode, ...(kind === "travel" && activeTrip ? { trip: activeTrip.id } : {}) }, key: Date.now() });
  };

  // Step 3 gate: the review's own Save submits its form; hold it here and show the confirmation instead.
  // Every route to a save (the review's button, Enter, the sticky footer, a Retry) lands here first. While a save
  // is in flight nothing else may start one; otherwise the confirmation summary is shown and nothing is saved.
  const holdSave = (e: FormEvent<HTMLDivElement>) => {
    if (release.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (pending.current) return;
    const form = e.target instanceof HTMLFormElement ? e.target : null;
    // Enter in a field can't skip the review's own checks: while its Save is unavailable there is nothing to confirm.
    const own = form ? [...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].pop() : null;
    if (own?.disabled) return;
    formRef.current = form;
    setConfirming(readReviewForm(form, phase.kind === "receipt" ? phase.files : []));
  };
  const continueToConfirmation = () => {
    if (pending.current) return;
    const form = fieldsRef.current?.querySelector("form");
    if (form) form.requestSubmit();
  };
  const confirmSave = () => {
    const form = formRef.current;
    if (!form || !confirming || pending.current || !canConfirm(confirming)) return;
    // Save exactly what was confirmed: if anything changed since the summary was made, show the new summary instead.
    const now = readReviewForm(form, phase.kind === "receipt" ? phase.files : []);
    if (JSON.stringify(now) !== JSON.stringify(confirming)) { setConfirming(now); return; }
    pending.current = true; setSaving(true);
    setConfirming(null);
    release.current = true;
    try { form.requestSubmit(); } finally { release.current = false; }
    // The review reports success through onExit; if it never starts or finishes without saving, allow a new attempt.
    watchSave(form);
  };
  const settle = useCallback(() => { pending.current = false; setSaving(false); }, []);
  const watchSave = (form: HTMLFormElement) => {
    const button = () => [...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].pop();
    let seenBusy = false;
    const check = () => {
      const busy = button()?.getAttribute("aria-busy") === "true";
      if (busy) seenBusy = true;
      else if (seenBusy || !form.isConnected) { observer.disconnect(); clearTimeout(timer); settle(); }
    };
    const observer = new MutationObserver(check);
    observer.observe(form, { subtree: true, attributes: true, attributeFilter: ["aria-busy", "disabled"] });
    const timer = setTimeout(() => { if (!seenBusy) { observer.disconnect(); settle(); } }, 1500);
  };

  const step = stepOf(phase.kind, !!confirming);
  const files = phase.kind === "receipt" || phase.kind === "statement" ? phase.files : [];
  const current = files[Math.min(shown, files.length - 1)];
  const title = phase.kind === "done" ? "Saved to your records." : step === 1 ? "Add anything. Effortlessly." : step === 2 ? "Here’s what we understood." : "Ready for confirmation.";
  // Statement Desk is a full line-by-line comparison and keeps the wide canvas; a receipt is reviewed in the narrow
  // canvas unless the owner opens its original side by side on a wide screen. Edits are kept either way: the review
  // stays mounted and only its layout changes.
  const sideShown = phase.kind === "receipt" && files.length > 0 && sideBySide && wideScreen;
  const wide = !confirming && (phase.kind === "statement" || sideShown);

  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); };

  return <>
    <input ref={fileRef} type="file" accept={SMART_ADD_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label="Choose files" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
    <div hidden={!open} ref={setLayer} className="sf-canvas-layer">
      <div className="sf-canvas-scrim" aria-hidden onClick={() => onOpenChange(false)} />
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sf-canvas-title" className={"sf-canvas" + (wide ? " sf-canvas-wide" : "")} data-step={step}>
        <header className="sf-canvas-head">
          <div className="min-w-0">
            <p className="sf-overline">Smart Add · Intelligent Canvas</p>
            <h2 id="sf-canvas-title" className="sf-canvas-title">{title}</h2>
          </div>
          <button type="button" className="sf-canvas-close" aria-label={phase.kind === "receipt" || phase.kind === "statement" ? "Hide Smart Add (your work stays here)" : "Close Smart Add"} onClick={() => onOpenChange(false)}><X aria-hidden /></button>
          <ol className="sf-steps" aria-label="Steps">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const state = phase.kind === "done" || n < step ? "done" : n === step ? "current" : "next";
              return <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>{state === "done" && <Check aria-hidden />}{n} · {label}</li>;
            })}
          </ol>
        </header>

        <div className="sf-canvas-body">
          {phase.kind === "add" && <div className="sf-canvas-add">
            <p className="sf-canvas-lede">Give us a receipt, statement, travel booking or asset register. Your source remains visible for checking.</p>
            <div className="sf-chips" role="radiogroup" aria-label="What are you adding?">
              {CANVAS_KINDS.map((k) => { const Icon = KIND_ICON[k.id]; return (
                <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className="sf-chip" onClick={() => { setKind(k.id); if (k.id !== "statement") setContext(undefined); }}><Icon aria-hidden />{k.label}</button>
              ); })}
            </div>
            {(() => { const hint = kindHint(kind, kind === "statement" && context ? CONTEXTS[context] : null, activeTrip?.name ?? null); return hint ? <p className="sf-canvas-hint">{hint}</p> : null; })()}
            <div className={"sf-drop" + (dragging ? " sf-drop-active" : "")} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
              <FileUp aria-hidden className="sf-drop-icon" />
              <p className="sf-drop-title">Choose document or photo</p>
              <p className="sf-drop-sub">PDF · Excel · CSV · image — or drop it here</p>
              <div className="sf-drop-actions">
                <button type="button" className="sf-btn sf-btn-outline" onClick={() => fileRef.current?.click()}><FileUp aria-hidden />Choose files</button>
                <button type="button" className="sf-btn sf-btn-outline sf-only-touch" onClick={() => cameraRef.current?.click()}><Camera aria-hidden />Take a photo</button>
              </div>
            </div>
            {picked.length > 0 && <ul className="sf-picked" aria-label="Chosen files">{picked.map((f, i) => (
              <li key={`${f.name}-${i}`}><span className="min-w-0 flex-1 truncate">{f.name}</span><small>{sourceKind(f) === "sheet" ? "Spreadsheet" : sourceKind(f) === "pdf" ? "PDF" : sourceKind(f) === "image" ? "Photo" : "File"}</small><button type="button" aria-label={`Remove ${f.name}`} onClick={() => setPicked((p) => p.filter((_, j) => j !== i))}><X aria-hidden /></button></li>
            ))}</ul>}
            <div className="sf-canvas-alt">
              <button type="button" className="sf-link" onClick={() => begin([], "voice")}><Mic aria-hidden />Describe it by voice</button>
              <button type="button" className="sf-link" onClick={() => begin([], "quick")}><PencilLine aria-hidden />Type it in</button>
              {kind === "travel" && <Link to="/travel-inbox" className="sf-link" onClick={() => onOpenChange(false)}>Import a booking confirmation<ChevronRight aria-hidden /></Link>}
            </div>
          </div>}

          {(phase.kind === "receipt" || phase.kind === "statement") && <div className={"sf-canvas-review" + (files.length ? " sf-has-source" : "")} hidden={!!confirming}>
            {phase.kind === "statement" && <p className="sf-canvas-lede">Statement Desk checks every line; you confirm before anything is posted.</p>}
            {phase.kind === "receipt" && <p className="sf-canvas-lede">Check the suggested account and classification before saving.</p>}
            {files.length > 0 && <div className="sf-view-bar">
              {!sideShown && <div className="sf-view-toggle" role="tablist" aria-label="Show">
                <button type="button" role="tab" id="sf-tab-details" aria-controls="sf-canvas-details" aria-selected={view === "details"} onClick={() => setView("details")}>Details</button>
                <button type="button" role="tab" id="sf-tab-original" aria-controls="sf-canvas-original" aria-selected={view === "original"} onClick={() => setView("original")}>Original</button>
              </div>}
              {phase.kind === "receipt" && wideScreen && <button type="button" className="sf-side-toggle" aria-pressed={sideShown} onClick={() => setSideBySide((v) => !v)}><Columns2 aria-hidden />{sideShown ? "One column" : "Original side by side"}</button>}
            </div>}
            <div className="sf-canvas-split" data-view={view} data-side={sideShown || phase.kind === "statement" ? "true" : undefined}>
              {current && <section className="sf-canvas-source" id="sf-canvas-original" role={sideShown ? undefined : "tabpanel"} aria-labelledby={sideShown ? undefined : "sf-tab-original"} aria-label="Your original">
                <SourcePreview file={current} />
                {files.length > 1 && <div className="sf-chips" role="group" aria-label="Choose which file to view">{files.map((f, i) => <button key={i} type="button" className="sf-chip" aria-pressed={i === shown} onClick={() => setShown(i)}>{i + 1}. {f.name.slice(0, 18)}</button>)}</div>}
              </section>}
              <div className="sf-canvas-fields" id="sf-canvas-details" role={files.length && !sideShown ? "tabpanel" : undefined} aria-labelledby={files.length && !sideShown ? "sf-tab-details" : undefined} ref={fieldsRef} onSubmitCapture={holdSave}>
                <Suspense fallback={<p role="status" className="sf-state-hint">Opening review…</p>}>
                  <div className="smart-add-review min-w-0">
                    {phase.kind === "receipt"
                      ? <ReceiptReview key={phase.key} embedded={{ search: phase.search, files: phase.files, submitLabel: "Continue to confirmation", confirmsAccount: true, onExit: (saved) => { setConfirming(null); settle(); if (saved) setPhase({ kind: "done", id: saved.id, label: saved.label }); else reset(); } }} />
                      : <StatementReview key={phase.key} embedded={{ files: phase.files, context: phase.context }} />}
                  </div>
                </Suspense>
              </div>
            </div>
          </div>}

          {confirming && <div className="sf-canvas-confirm">
            <p className="sf-canvas-lede">Nothing is saved until you confirm. The original stays attached.</p>
            <div className="sf-confirm-card">
              <span className="sf-confirm-tick" aria-hidden><Check /></span>
              <div className="min-w-0"><b>{confirming.headline}</b><small>{confirming.subline}</small></div>
            </div>
            {!canConfirm(confirming) && <div id="sf-account-block" role="alert" className="sf-account-block">
              <p><b>Account needs confirmation.</b> {confirming.account ? "It was suggested for you and hasn't been confirmed." : "The bill doesn't prove which account paid."} Nothing can be saved until you choose or confirm it.</p>
              <button type="button" className="sf-btn sf-btn-outline" onClick={() => { setConfirming(null); setView("details"); requestAnimationFrame(() => { const t = fieldsRef.current?.querySelector<HTMLElement>('[aria-label="Account"]'); t?.scrollIntoView({ block: "center" }); t?.focus(); }); }}>Choose the account</button>
            </div>}
            <dl className="sf-confirm-grid">
              <div><dt>Original</dt><dd>{confirming.original}</dd></div>
              <div><dt>Account</dt><dd>{confirming.account ?? "Not chosen"}{confirming.accountState !== "confirmed" && <span className="sf-needs"> · needs confirmation</span>}{confirming.accountEvidence && <small className="sf-evidence">From: {confirming.accountEvidence}</small>}</dd></div>
              <div><dt>Books</dt><dd>Not posted yet</dd></div>
              {confirming.rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
            </dl>
          </div>}

          {phase.kind === "done" && <div role="status" className="sf-canvas-done">
            <CheckCircle2 aria-hidden className="sf-done-icon" />
            <p className="sf-canvas-lede">{phase.label}. The original is attached to it.</p>
            {phase.id && <div className="sf-done-next" aria-label="Suggested next steps">
              <p className="sf-overline">Also, if this applies</p>
              <button type="button" className="sf-module-row" onClick={() => setPhase({ ...phase, followUp: "claim", claimOpened: true })}><span className="sf-tile" aria-hidden><ReceiptText /></span><span className="min-w-0 flex-1"><b>Claim it back</b><small>Prepare a reimbursement claim</small></span><ChevronRight aria-hidden className="sf-row-chevron" /></button>
              <button type="button" className="sf-module-row" onClick={() => setPhase({ ...phase, followUp: "asset" })}><span className="sf-tile" aria-hidden><Package /></span><span className="min-w-0 flex-1"><b>It's something I own</b><small>Add it to Assets</small></span><ChevronRight aria-hidden className="sf-row-chevron" /></button>
            </div>}
            {phase.id && phase.followUp === "asset" && <ReceiptAssetHandoff entryId={phase.id} />}
            {phase.id && phase.claimOpened && <div hidden={phase.followUp !== "claim"}><Suspense fallback={<p role="status">Opening claim preparation…</p>}><ClaimReview mode="claim" embedded search={{ entry: phase.id }} /></Suspense></div>}
          </div>}
        </div>

        <footer ref={footRef} className="sf-canvas-foot">
          {phase.kind === "add" && <button type="button" className="sf-btn sf-btn-deep" disabled={!picked.length} onClick={() => begin(picked)}>Continue to review<ArrowRight aria-hidden /></button>}
          {(phase.kind === "receipt" || phase.kind === "statement") && !confirming && <>
            <button type="button" className="sf-btn sf-btn-outline" disabled={saving} onClick={reset}><ArrowLeft aria-hidden />Start over</button>
            {phase.kind === "receipt" && <button type="button" className="sf-btn sf-btn-deep" disabled={!reviewReady || saving} aria-describedby={!reviewReady ? "sf-continue-why" : undefined} onClick={continueToConfirmation}>{saving ? "Saving…" : "Continue to confirmation"}<ArrowRight aria-hidden /></button>}
            {phase.kind === "receipt" && !reviewReady && !saving && <p id="sf-continue-why" className="sf-foot-note">Finish the checks in Details first (e.g. “Looks right”).</p>}
            {phase.kind === "statement" && <p className="sf-foot-note">Confirm posting inside Statement Desk.</p>}
          </>}
          {confirming && <>
            <button type="button" className="sf-btn sf-btn-outline" onClick={() => setConfirming(null)}><ArrowLeft aria-hidden />Change</button>
            <button type="button" className="sf-btn sf-btn-deep" disabled={!canConfirm(confirming) || saving} aria-describedby={!canConfirm(confirming) ? "sf-account-block" : undefined} onClick={confirmSave}>Confirm and save<Check aria-hidden /></button>
          </>}
          {phase.kind === "done" && <>
            <Link to="/expenses" className="sf-btn sf-btn-outline" onClick={() => { onOpenChange(false); reset(); }}>View in Activity</Link>
            <button type="button" className="sf-btn sf-btn-deep" onClick={reset}>Add another</button>
          </>}
        </footer>
      </div>
    </div>
  </>;
}
