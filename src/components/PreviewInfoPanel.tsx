// Development/preview-only build identity: which commit, branch and build is showing, and whether it is wired to
// sample data. Renders nothing unless the build set VITE_PREVIEW_ENV=preview, so production never shows it.
// Placement: a compact pill at the lower left on iPhone (raised above the tab bar and its safe area) and the lower
// right on wider screens; it stacks below dialogs, sheets, Smart Add (z-50) and toasts, so it never covers their
// actions. Mounted once in src/routes/__root.tsx.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isPreviewBuild, readPreviewInfo, type PreviewEnv } from "@/lib/preview-info";

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
  if (!isPreviewBuild(env)) return null;
  return <PreviewInfoCard env={env} />;
}

function PreviewInfoCard({ env }: { env: PreviewEnv }) {
  const [open, setOpen] = useState(false);
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
  const name = `Preview build ${info.shortCommit ?? "unknown commit"} on ${info.branch ?? "unknown branch"}, ${sample ? "sample data" : "unknown data source"}`;

  return (
    <div ref={rootRef} className={PREVIEW_PANEL_POSITION + " flex flex-col items-start gap-2 md:items-end"} data-preview-info="">
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
      <button
        ref={toggleRef}
        type="button"
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[11px] font-medium text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden className={"h-2 w-2 shrink-0 rounded-full " + (sample ? "bg-primary" : "bg-muted-foreground")} />
        <span aria-hidden>Preview</span>
        <span aria-hidden className="tabular-nums">{info.shortCommit ?? "—"}</span>
        <span aria-hidden className="hidden sm:inline">· {sample ? "Sample data" : "Unknown data"}</span>
      </button>
    </div>
  );
}
