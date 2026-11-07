import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ owner: "owner-one", key: "calendar-entry" }));
vi.mock("./store", () => ({ useStore: () => ({ userId: state.owner }) }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: ({ select }: { select: (v: unknown) => unknown }) => select({ location: { pathname: "/plan", state: { __TSR_key: state.key } } }) }));
import { useReviewView } from "./use-review-view";
afterEach(cleanup);
describe("review view continuity", () => {
  it("restores calendar date and filters for the same history entry, not another owner", () => {
    const first = renderHook(() => useReviewView("selection-test", { date: "2026-11-01", month: "2026-11-01", filter: "all" }));
    act(() => first.result.current[1]({ date: "2026-11-03", month: "2026-11-01", filter: "business" }));
    first.unmount();
    const returning = renderHook(() => useReviewView("selection-test", { date: "", month: "", filter: "" }));
    expect(returning.result.current[0]).toEqual({ date: "2026-11-03", month: "2026-11-01", filter: "business" });
    returning.unmount(); state.owner = "owner-two";
    expect(renderHook(() => useReviewView("selection-test", "fresh")).result.current[0]).toBe("fresh");
    state.owner = "owner-one"; state.key = "another-entry";
    expect(renderHook(() => useReviewView("selection-test", "separate")).result.current[0]).toBe("separate");
  });
});