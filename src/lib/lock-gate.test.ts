// P0-029: the lock gate used by the store and the page pollers.
import { describe, expect, it } from "vitest";
import { backgroundAllowed, createLockGate, STALE_LOCK_MS, whenUnlocked, type LockSource } from "./lock-gate";

function fakeLock() {
  let locked = false, t = 0;
  const ls = new Set<() => void>();
  const source: LockSource = { isLocked: () => locked, subscribe: (l) => { ls.add(l); return () => { ls.delete(l); }; }, now: () => t };
  return { source, set: (v: boolean) => { if (v === locked) return; locked = v; for (const l of [...ls]) l(); }, advance: (ms: number) => { t += ms; } };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("lock gate", () => {
  it("resumes once after a deferred request, never while locked", async () => {
    const f = fakeLock(); let resumed = 0;
    const g = createLockGate(() => { resumed++; }, f.source); g.attach();
    f.set(true); expect(g.paused()).toBe(true); g.defer(); g.defer();
    await tick(); expect(resumed).toBe(0);
    f.set(false); await tick(); expect(resumed).toBe(1);
    f.set(true); f.set(false); await tick(); expect(resumed).toBe(1);
  });
  it("a run interrupted by the lock is no longer live and makes the unlock resume", async () => {
    const f = fakeLock(); let resumed = 0;
    const g = createLockGate(() => { resumed++; }, f.source); g.attach();
    const run = g.begin(); expect(run.live()).toBe(true);
    f.set(true); expect(run.live()).toBe(false);
    f.set(false); expect(run.live()).toBe(false); run.end();
    await tick(); expect(resumed).toBe(1);
    expect(g.begin().live()).toBe(true);
  });
  it("a long lock resumes even with nothing deferred; a short one does not", async () => {
    const f = fakeLock(); let resumed = 0;
    const g = createLockGate(() => { resumed++; }, f.source); g.attach();
    f.set(true); f.advance(1000); f.set(false); await tick(); expect(resumed).toBe(0);
    f.set(true); f.advance(STALE_LOCK_MS); f.set(false); await tick(); expect(resumed).toBe(1);
  });
  it("attaching while locked counts as locked; detach stops following", async () => {
    const f = fakeLock(); let resumed = 0;
    f.set(true);
    const g = createLockGate(() => { resumed++; }, f.source); const off = g.attach();
    g.defer(); off(); f.set(false); await tick(); expect(resumed).toBe(0);
  });
  it("pollers skip ticks while locked and deferred work runs once after unlock", () => {
    const f = fakeLock(); let ran = 0;
    expect(backgroundAllowed(f.source)).toBe(true);
    whenUnlocked(() => ran++, f.source); expect(ran).toBe(1);
    f.set(true); expect(backgroundAllowed(f.source)).toBe(false);
    whenUnlocked(() => ran++, f.source); const cancel = whenUnlocked(() => { ran += 100; }, f.source); cancel();
    expect(ran).toBe(1); f.set(false); expect(ran).toBe(2); f.set(true); f.set(false); expect(ran).toBe(2);
  });
});
