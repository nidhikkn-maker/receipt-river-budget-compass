// Development/preview-only build identity: which commit, branch and build is showing, and whether it is wired to
// sample data. Renders nothing unless the build set VITE_PREVIEW_ENV=preview, so production never shows it.
// Placement: a small pill at the lower left on iPhone (raised above the tab bar and its safe area) and the lower
// right on wider screens; it stacks below dialogs, sheets, Smart Add (z-50) and toasts, so it never covers their
// actions. It can be hidden for the rest of the browser session (sessionStorage). Mounted once in src/routes/__root.tsx.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { isPreviewBuild, readPreviewInfo, type PreviewEnv } from "@/lib/preview-info";
import { useAppLocked } from "@/lib/app-lock-state";

/** Session-only dismissal: the pill stays hidden in this tab until the browser session ends. */
export const PREVIEW_PILL_HIDDEN_KEY = "ll-preview-pill-hidden";
const readHidden = () => { try { return sessionStorage.getItem(PREVIEW_PILL_HIDDEN_KEY) === "1"; } catch { return false; } };

const BUILD_ENV: PreviewEnv = {
  VITE_PREVIEW_ENV: import.meta.env["VITE_PREVIEW_ENV"],
  VITE_PREVIEW_COMMIT: import.meta.env["VITE_PREVIEW_COMMIT"],
  VITE_PREVIEW_BRANCH: import.meta.env["VITE_PREVIEW_BRANCH"],
  VITE_PREVIEW_BUILT_AT: import.meta.env["VITE_PREVIEW_BUILT_AT"],
  VITE_SUPABASE_URL: import.meta.env["VITE_SUPABASE_URL"],
};

/**
 * Lower-left above the iPhone tab bar (60 px + safe area, plus a 12 px gap); lower-right on md+ where there is no
 * tab bar. z-40: below dialogs/sheets/Smart Add (z-50) and Sonner toasts, above page content and the bars (z-30).
 */
export const PREVIEW_PANEL_POSITION =
  "fixed z-40 left-[max(12px,env(safe-area-inset-left))] bottom-[calc(env(safe-area-inset-bottom,0px)_+_72px)] md:left-auto md:right-[max(16px,env(safe-area-inset-right))] md:bottom-[calc(env(safe-area-inset-bottom,0px)_+_16px)]";

export function PreviewInfoPanel({ env = BUILD_ENV }: { env?: PreviewEnv }) {
  const locked = useAppLocked();
  if (!isPreviewBuild(env) || locked) return null;
  return <PreviewInfoCard env={env} />;
}

function PreviewInfoCard({ env }: { env: PreviewEnv }) {
  const [open, setOpen] = useState(false);
  // Read after mount so the server render and the first client render agree.
  const [hidden, setHidden] = useState(false);
  useEffect(() => { if (readHidden()) setHidden(true); }, []);
  const cardId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const info = useMemo(
    () => readPreviewInfo(env, typeof window === "undefined" ? "" : window.location.host, typeof window === "undefined" ? undefined : window.location.origin),
    [env],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); toggleRef.current?.focus(); } };
    const onPointer = (e: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onPointer); };
  }, [open]);

  const sample = info.dataSource === "sample";
  const hide = () => { setOpen(false); setHidden(true); try { sessionStorage.setItem(PREVIEW_PILL_HIDDEN_KEY, "1"); } catch { /* private mode: hidden until reload */ } };
  if (hidden) return null;
  const name = `Preview build ${info.shortCommit ?? "unknown commit"} on ${info.branch ?? "unknown branch"}, ${sample ? "sample data" : "unknown data source"}`;

  return (
    <div ref={rootRef} className={PREVIEW_PANEL_POSITION + " flex flex-col items-start gap-1 md:items-end"} data-preview-info="">
      {open && (
        <section
          id={cardId}
          aria-label="Preview build details"
          className="order-first w-[min(320px,calc(100vw-24px))] whitespace-normal rounded-2xl border border-border bg-card p-3 text-xs text-card-foreground shadow-lg"
        >
          <p className={"mb-2 rounded-lg px-2 py-1.5 font-semibold " + (sample ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground")}>
            {info.dataSourceLabel}
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            <dt className="text-muted-foreground">Commit</dt>
            <dd className="break-all tabular-nums">{info.commit ?? "Unknown commit"}</dd>
            <dt className="text-muted-foreground">Branch</dt>
            <dd className="break-all">{info.branch ?? "Unknown branch"}</dd>
            <dt className="text-muted-foreground">Build</dt>
            <dd className="break-all tabular-nums">{info.buildVersion}</dd>
            <dt className="text-muted-foreground">Built</dt>
            <dd>{info.builtAtLabel}</dd>
            <dt className="text-muted-foreground">Host</dt>
            <dd className="break-all">{info.host}</dd>
          </dl>
        </section>
      )}
      <div className="flex items-center">
        <button
          ref={toggleRef}
          type="button"
          aria-label={name}
          aria-expanded={open}
          aria-controls={open ? cardId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="group inline-flex min-h-11 min-w-11 items-center justify-center focus-visible:outline-none"
        >
          <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-card px-2 text-[10px] font-medium leading-none text-muted-foreground shadow-sm group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">
            <span aria-hidden className={"h-1.5 w-1.5 shrink-0 rounded-full " + (sample ? "bg-primary" : "bg-muted-foreground")} />
            <span aria-hidden>Preview</span>
            <span aria-hidden className="tabular-nums">{info.shortCommit ?? "—"}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label="Hide preview build details for this session"
          onClick={hide}
          className="group inline-flex min-h-11 min-w-11 items-center justify-center focus-visible:outline-none"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">
            <X aria-hidden className="h-3 w-3" />
          </span>
        </button>
      </div>
    </div>
  );
}
