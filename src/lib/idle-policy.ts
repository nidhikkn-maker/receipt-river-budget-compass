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
/** Every unlock method may reopen an already signed-in app; none of them signs in or recovers an account. */
export function canReopenApp(method: UnlockMethod) {
  return method === "passkey" || method === "password" || method === "email-code" || method === "pin";
}
/** Only methods the server verifies for re-confirmation count; the PIN and the lock-screen email code do not. */
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

// ---------------------------------------------------------------------------------------------------------
// Fresh starts, guests and unlock choices (KK finding). Pure rules; DeviceLock wires them to the browser.

/** Last input time for one owner, shared by every tab of this browser. Owner-scoped so accounts never mix. */
export const activityKey = (ownerId: string) => `ll-activity-${ownerId}`;

/** A sign-in time a little ahead of this device's clock is server clock drift, not tampering. */
export const SIGN_IN_CLOCK_SKEW_MS = 2 * 60_000;

function toTime(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** A saved activity time is trusted only when it is a real time not in the future (a future time could only extend the session). */
export function validActivity(raw: unknown, now: number): number | null {
  const t = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(t) && t > 0 && t <= now ? t : null;
}

/** The time the app should count idleness from on a fresh start, or null when there is no trustworthy evidence. */
export function lastKnownActivity({ now, lastActivity, lastSignInAt }: { now: number; lastActivity: number | null | undefined; lastSignInAt: number | string | null | undefined }): number | null {
  const activity = validActivity(lastActivity ?? null, now);
  if (activity != null) return activity;
  const signIn = toTime(lastSignInAt);
  if (signIn == null || signIn <= 0 || signIn > now + SIGN_IN_CLOCK_SKEW_MS) return null;
  return Math.min(signIn, now);
}

/**
 * On a fresh start (app reopened, page reloaded, new tab) lock when the last activity on this device is older
 * than the idle limit. With no activity record, fall back to the account's last sign-in time, so clearing
 * storage on an old session still locks while a fresh sign-in does not. No trustworthy evidence at all locks.
 */
export function shouldLockOnStart(input: { now: number; lastActivity: number | null | undefined; lastSignInAt: number | string | null | undefined; limitMs: number }): boolean {
  const since = lastKnownActivity(input);
  return since == null || idleExpired(since, input.now, input.limitMs);
}

export type UnlockMethod = "passkey" | "password" | "email-code" | "pin";

export type UnlockFacts = { isAnonymous: boolean; hasPassword: boolean; hasPasskey: boolean; hasMpin: boolean; email: string | null | undefined };

/**
 * The ways this owner can reopen a locked app, in the order they are offered. Guests have no password or email
 * to re-verify, so only device methods they set up apply. Account sign-out is always available on top of these.
 */
export function unlockMethodsFor(f: UnlockFacts): UnlockMethod[] {
  const methods: UnlockMethod[] = [];
  if (f.hasPasskey) methods.push("passkey");
  if (f.hasMpin) methods.push("pin");
  if (f.isAnonymous) return methods;
  if (f.hasPassword && f.email) methods.push("password");
  if (f.email) methods.push("email-code");
  return methods;
}

/** Methods that verify the person again (not the device PIN). Used after five wrong PIN tries. */
export function fullUnlockMethods(f: UnlockFacts): UnlockMethod[] {
  return unlockMethodsFor(f).filter((m) => m !== "pin");
}

/** Methods that may also count as re-confirmation for sensitive changes. The PIN never does. */
export function stepUpMethodsFor(f: UnlockFacts): UnlockMethod[] {
  return unlockMethodsFor(f).filter(satisfiesStepUp);
}

/**
 * What happens when a guest (anonymous demo) session goes idle: lock when the guest set up a device method
 * that can reopen it, otherwise end the session, because nothing could re-verify who is holding the device.
 */
export function guestIdleOutcome(f: Pick<UnlockFacts, "isAnonymous" | "hasPasskey" | "hasMpin">): "lock" | "end-session" {
  if (!f.isAnonymous) return "lock";
  return f.hasPasskey || f.hasMpin ? "lock" : "end-session";
}

/** Shown on /auth after a guest session was ended for inactivity. */
export const GUEST_IDLE_NOTICE = "Your guest session ended after inactivity. Start a new one to keep exploring.";

/** Providers from the account record. A password exists only with the "email" provider. */
export function accountProviders(user: { identities?: { provider?: string | null }[] | null; app_metadata?: { provider?: unknown; providers?: unknown } | null } | null | undefined): string[] {
  const set = new Set<string>();
  for (const i of user?.identities ?? []) if (typeof i?.provider === "string") set.add(i.provider);
  const meta = user?.app_metadata;
  if (typeof meta?.provider === "string") set.add(meta.provider);
  if (Array.isArray(meta?.providers)) for (const p of meta.providers) if (typeof p === "string") set.add(p);
  return [...set];
}

/** Email codes can be requested again after this wait; the auth service applies its own limits too. */
export const EMAIL_CODE_RESEND_MS = 60_000;
export function codeResendWaitMs(lastSentAt: number | null | undefined, now: number) {
  if (lastSentAt == null || !Number.isFinite(lastSentAt)) return 0;
  if (lastSentAt > now) return EMAIL_CODE_RESEND_MS; // the clock moved back: wait a full period
  return Math.max(0, lastSentAt + EMAIL_CODE_RESEND_MS - now);
}

/** Shows enough of an address to recognise it on a lock screen without revealing it to someone else holding the device. */
export function maskEmail(email: string) {
  const at = email.indexOf("@");
  if (at < 1) return email ? "your email" : "";
  const name = email.slice(0, at);
  return `${name[0]}${"•".repeat(Math.min(6, Math.max(2, name.length - 1)))}${email.slice(at)}`;
}
