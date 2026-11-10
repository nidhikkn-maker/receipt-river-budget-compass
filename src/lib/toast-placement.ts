// Where notifications appear. While a sheet with a sticky action footer is open (Smart Add, on iPhone especially),
// toasts sit just above that footer (which already includes the bottom safe area), so they never cover "Continue to
// confirmation" or "Confirm and save" — nor the sheet's header and close button. Elsewhere they keep the default.
import { useSyncExternalStore } from "react";

export interface ToastPlacement {
  position: "bottom-right" | "bottom-center" | "top-center";
  offset: { top?: string; bottom?: string };
  mobileOffset: { top?: string; bottom?: string };
}

const GAP = 8;
const TOP = "calc(env(safe-area-inset-top, 0px) + 12px)";
/**
 * Pure: the placement for the open sheets. `clearance` is the distance in px from the bottom of the viewport to the
 * top of the open sheet's footer; toasts are raised above it. Without a measured footer they move to the top.
 */
export function toastPlacement(sheetsOpen: number, clearance: number | null = null): ToastPlacement {
  if (sheetsOpen <= 0) return { position: "bottom-right", offset: {}, mobileOffset: {} };
  if (clearance == null || !Number.isFinite(clearance)) return { position: "top-center", offset: { top: TOP }, mobileOffset: { top: TOP } };
  const bottom = `${Math.max(0, Math.ceil(clearance)) + GAP}px`;
  return { position: "bottom-center", offset: { bottom }, mobileOffset: { bottom } };
}

/** Distance from the bottom of the viewport to the top of an element (its "clearance"). */
export const clearanceAbove = (el: Element) => window.innerHeight - el.getBoundingClientRect().top;

type Hold = { clearance: number | null };
const holds: Hold[] = [];
let snapshot = toastPlacement(0);
const listeners = new Set<() => void>();
const update = () => {
  const top = holds[holds.length - 1];
  const next = toastPlacement(holds.length, top?.clearance ?? null);
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  for (const l of listeners) l();
};

/**
 * Call while a sheet with a sticky footer is open. Pass the footer to keep toasts above it (re-measured as it grows
 * or the viewport changes); the returned function releases the hold (safe to call twice).
 */
export function holdToastsClearOfFooter(footer?: Element | null): () => void {
  const hold: Hold = { clearance: null };
  holds.push(hold);
  const measure = () => { if (footer?.isConnected) { hold.clearance = clearanceAbove(footer); update(); } };
  let observer: ResizeObserver | null = null;
  if (footer) {
    measure();
    // The footer moves when the sheet around it resizes (a centred sheet changing height between steps), so watch both.
    if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(measure); observer.observe(footer); if (footer.parentElement) observer.observe(footer.parentElement); }
    window.addEventListener("resize", measure);
  }
  update();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    observer?.disconnect();
    window.removeEventListener("resize", measure);
    const i = holds.indexOf(hold);
    if (i >= 0) holds.splice(i, 1);
    update();
  };
}

export function useToastPlacement(): ToastPlacement {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => snapshot, () => toastPlacement(0));
}
