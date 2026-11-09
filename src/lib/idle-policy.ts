// Mandatory inactivity lock (Phase 1 session rules). Pure timing rules; DeviceLock wires them to the browser.
// Phones and narrow screens lock after 5 minutes without input, desktops after 15 minutes. Activity in any
// tab of this browser counts for all tabs, and a lock in one tab locks every tab.
export const PHONE_IDLE_MS = 5 * 60_000;
export const DESKTOP_IDLE_MS = 15 * 60_000;
export const NARROW_SCREEN_PX = 768;
/** Activity is shared with other tabs at most this often, so typing never floods the channel. */
export const ACTIVITY_SHARE_MS = 5_000;

export type Viewport = { width: number; coarsePointer: boolean };

export function isPhoneLike(v: Viewport) {
  return v.coarsePointer || v.width < NARROW_SCREEN_PX;
}

export function idleLimitMs(v: Viewport) {
  return isPhoneLike(v) ? PHONE_IDLE_MS : DESKTOP_IDLE_MS;
}

export function readViewport(win: Pick<Window, "innerWidth" | "matchMedia">): Viewport {
  let coarsePointer = false;
  try { coarsePointer = win.matchMedia("(pointer: coarse)").matches; } catch { coarsePointer = false; }
  return { width: win.innerWidth, coarsePointer };
}

export function idleExpired(lastActivity: number, now: number, limitMs: number) {
  return now - lastActivity >= limitMs;
}

export type IdleMessage = { type: "activity"; at: number } | { type: "lock"; at: number };

/** Messages from other tabs are untrusted shapes; anything unexpected is ignored. */
export function parseIdleMessage(raw: unknown): IdleMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as { type?: unknown; at?: unknown };
  if ((m.type !== "activity" && m.type !== "lock") || typeof m.at !== "number" || !Number.isFinite(m.at)) return null;
  return { type: m.type, at: m.at };
}

/** How the app was reopened. The 4-digit PIN may reopen the app but never counts as re-confirmation (Decision 30). */
export type UnlockMethod = "passkey" | "password" | "pin";
export function canReopenApp(method: UnlockMethod) {
  return method === "passkey" || method === "password" || method === "pin";
}
export function satisfiesStepUp(method: UnlockMethod) {
  return method === "passkey" || method === "password";
}

/**
 * Tracks the latest input seen by this tab or any other tab. `check` says when the lock is due.
 * The clock is injected so the rules are testable without timers.
 */
export class IdleTracker {
  last: number;
  locked = false;
  private shared = -Infinity;
  constructor(public limitMs: number, now: number) { this.last = now; }

  /** Local input. Returns the message to share with other tabs, if it is time to share one. */
  activity(now: number): IdleMessage | null {
    if (this.locked) return null;
    this.last = Math.max(this.last, now);
    if (now - this.shared < ACTIVITY_SHARE_MS) return null;
    this.shared = now;
    return { type: "activity", at: now };
  }

  /** A message from another tab. Returns true when this tab must lock now. */
  receive(raw: unknown): boolean {
    const m = parseIdleMessage(raw);
    if (!m) return false;
    if (m.type === "lock") { this.locked = true; return true; }
    if (!this.locked) this.last = Math.max(this.last, m.at);
    return false;
  }

  /** Returns the lock message to share when this tab has just become idle. */
  check(now: number): IdleMessage | null {
    if (this.locked || !idleExpired(this.last, now, this.limitMs)) return null;
    this.locked = true;
    return { type: "lock", at: now };
  }

  /** Milliseconds until the lock is due (never negative). */
  remaining(now: number) {
    return Math.max(0, this.last + this.limitMs - now);
  }

  unlock(now: number) {
    this.locked = false;
    this.last = now;
  }
}
