// P0-029 / P0-030: while the app is locked, background financial work pauses (UIX §16.4-16.5). The store and the
// page pollers ask this gate before they fetch, flush or paint; nothing they start while locked reaches the screen,
// and one resume run follows an authorised unlock. UI hiding is still not access control: the server verifies every
// request, and this only stops the client from fetching and painting data nobody is allowed to see right now.
import { isAppLocked, subscribeAppLocked } from "./app-lock-state";

export interface LockSource { isLocked: () => boolean; subscribe: (listener: () => void) => () => void; now?: () => number }
const appLock: LockSource = { isLocked: isAppLocked, subscribe: subscribeAppLocked };

/** One background run (a load or a flush). `live()` is false once the app has locked since the run began. */
export interface GateRun { live: () => boolean; end: () => void }

export interface LockGate {
  /** True while locked: start nothing new. */
  paused: () => boolean;
  /** Marks a run; a lock during it makes the next unlock resume once (its own result is never painted). */
  begin: () => GateRun;
  /** Something asked to run while locked: the next unlock resumes once. */
  defer: () => void;
  /** Starts following the lock state; returns the detach function. */
  attach: () => () => void;
}

/** A lock held this long refreshes on unlock even if nothing asked while it was locked (figures may be stale). */
export const STALE_LOCK_MS = 60_000;

/**
 * `resume` runs at most once per unlock, and only when something was deferred, a run was interrupted by the lock,
 * or the lock lasted at least STALE_LOCK_MS. A brief start-up check that deferred nothing causes no extra load.
 */
export function createLockGate(resume: () => unknown, source: LockSource = appLock): LockGate {
  const now = source.now ?? (() => Date.now());
  let epoch = 0, active = 0, wanted = false, lockedAt: number | null = null, was = false;
  const onChange = () => {
    const locked = source.isLocked();
    if (locked === was) return;
    was = locked;
    if (locked) { epoch++; lockedAt = now(); if (active > 0) wanted = true; return; }
    const stale = lockedAt != null && now() - lockedAt >= STALE_LOCK_MS;
    lockedAt = null;
    if (!wanted && !stale) return;
    wanted = false;
    // A lock that returns before this runs makes the resumed work defer itself again.
    void Promise.resolve().then(resume).catch(() => {});
  };
  return {
    paused: () => source.isLocked(),
    begin: () => {
      const token = epoch; let open = true; active++;
      return { live: () => token === epoch && !source.isLocked(), end: () => { if (open) { open = false; active--; } } };
    },
    defer: () => { wanted = true; },
    attach: () => {
      was = source.isLocked();
      if (was) { epoch++; lockedAt = now(); }
      return source.subscribe(onChange);
    },
  };
}

/** For page pollers and focus/online refetches: false while locked, so the tick is skipped. */
export const backgroundAllowed = (source: LockSource = appLock) => !source.isLocked();

/** Runs `fn` now, or once after the next unlock if the app is locked. Returns a cancel function. */
export function whenUnlocked(fn: () => void, source: LockSource = appLock): () => void {
  if (!source.isLocked()) { fn(); return () => {}; }
  let off: (() => void) | null = source.subscribe(() => { if (source.isLocked() || !off) return; off(); off = null; fn(); });
  return () => { off?.(); off = null; };
}
