import { useEffect, useRef } from "react";
import { IdleTracker, idleLimitMs, readViewport, type IdleMessage } from "./idle-policy";

const INPUTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
const CHECK_EVERY_MS = 15_000;

/** One channel per owner. BroadcastChannel where available; otherwise localStorage "storage" events. */
function openChannel(ownerId: string, onMessage: (raw: unknown) => void) {
  const name = `ll-idle-${ownerId}`;
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(name);
    channel.onmessage = (e) => onMessage(e.data);
    return { post: (m: IdleMessage) => { try { channel.postMessage(m); } catch { /* closed */ } }, close: () => channel.close() };
  }
  const listener = (e: StorageEvent) => { if (e.key === name && e.newValue) { try { onMessage(JSON.parse(e.newValue)); } catch { /* ignore */ } } };
  window.addEventListener("storage", listener);
  return {
    post: (m: IdleMessage) => { try { localStorage.setItem(name, JSON.stringify(m)); } catch { /* storage blocked */ } },
    close: () => window.removeEventListener("storage", listener),
  };
}

/**
 * Locks after 5 minutes without input on phones / narrow screens and 15 minutes on desktop, even while
 * the app stays visible. Input in any tab counts for all tabs; a lock in one tab locks every tab.
 */
export function useIdleLock({ ownerId, enabled, locked, onLock }: { ownerId: string; enabled: boolean; locked: boolean; onLock: () => void }) {
  const lockRef = useRef(onLock);
  useEffect(() => { lockRef.current = onLock; });
  useEffect(() => {
    if (!enabled || !ownerId || locked || typeof window === "undefined") return;
    const tracker = new IdleTracker(idleLimitMs(readViewport(window)), Date.now());
    const channel = openChannel(ownerId, (raw) => { if (tracker.receive(raw)) lockRef.current(); });
    const check = () => {
      tracker.limitMs = idleLimitMs(readViewport(window));
      const lock = tracker.check(Date.now());
      if (lock) { channel.post(lock); lockRef.current(); }
      return !!lock;
    };
    const input = () => { const m = tracker.activity(Date.now()); if (m) channel.post(m); };
    // Returning to the app first checks how long it was away (timers pause in the background), then counts as activity.
    const visible = () => { if (!document.hidden && !check()) input(); };
    for (const name of INPUTS) window.addEventListener(name, input, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      clearInterval(timer);
      for (const name of INPUTS) window.removeEventListener(name, input, { capture: true });
      document.removeEventListener("visibilitychange", visible);
      channel.close();
    };
  }, [ownerId, enabled, locked]);
}
