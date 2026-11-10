// P0-029 (UIX §16.4): app-wide lock state; notifications, the preview panel and open confirmations do not survive a lock.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { toast } from "sonner";
import { isolate, isAppLocked, setAppLocked, subscribeAppLocked } from "./app-lock-state";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmHost } from "@/components/ConfirmHost";
import { confirmAction } from "./confirm";
import { PreviewInfoPanel } from "@/components/PreviewInfoPanel";

afterEach(() => { act(() => setAppLocked(false)); cleanup(); });

describe("app lock state", () => {
  it("is shared app-wide and notifies subscribers", () => {
    const seen: boolean[] = [];
    const off = subscribeAppLocked(() => seen.push(isAppLocked()));
    setAppLocked(true); setAppLocked(true); setAppLocked(false);
    off();
    expect(seen).toEqual([true, false]);
  });
  it("isolate makes the rest of the page inert and hidden, including nodes added later, and restores it", async () => {
    const page = document.createElement("div"); page.setAttribute("aria-hidden", "false"); document.body.appendChild(page);
    const lock = document.createElement("div"); document.body.appendChild(lock);
    const undo = isolate(lock);
    expect(page).toHaveAttribute("inert"); expect(page).toHaveAttribute("aria-hidden", "true");
    expect(lock).not.toHaveAttribute("inert");
    const later = document.createElement("div"); document.body.appendChild(later);
    await waitFor(() => expect(later).toHaveAttribute("inert"));
    undo();
    expect(page).not.toHaveAttribute("inert"); expect(page).toHaveAttribute("aria-hidden", "false");
    expect(later).not.toHaveAttribute("aria-hidden");
    page.remove(); lock.remove(); later.remove();
  });
});

describe("nothing shows over or behind the lock", () => {
  it("the toaster renders nothing while locked, and returns after unlock", async () => {
    render(<Toaster />);
    act(() => { toast("Paid ₹25,000.00"); });
    expect(await screen.findByText("Paid ₹25,000.00")).toBeInTheDocument();
    act(() => { setAppLocked(true); toast.dismiss(); toast("Salary ₹2,45,000.00 received"); });
    expect(document.querySelector("[data-sonner-toaster]")).toBeNull();
    expect(screen.queryByText(/₹/)).toBeNull();
  });
  it("an open confirmation is answered no and closed when the app locks", async () => {
    render(<ConfirmHost />);
    let answer: boolean | undefined;
    act(() => { void confirmAction({ title: "Delete ₹460 entry?", message: "Blue Tokai" }).then((v: boolean) => { answer = v; }); });
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    act(() => setAppLocked(true));
    await waitFor(() => expect(answer).toBe(false));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("the preview panel is not rendered while locked", () => {
    const env = { VITE_PREVIEW_ENV: "preview", VITE_PREVIEW_COMMIT: "0aea59b", VITE_PREVIEW_BRANCH: "uix/signature-shell" };
    render(<PreviewInfoPanel env={env} />);
    expect(screen.getByRole("button", { name: /^Preview build/ })).toBeInTheDocument();
    act(() => setAppLocked(true));
    expect(screen.queryByRole("button", { name: /^Preview build/ })).toBeNull();
  });
});
