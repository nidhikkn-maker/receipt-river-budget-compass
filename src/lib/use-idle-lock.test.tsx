import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useIdleLock } from "./use-idle-lock";

function Probe({ onLock, locked = false, owner = "owner" }: { onLock: () => void; locked?: boolean; owner?: string }) {
  useIdleLock({ ownerId: owner, enabled: true, locked, onLock });
  return null;
}
const MIN = 60_000;
const setPointer = (coarse: boolean, width: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.matchMedia = ((q: string) => ({ matches: coarse && q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
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
