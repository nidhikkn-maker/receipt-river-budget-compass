import { describe, expect, it } from "vitest";
import { DESKTOP_IDLE_MS, EMAIL_CODE_RESEND_MS, IdleTracker, PHONE_IDLE_MS, accountProviders, activityKey, canReopenApp, codeResendWaitMs, fullUnlockMethods, guestIdleOutcome, idleExpired, idleLimitMs, lastKnownActivity, maskEmail, parseIdleMessage, readViewport, satisfiesStepUp, shouldLockOnStart, stepUpMethodsFor, unlockMethodsFor, validActivity, type UnlockFacts } from "./idle-policy";
import { STEP_UP_PREFIX } from "./step-up";

const MIN = 60_000;

describe("idle thresholds", () => {
  it("locks phones and narrow screens after 5 minutes", () => {
    expect(PHONE_IDLE_MS).toBe(5 * MIN);
    expect(idleLimitMs({ width: 390, coarsePointer: true })).toBe(5 * MIN);
    expect(idleLimitMs({ width: 767, coarsePointer: false })).toBe(5 * MIN);
    // A tablet in landscape with touch input is treated like a phone.
    expect(idleLimitMs({ width: 1180, coarsePointer: true })).toBe(5 * MIN);
  });
  it("locks desktops after 15 minutes", () => {
    expect(DESKTOP_IDLE_MS).toBe(15 * MIN);
    expect(idleLimitMs({ width: 768, coarsePointer: false })).toBe(15 * MIN);
    expect(idleLimitMs({ width: 1440, coarsePointer: false })).toBe(15 * MIN);
  });
  it("reads the viewport and falls back to fine pointer when media queries fail", () => {
    expect(readViewport({ innerWidth: 500, matchMedia: () => ({ matches: true }) as MediaQueryList })).toEqual({ width: 500, coarsePointer: true });
    expect(readViewport({ innerWidth: 1200, matchMedia: () => { throw Error("no"); } })).toEqual({ width: 1200, coarsePointer: false });
  });
  it("expires exactly at the limit", () => {
    expect(idleExpired(0, 5 * MIN - 1, 5 * MIN)).toBe(false);
    expect(idleExpired(0, 5 * MIN, 5 * MIN)).toBe(true);
  });
});

describe("IdleTracker", () => {
  it("locks after the limit from the last input even while visible", () => {
    const t = new IdleTracker(5 * MIN, 0);
    t.activity(2 * MIN);
    expect(t.check(6 * MIN)).toBeNull();
    expect(t.remaining(6 * MIN)).toBe(1 * MIN);
    expect(t.check(7 * MIN)).toEqual({ type: "lock", at: 7 * MIN });
    expect(t.locked).toBe(true);
    // Already locked: no second lock message, and input no longer counts.
    expect(t.check(8 * MIN)).toBeNull();
    expect(t.activity(8 * MIN)).toBeNull();
  });
  it("counts activity from another tab", () => {
    const t = new IdleTracker(15 * MIN, 0);
    expect(t.receive({ type: "activity", at: 14 * MIN })).toBe(false);
    expect(t.check(20 * MIN)).toBeNull();
    expect(t.check(29 * MIN)).not.toBeNull();
  });
  it("older activity from another tab never moves the clock back", () => {
    const t = new IdleTracker(5 * MIN, 4 * MIN);
    t.receive({ type: "activity", at: 1 * MIN });
    expect(t.last).toBe(4 * MIN);
  });
  it("a lock in one tab locks every tab", () => {
    const a = new IdleTracker(5 * MIN, 0), b = new IdleTracker(5 * MIN, 0);
    b.activity(4 * MIN);
    const lock = a.check(5 * MIN);
    expect(lock).not.toBeNull();
    expect(b.receive(lock)).toBe(true);
    expect(b.locked).toBe(true);
  });
  it("shares activity at most every few seconds", () => {
    const t = new IdleTracker(5 * MIN, 0);
    expect(t.activity(1000)).toEqual({ type: "activity", at: 1000 });
    expect(t.activity(2000)).toBeNull();
    expect(t.last).toBe(2000);
    expect(t.activity(6000)).toEqual({ type: "activity", at: 6000 });
  });
  it("ignores malformed messages from other tabs", () => {
    const t = new IdleTracker(5 * MIN, 0);
    for (const raw of [null, "lock", { type: "lock" }, { type: "unlock", at: 1 }, { type: "activity", at: Number.NaN }]) expect(t.receive(raw)).toBe(false);
    expect(t.locked).toBe(false);
    expect(parseIdleMessage({ type: "activity", at: 5 })).toEqual({ type: "activity", at: 5 });
  });
  it("unlocking restarts the clock", () => {
    const t = new IdleTracker(5 * MIN, 0);
    t.check(5 * MIN);
    t.unlock(10 * MIN);
    expect(t.locked).toBe(false);
    expect(t.check(14 * MIN)).toBeNull();
  });
});

describe("PIN and step-up (Decision 30)", () => {
  it("the PIN may reopen the app but never satisfies step-up", () => {
    expect(canReopenApp("pin")).toBe(true);
    expect(satisfiesStepUp("pin")).toBe(false);
    expect(satisfiesStepUp("passkey")).toBe(true);
    expect(satisfiesStepUp("password")).toBe(true);
    expect(STEP_UP_PREFIX).toBe("STEP_UP_REQUIRED");
  });
});

describe("fresh start (shouldLockOnStart)", () => {
  const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
  const phone = PHONE_IDLE_MS, desktop = DESKTOP_IDLE_MS;
  it("does not lock a fresh sign-in with no activity record", () => {
    expect(shouldLockOnStart({ now: NOW, lastActivity: null, lastSignInAt: new Date(NOW - 1 * MIN).toISOString(), limitMs: phone })).toBe(false);
  });
  it("locks when the last activity is older than the limit", () => {
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW - 6 * MIN, lastSignInAt: null, limitMs: phone })).toBe(true);
    // Recent activity wins over an old sign-in.
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW - 2 * MIN, lastSignInAt: NOW - 30 * 24 * 60 * MIN, limitMs: phone })).toBe(false);
  });
  it("locks with no activity record and an old sign-in (e.g. storage cleared on an old session)", () => {
    expect(shouldLockOnStart({ now: NOW, lastActivity: null, lastSignInAt: new Date(NOW - 3 * 60 * MIN).toISOString(), limitMs: desktop })).toBe(true);
  });
  it("locks when there is no trustworthy evidence at all", () => {
    expect(shouldLockOnStart({ now: NOW, lastActivity: null, lastSignInAt: null, limitMs: desktop })).toBe(true);
    expect(shouldLockOnStart({ now: NOW, lastActivity: null, lastSignInAt: "not a date", limitMs: desktop })).toBe(true);
  });
  it("ignores a future activity time, so tampering can't extend the session", () => {
    expect(validActivity(String(NOW + 1), NOW)).toBeNull();
    expect(validActivity("12abc", NOW)).toBeNull();
    expect(validActivity(String(NOW - 5), NOW)).toBe(NOW - 5);
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW + 365 * 24 * 60 * MIN, lastSignInAt: NOW - 60 * MIN, limitMs: desktop })).toBe(true);
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW + 1, lastSignInAt: null, limitMs: desktop })).toBe(true);
  });
  it("tolerates small server clock drift on the sign-in time but not a far-future one", () => {
    expect(shouldLockOnStart({ now: NOW, lastActivity: null, lastSignInAt: NOW + 30_000, limitMs: phone })).toBe(false);
    expect(lastKnownActivity({ now: NOW, lastActivity: null, lastSignInAt: NOW + 30_000 })).toBe(NOW);
    expect(shouldLockOnStart({ now: NOW, lastActivity: null, lastSignInAt: NOW + 60 * MIN, limitMs: phone })).toBe(true);
  });
  it("uses the phone 5-minute and desktop 15-minute boundaries", () => {
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW - 5 * MIN + 1, lastSignInAt: null, limitMs: phone })).toBe(false);
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW - 5 * MIN, lastSignInAt: null, limitMs: phone })).toBe(true);
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW - 14 * MIN, lastSignInAt: null, limitMs: desktop })).toBe(false);
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW - 15 * MIN + 1, lastSignInAt: null, limitMs: desktop })).toBe(false);
    expect(shouldLockOnStart({ now: NOW, lastActivity: NOW - 15 * MIN, lastSignInAt: null, limitMs: desktop })).toBe(true);
  });
  it("keeps activity records owner-scoped in the ll- namespace", () => {
    expect(activityKey("a")).toBe("ll-activity-a");
    expect(activityKey("a")).not.toBe(activityKey("b"));
  });
});

describe("unlock choices", () => {
  const base: UnlockFacts = { isAnonymous: false, hasPassword: false, hasPasskey: false, hasMpin: false, email: "kk@example.test" };
  it("a Google-only account gets an email code, not a password", () => {
    expect(unlockMethodsFor(base)).toEqual(["email-code"]);
    expect(unlockMethodsFor({ ...base, hasPasskey: true, hasMpin: true })).toEqual(["passkey", "pin", "email-code"]);
  });
  it("a password account gets its password (and the email code fallback)", () => {
    expect(unlockMethodsFor({ ...base, hasPassword: true })).toEqual(["password", "email-code"]);
  });
  it("a guest gets only the device methods it set up", () => {
    const g = { ...base, isAnonymous: true, email: null, hasPassword: true };
    expect(unlockMethodsFor(g)).toEqual([]);
    expect(unlockMethodsFor({ ...g, hasMpin: true })).toEqual(["pin"]);
    expect(unlockMethodsFor({ ...g, hasPasskey: true })).toEqual(["passkey"]);
  });
  it("the PIN is never listed as a step-up method or as a full method after five wrong tries", () => {
    const all = { ...base, hasPassword: true, hasPasskey: true, hasMpin: true };
    expect(stepUpMethodsFor(all)).toEqual(["passkey", "password"]);
    expect(stepUpMethodsFor(all)).not.toContain("pin");
    expect(fullUnlockMethods(all)).toEqual(["passkey", "password", "email-code"]);
    expect(satisfiesStepUp("email-code")).toBe(false);
    expect(canReopenApp("email-code")).toBe(true);
  });
  it("a guest without MPIN or Face ID ends the session; with either it locks; accounts always lock", () => {
    expect(guestIdleOutcome({ isAnonymous: true, hasMpin: false, hasPasskey: false })).toBe("end-session");
    expect(guestIdleOutcome({ isAnonymous: true, hasMpin: true, hasPasskey: false })).toBe("lock");
    expect(guestIdleOutcome({ isAnonymous: true, hasMpin: false, hasPasskey: true })).toBe("lock");
    expect(guestIdleOutcome({ isAnonymous: false, hasMpin: false, hasPasskey: false })).toBe("lock");
  });
  it("reads providers from identities and app metadata", () => {
    expect(accountProviders({ identities: [{ provider: "google" }], app_metadata: { provider: "google", providers: ["google"] } })).toEqual(["google"]);
    expect(accountProviders({ identities: [], app_metadata: { providers: ["email", "google"] } }).sort()).toEqual(["email", "google"]);
    expect(accountProviders(null)).toEqual([]);
  });
  it("limits email code requests to one a minute", () => {
    expect(codeResendWaitMs(null, 1_000_000)).toBe(0);
    expect(codeResendWaitMs(1_000_000, 1_000_000 + 20_000)).toBe(40_000);
    expect(codeResendWaitMs(1_000_000, 1_000_000 + EMAIL_CODE_RESEND_MS)).toBe(0);
    expect(codeResendWaitMs(2_000_000, 1_000_000)).toBe(EMAIL_CODE_RESEND_MS);
  });
  it("masks the email on the lock screen", () => {
    expect(maskEmail("kk@example.test")).toBe("k••@example.test");
    expect(maskEmail("a.very.long.name@example.test")).toBe("a••••••@example.test");
  });
});
