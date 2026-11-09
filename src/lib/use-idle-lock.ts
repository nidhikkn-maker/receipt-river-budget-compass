import { useEffect, useRef } from "react";
import { IdleTracker, activityKey, idleLimitMs, readViewport, validActivity, type IdleMessage } from "./idle-policy";

const INPUTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
const CHECK_EVERY_MS = 15_000;

/** Last trustworthy input time saved on this device for this owner (future or malformed values are ignored). */
export function readLastActivity(ownerId: string, now = Date.now()): number | null {
  try { return validActivity(localStorage.getItem(activityKey(ownerId)), now); } catch { return null; }
}

/** Saves an input time; never moves a valid saved time backwards. Blocked storage only loses fresh-start evidence. */
export function recordActivity(ownerId: string, at = Date.now()) {
  if (!ownerId) return;
  try {
    const saved = validActivity(localStorage.getItem(activityKey(ownerId)), Math.max(at, Date.now()));
    if (saved == null || at > saved) localStorage.setItem(activityKey(ownerId), String(Math.floor(at)));
  } catch { /* storage blocked */ }
}

export function forgetActivity(ownerId: string) {
  try { localStorage.removeItem(activityKey(ownerId)); } catch { /* storage blocked */ }
}

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
 * the app stays visible. Input in any tab counts for all tabs; a lock in one tab locks every tab. Input times are
 * saved per owner so a fresh start can tell how long the app was away (see shouldLockOnStart).
 */
export function useIdleLock({ ownerId, enabled, locked, onLock }: { ownerId: string; enabled: boolean; locked: boolean; onLock: () => void }) {
  const lockRef = useRef(onLock);
  useEffect(() => { lockRef.current = onLock; });
  useEffect(() => {
    if (!enabled || !ownerId || locked || typeof window === "undefined") return;
    const start = Date.now();
    const tracker = new IdleTracker(idleLimitMs(readViewport(window)), start);
    // Count from the last input saved by any tab (or an earlier visit), not from when this screen opened.
    const saved = readLastActivity(ownerId, start);
    if (saved != null) tracker.last = saved;
    const channel = openChannel(ownerId, (raw) => { if (tracker.receive(raw)) lockRef.current(); });
    const check = () => {
      tracker.limitMs = idleLimitMs(readViewport(window));
      const lock = tracker.check(Date.now());
      if (lock) { channel.post(lock); lockRef.current(); }
      return !!lock;
    };
    const input = () => { const m = tracker.activity(Date.now()); if (m) { channel.post(m); recordActivity(ownerId, m.at); } };
    // Returning to the app first checks how long it was away (timers pause in the background), then counts as activity.
    const visible = () => { if (!document.hidden && !check()) input(); };
    for (const name of INPUTS) window.addEventListener(name, input, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    check();
    return () => {
      clearInterval(timer);
      for (const name of INPUTS) window.removeEventListener(name, input, { capture: true });
      document.removeEventListener("visibilitychange", visible);
      channel.close();
    };
  }, [ownerId, enabled, locked]);
}
