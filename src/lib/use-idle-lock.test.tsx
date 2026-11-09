import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readLastActivity, recordActivity, useIdleLock } from "./use-idle-lock";
import { activityKey } from "./idle-policy";

function Probe({ onLock, locked = false, owner = "owner" }: { onLock: () => void; locked?: boolean; owner?: string }) {
  useIdleLock({ ownerId: owner, enabled: true, locked, onLock });
  return null;
}
const MIN = 60_000;
const setPointer = (coarse: boolean, width: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.matchMedia = ((q: string) => ({ matches: coarse && q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("locks a phone after 5 minutes without input, even while visible", () => {
  setPointer(true, 390);
  const onLock = vi.fn();
  render(<Probe onLock={onLock} />);
  act(() => { vi.advanceTimersByTime(4 * MIN); });
  expect(onLock).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(MIN + 15_000); });
  expect(onLock).toHaveBeenCalledTimes(1);
});

it("input postpones the desktop 15-minute lock", () => {
  setPointer(false, 1440);
  const onLock = vi.fn();
  render(<Probe onLock={onLock} />);
  act(() => { vi.advanceTimersByTime(10 * MIN); window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); });
  act(() => { vi.advanceTimersByTime(10 * MIN); });
  expect(onLock).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(6 * MIN); });
  expect(onLock).toHaveBeenCalledTimes(1);
});

it("does nothing while already locked", () => {
  setPointer(true, 390);
  const onLock = vi.fn();
  render(<Probe onLock={onLock} locked />);
  act(() => { vi.advanceTimersByTime(30 * MIN); });
  expect(onLock).not.toHaveBeenCalled();
});

it("saves input times per owner so a fresh start can tell how long the app was away", () => {
  setPointer(false, 1440);
  vi.setSystemTime(10 * MIN);
  render(<Probe onLock={() => {}} />);
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); });
  expect(localStorage.getItem(activityKey("owner"))).toBe(String(10 * MIN));
  expect(localStorage.getItem(activityKey("other"))).toBeNull();
});

it("counts from the saved activity of an earlier visit, not from when the screen opened", () => {
  setPointer(true, 390);
  vi.setSystemTime(10 * MIN);
  localStorage.setItem(activityKey("owner"), String(7 * MIN));
  const onLock = vi.fn();
  render(<Probe onLock={onLock} />);
  // Phone limit 5 minutes from 7:00 is 12:00, not 15:00 (5 minutes after the screen opened).
  act(() => { vi.advanceTimersByTime(MIN + 45_000); });
  expect(onLock).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(30_000); });
  expect(onLock).toHaveBeenCalledTimes(1);
});

it("ignores a saved activity time in the future", () => {
  vi.setSystemTime(10 * MIN);
  localStorage.setItem(activityKey("owner"), String(99 * MIN));
  expect(readLastActivity("owner")).toBeNull();
  // A tampered future value is replaced by real input, never kept.
  recordActivity("owner", 10 * MIN);
  expect(readLastActivity("owner")).toBe(10 * MIN);
  recordActivity("owner", 5 * MIN);
  expect(readLastActivity("owner")).toBe(10 * MIN);
});

it("tolerates blocked storage", () => {
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(readLastActivity("owner")).toBeNull();
  expect(() => recordActivity("owner", 1)).not.toThrow();
  spy.mockRestore();
});
