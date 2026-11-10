// B1d item 4: while Smart Add is open, notifications appear at the top (below the safe area), never over the sheet's
// sticky footer actions; elsewhere they keep the bottom-right default.
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { holdToastsClearOfFooter, toastPlacement, useToastPlacement } from "./toast-placement";
import { Toaster } from "@/components/ui/sonner";

vi.mock("@/lib/store", () => ({ useStore: () => ({ preferences: { trips: [] } }) }));
vi.mock("@/routes/_authenticated/new", () => ({ NewExpense: () => null }));
vi.mock("@/routes/_authenticated/statements", () => ({ StatementDeskPage: () => null }));
vi.mock("@/components/ExpenditureReportBuilder", () => ({ ExpenditureReportBuilder: () => null }));
vi.mock("@tanstack/react-router", async () => ({ Link: (await import("@/components/shell/test-router-mock")).MockLink }));
import { IntelligentCanvas } from "@/components/smart-add/IntelligentCanvas";

afterEach(() => { act(() => { toast.dismiss(); }); cleanup(); });
const list = () => document.querySelector("[data-sonner-toaster]");

describe("toast placement", () => {
  it("pure rule: just above the open sheet's footer (which includes the safe area), top when unmeasured, default otherwise", () => {
    expect(toastPlacement(0).position).toBe("bottom-right");
    expect(toastPlacement(1, 134)).toEqual({ position: "bottom-center", offset: { bottom: "142px" }, mobileOffset: { bottom: "142px" } });
    expect(toastPlacement(1)).toEqual({ position: "top-center", offset: { top: "calc(env(safe-area-inset-top, 0px) + 12px)" }, mobileOffset: { top: "calc(env(safe-area-inset-top, 0px) + 12px)" } });
    const hook = renderHook(() => useToastPlacement());
    let a = () => {}, b = () => {};
    act(() => { a = holdToastsClearOfFooter(); b = holdToastsClearOfFooter(); });
    expect(hook.result.current.position).toBe("top-center");
    act(() => { a(); a(); }); // releasing twice counts once: the other sheet still holds the top
    expect(hook.result.current.position).toBe("top-center");
    act(() => { b(); });
    expect(hook.result.current.position).toBe("bottom-right");
  });

  it("the app's Toaster sits clear of the footer while Smart Add is open and returns to its default when it closes", async () => {
    const view = render(<><Toaster /><IntelligentCanvas open onOpenChange={() => {}} /></>);
    await act(async () => { toast.success("Bill read — check the key details"); });
    // jsdom has no layout, so the footer measures at the viewport bottom edge: the toast is raised by the 8 px gap and
    // centred; real iPhone measurements are in docs/evidence/screens/2026-11-10-signature-shell-b1d.
    await waitFor(() => expect(list()).toHaveAttribute("data-x-position", "center"));
    expect(list()).toHaveAttribute("data-y-position", "bottom");
    expect((list() as HTMLElement).style.getPropertyValue("--mobile-offset-bottom")).toMatch(/^\d+px$/);
    view.rerender(<><Toaster /><IntelligentCanvas open={false} onOpenChange={() => {}} /></>);
    await act(async () => { toast.message("Elsewhere"); });
    await waitFor(() => expect(list()).toHaveAttribute("data-x-position", "right"));
  });
});
