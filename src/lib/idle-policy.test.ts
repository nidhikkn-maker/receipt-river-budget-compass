import { describe, expect, it } from "vitest";
import { DESKTOP_IDLE_MS, IdleTracker, PHONE_IDLE_MS, canReopenApp, idleExpired, idleLimitMs, parseIdleMessage, readViewport, satisfiesStepUp } from "./idle-policy";
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
