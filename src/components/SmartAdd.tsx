import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Camera, FileUp, Mic, PencilLine, MessageSquare, X, ChevronLeft, CheckCircle2, Images, ChevronRight } from 'lucide-react';
import night from '@/assets/companion-add-night.jpg';
import { Link } from '@tanstack/react-router';
import { Button } from './ui/button';
import { SourcePreview, sourceKind } from './SourcePreview';
import type { Scope } from '@/lib/expenses';
import type { QuickEntrySearch } from '@/lib/quick-entry';

// The same review screens the app already uses, hosted inside this sheet — no second parser or save path.
const ReceiptReview = lazy(() => import('@/routes/_authenticated/new').then((m) => ({ default: m.NewExpense })));
const StatementReview = lazy(() => import('@/routes/_authenticated/statements').then((m) => ({ default: m.StatementDeskPage })));

type Stage =
  | { kind: 'choose' }
  | { kind: 'classify'; files: File[] }
  | { kind: 'receipt'; files: File[]; search: QuickEntrySearch; key: number }
  | { kind: 'statement'; files: File[]; key: number }
  | { kind: 'done'; id?: string | undefined; label: string };

export const SMART_ADD_ACCEPT = 'image/*,application/pdf,.pdf,.csv,.xls,.xlsx';

/** Decides where picked files are reviewed: photos are receipts, spreadsheets are statements, a PDF is the owner's call. */
export function routeFiles(files: File[]): 'receipt' | 'statement' | 'ask' {
  const kinds = files.map(sourceKind);
  if (kinds.every((k) => k === 'image')) return 'receipt';
  if (kinds.some((k) => k === 'sheet')) return 'statement';
  return 'ask';
}

export function SmartAdd({ open, onOpenChange, scope }: { open: boolean; onOpenChange: (open: boolean) => void; scope?: Scope | undefined }) {
  const [stage, setStage] = useState<Stage>({ kind: 'choose' });
  const [shown, setShown] = useState(0);
  const cameraRef = useRef<HTMLInputElement>(null), galleryRef = useRef<HTMLInputElement>(null), fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const base: QuickEntrySearch = scope ? { scope } : {};
  const busy = stage.kind === 'receipt' || stage.kind === 'statement' || stage.kind === 'classify';

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="listbox"],[data-radix-popper-content-wrapper]')) onOpenChange(false); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onOpenChange]);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []); if (!files.length) return;
    setShown(0);
    const where = routeFiles(files);
    if (where === 'receipt') setStage({ kind: 'receipt', files, search: { ...base, mode: 'scan' }, key: Date.now() });
    else if (where === 'statement') setStage({ kind: 'statement', files, key: Date.now() });
    else setStage({ kind: 'classify', files });
  };
  const typed = (mode: 'voice' | 'quick' | 'message') => setStage({ kind: 'receipt', files: [], search: { ...base, mode }, key: Date.now() });
  const reset = () => { setStage({ kind: 'choose' }); setShown(0); };
  const files = stage.kind === 'receipt' || stage.kind === 'statement' || stage.kind === 'classify' ? stage.files : [];
  const current = files[Math.min(shown, files.length - 1)];

  const preview = current && <section aria-label="Your document" className="space-y-2">
    <SourcePreview file={current} />
    {files.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label="Choose which file to view">{files.map((f, i) => <Button key={i} size="sm" variant={i === shown ? 'default' : 'outline'} onClick={() => setShown(i)}>{i + 1}. {f.name.slice(0, 18)}</Button>)}</div>}
  </section>;

  return <>
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    <input ref={galleryRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label="Choose photos" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    <input ref={fileRef} type="file" accept={SMART_ADD_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label="Choose files" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    <div hidden={!open} className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" aria-hidden onClick={() => onOpenChange(false)} />
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="smart-add-title"
        style={stage.kind === 'choose' ? { backgroundImage: `url(${night})` } : undefined}
        className={`smart-add-sheet native-sheet ${stage.kind === 'choose' ? 'smart-add-night ' : ''}absolute inset-x-0 bottom-0 flex max-h-[96dvh] flex-col overflow-clip rounded-t-3xl border bg-background shadow-xl outline-none sm:inset-y-4 sm:left-auto sm:right-4 sm:bottom-4 sm:max-h-none sm:rounded-3xl ${stage.kind === 'choose' ? 'sm:w-[28rem]' : 'sm:w-[min(72rem,calc(100vw-2rem))]'}`}>
        <header className="flex min-h-14 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] sm:pt-0">
          {busy && <Button variant="ghost" size="icon" aria-label="Start over" onClick={reset}><ChevronLeft className="size-5" /></Button>}
          <h2 id="smart-add-title" className={stage.kind === 'choose' ? 'sr-only' : 'flex-1 text-base font-semibold'}>Smart Add</h2>{stage.kind === 'choose' && <span className="flex-1" />}
          <Button variant="ghost" size="icon" aria-label={busy ? 'Hide Smart Add (your work stays here)' : 'Close Smart Add'} onClick={() => onOpenChange(false)}><X className="size-5" /></Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
          {stage.kind === 'choose' && <div className="flex min-h-full flex-col gap-6 pb-4 pt-6 sm:pt-10">
            <div><p className="cmp-add-title cmp-serif" aria-hidden>Add to Ledgerline</p><p className="cmp-add-sub">Show me a receipt or statement, or just tell me. Nothing is saved until you confirm.{scope ? ` Adding to ${scope.charAt(0).toUpperCase()}${scope.slice(1)}.` : ''}</p></div>
            <div className="grid gap-3">
              <button type="button" aria-label="Scan or Photo" className="cmp-pearl-row" onClick={() => cameraRef.current?.click()}><span className="cmp-icon"><Camera /></span><span className="min-w-0 flex-1"><b>Scan or Photo</b><small>Snap a receipt or bill</small></span><ChevronRight /></button>
              <button type="button" aria-label="Upload File" className="cmp-pearl-row" onClick={() => fileRef.current?.click()}><span className="cmp-icon"><FileUp /></span><span className="min-w-0 flex-1"><b>Upload File</b><small>PDF, statement, spreadsheet or photo</small></span><ChevronRight /></button>
              <button type="button" aria-label="Voice Entry" className="cmp-pearl-row" onClick={() => typed('voice')}><span className="cmp-icon"><Mic /></span><span className="min-w-0 flex-1"><b>Voice Entry</b><small>Say what you spent</small></span><ChevronRight /></button>
              <button type="button" aria-label="Quick Entry" className="cmp-pearl-row" onClick={() => typed('quick')}><span className="cmp-icon"><PencilLine /></span><span className="min-w-0 flex-1"><b>Quick Entry</b><small>Type an amount and a note</small></span><ChevronRight /></button>
            </div>
            <p className="cmp-night-link mt-auto text-sm">Also: <button type="button" onClick={() => galleryRef.current?.click()}><Images className="mr-1 inline size-4" />choose from photos</button> · <button type="button" aria-label="From Message" onClick={() => typed('message')}><MessageSquare className="mr-1 inline size-4" />paste a bank message</button> · <Link to="/statements" onClick={() => onOpenChange(false)}>many statements at once</Link></p>
          </div>}

          {stage.kind === 'classify' && <div className="grid gap-6 lg:grid-cols-2">
            {preview}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">What is this?</h3>
              <p className="text-sm text-muted-foreground">I'll read it the right way. Bills become one entry; statements become a list you check together.</p>
              <Button className="h-12 w-full" onClick={() => setStage({ kind: 'receipt', files: stage.files, search: { ...base, mode: 'scan' }, key: Date.now() })}>A bill or receipt</Button>
              <Button variant="outline" className="h-12 w-full" onClick={() => setStage({ kind: 'statement', files: stage.files, key: Date.now() })}>A statement or other document</Button>
              <p className="text-xs text-muted-foreground">Bank, card, loan, investment and company papers go to "statement or other document".</p>
            </div>
          </div>}

          {(stage.kind === 'receipt' || stage.kind === 'statement') && <div className={files.length ? 'grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : ''}>
            {files.length > 0 && <div className="lg:sticky lg:top-0 lg:self-start">{preview}</div>}
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Opening review…</p>}>
              <div className="smart-add-review min-w-0">
                {stage.kind === 'receipt'
                  ? <ReceiptReview key={stage.key} embedded={{ search: stage.search, files: stage.files, onExit: (saved) => saved ? setStage({ kind: 'done', id: saved.id, label: saved.label }) : reset() }} />
                  : <StatementReview key={stage.key} embedded={{ files: stage.files }} />}
              </div>
            </Suspense>
          </div>}

          {stage.kind === 'done' && <div role="status" className="space-y-4 py-6 text-center">
            <CheckCircle2 className="mx-auto size-10 text-success" />
            <h3 className="text-lg font-semibold">Saved to your records</h3>
            <p className="text-sm text-muted-foreground">{stage.label}. The original bill is attached to it.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline"><Link to="/expenses" onClick={() => { onOpenChange(false); reset(); }}>View in Activity</Link></Button>
              <Button onClick={reset}>Add another</Button>
            </div>
          </div>}
        </div>
      </div>
    </div>
  </>;
}
