// Whether the signed-in app is locked (or still deciding whether to lock on start). While it is, both shells render
// no navigation, workspace name, avatar, reminders or other chrome, and the lock screen makes everything else inert
// (UIX §16.4, P0-029). UI hiding is not access control: the server still verifies every request.
import { useSyncExternalStore } from "react";

let locked = false;
const listeners = new Set<() => void>();

export function setAppLocked(next: boolean) {
  if (locked === next) return;
  locked = next;
  for (const l of listeners) l();
}

export const isAppLocked = () => locked;
/** Subscribe outside React (e.g. a future store pause); returns the unsubscribe function. */
export function subscribeAppLocked(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** App-wide lock state for anything outside the page subtree (shell, toaster, preview panel, pollers). */
export function useAppLocked(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => locked, () => false);
}

export const useDeviceLocked = useAppLocked;

/**
 * Makes every element outside `keep` inert and hidden from assistive technology (body's other children, including
 * toasts and portals), and restores each element's previous state when the returned function runs.
 */
export function isolate(keep: Element): () => void {
  const changed: { el: HTMLElement; inert: string | null; hidden: string | null }[] = [];
  const apply = () => {
    for (const el of Array.from(document.body.children)) {
      if (!(el instanceof HTMLElement) || el === keep || el.contains(keep) || changed.some((c) => c.el === el)) continue;
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
      changed.push({ el, inert: el.getAttribute("inert"), hidden: el.getAttribute("aria-hidden") });
      el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true");
    }
  };
  apply();
  // Portals or toasts added while locked are isolated too.
  const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(apply);
  observer?.observe(document.body, { childList: true });
  return () => {
    observer?.disconnect();
    for (const c of changed) { if (c.inert == null) c.el.removeAttribute("inert"); else c.el.setAttribute("inert", c.inert); if (c.hidden == null) c.el.removeAttribute("aria-hidden"); else c.el.setAttribute("aria-hidden", c.hidden); }
  };
}
