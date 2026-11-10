// P0-029: the 15-second background report poll issues no request while the app is locked.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (): unknown => new Proxy({}, { get: (_t, k) => k === "then" ? (ok: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(ok) : () => builder() });
  return { supabase: { from: () => { h.calls++; return builder(); }, rpc: async () => ({ data: null, error: null }) } };
});
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { BackgroundReports } from "./BackgroundReports";
import { setAppLocked } from "@/lib/app-lock-state";

afterEach(() => { setAppLocked(false); cleanup(); vi.useRealTimers(); h.calls = 0; });

it("polls while unlocked, skips every tick while locked, and resumes after unlock", async () => {
  vi.useFakeTimers();
  render(<BackgroundReports />);
  expect(h.calls).toBe(1);
  await act(async () => { vi.advanceTimersByTime(15000); });
  expect(h.calls).toBe(2);
  setAppLocked(true);
  await act(async () => { vi.advanceTimersByTime(60000); });
  expect(h.calls).toBe(2);
  setAppLocked(false);
  await act(async () => { vi.advanceTimersByTime(15000); });
  expect(h.calls).toBe(3);
});
