// Intelligent Canvas: 1 Add → 2 Review → 3 Confirm. Nothing is saved until Confirm, an unconfirmed account blocks
// Confirm, and no navigation shortcut can save twice or save unreviewed values. The existing review screen is
// replaced by a stand-in that saves exactly where the real review does (its form submit), with the same
// single-flight rule and one draft id reused on retry.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";

type Embedded = { search: { mode?: string; trip?: string }; files?: File[]; submitLabel?: string; onExit: (s?: { id?: string; label: string }) => void };
const local = vi.hoisted(() => ({
  save: vi.fn(), statement: vi.fn(), store: {} as Record<string, unknown>,
  account: "none" as string, accountConfirmed: false, gate: null as null | Promise<void>, fail: false, draftId: "draft-1",
}));
vi.mock("@/lib/store", () => ({ useStore: () => local.store }));
vi.mock("@tanstack/react-router", async () => {
  const { MockLink } = await import("@/components/shell/test-router-mock");
  return { Link: MockLink };
});
vi.mock("@/components/SmartAdd", () => ({ SMART_ADD_ACCEPT: "image/*,application/pdf,.csv,.xls,.xlsx" }));
vi.mock("@/components/SourcePreview", () => ({
  SourcePreview: ({ file }: { file: File }) => <p>Preview of {file.name}</p>,
  sourceKind: (f: File) => (/\.(csv|xlsx?)$/i.test(f.name) ? "sheet" : f.type === "application/pdf" ? "pdf" : f.type.startsWith("image/") ? "image" : "other"),
}));
vi.mock("@/components/ReceiptAssetHandoff", () => ({ ReceiptAssetHandoff: () => null }));
vi.mock("@/components/ExpenditureReportBuilder", () => ({ ExpenditureReportBuilder: () => null }));
vi.mock("@/routes/_authenticated/new", () => ({
  NewExpense: function FakeReview({ embedded }: { embedded: Embedded }) {
    const [account, setAccount] = useState(local.account);
    const [confirmed, setConfirmed] = useState(local.accountConfirmed);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (saving) return; // the real review's single-flight rule
      setSaving(true); setError("");
      const f = e.currentTarget;
      local.save({ merchant: (f.querySelector("#m") as HTMLInputElement).value, account, draftId: local.draftId, mode: embedded.search.mode });
      try {
        if (local.gate) await local.gate;
        if (local.fail) throw new Error("timeout");
        embedded.onExit({ id: local.draftId, label: "Expense · Blue Tokai" });
      } catch { setError("We couldn't confirm the save. Tap Retry; it won't create a second entry."); } finally { setSaving(false); }
    };
    const state = account === "none" ? "unselected" : confirmed ? "confirmed" : "suggested";
    return (
      <form aria-label="Review scanned details" data-account-state={state} data-account-evidence={account === "amex" && !confirmed ? "Card ending 1006 printed on the bill matches Amex Platinum Travel" : ""} onSubmit={submit}>
        <p>Mode {embedded.search.mode ?? "none"} · {embedded.files?.length ?? 0} file(s){embedded.search.trip ? ` · trip ${embedded.search.trip}` : ""}</p>
        <label htmlFor="m">Merchant</label><input id="m" defaultValue="Blue Tokai Coffee Roasters" />
        <label htmlFor="a">Amount</label><input id="a" defaultValue="460" />
        <label htmlFor="d">Date</label><input id="d" defaultValue="2026-11-09" />
        <button type="button" aria-label="Account">{account === "amex" ? "Amex Platinum Travel" : "Choose account"}</button>
        <button type="button" onClick={() => { setAccount("amex"); setConfirmed(true); }}>Pick Amex</button>
        {account !== "none" && !confirmed && <button type="button" onClick={() => setConfirmed(true)}>Confirm this account</button>}
        {error && <p role="alert">{error}</p>}
        <button type="submit" aria-busy={saving || undefined} disabled={saving}>{embedded.submitLabel ?? "Save expense"}</button>
      </form>
    );
  },
}));
vi.mock("@/routes/_authenticated/statements", () => ({
  StatementDeskPage: ({ embedded }: { embedded: { files: File[]; context?: string } }) => { local.statement(embedded); return <p>Statement Desk with {embedded.files.length} file(s) · {embedded.context ?? "no context"}</p>; },
}));

import { IntelligentCanvas } from "./IntelligentCanvas";
import { canConfirm, canvasRoute, keyboardInset, kindHint, readReviewForm, stepOf } from "./canvas-model";
import { SMART_ADD_EVENT } from "@/lib/smart-add-event";

const photo = (name = "blue-tokai.png") => new File(["x"], name, { type: "image/png" });
const sheet = () => new File(["a,b"], "hdfc-oct.csv", { type: "text/csv" });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText("Choose files"), { target: { files } });
const current = () => screen.getByRole("list", { name: "Steps" }).querySelector('[aria-current="step"]')?.textContent;
const footerContinue = () => document.querySelector(".sf-canvas-foot .sf-btn-deep") as HTMLButtonElement;
const confirmButton = () => screen.getByRole("button", { name: /Confirm and save/ }) as HTMLButtonElement;
const open = async (files: File[] = [photo()]) => {
  pick(files);
  fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
  await screen.findByText(/Mode scan/);
};
const toConfirmedStep3 = async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Pick Amex" }));
  await waitFor(() => expect(footerContinue()).toBeEnabled());
  fireEvent.click(footerContinue());
  expect(current()).toBe("3 · Confirm");
  expect(confirmButton()).toBeEnabled();
};

beforeEach(() => {
  local.save.mockReset(); local.statement.mockReset();
  Object.assign(local, { account: "none", accountConfirmed: false, gate: null, fail: false, draftId: "draft-1" });
  local.store = { preferences: { ...defaultPreferences(), trips: [{ id: "trip-1", name: "Mumbai visit", destination: "Mumbai", start: "2026-01-01", end: "2999-12-31", budget: 0, currencies: ["INR"] }] } };
});
afterEach(cleanup);

describe("Intelligent Canvas steps", () => {
  it("1 · Add offers Receipt, Statement, Travel and Asset register; Continue waits for a source", () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Add anything. Effortlessly." })).toBeInTheDocument();
    expect(current()).toBe("1 · Add");
    expect(within(screen.getByRole("radiogroup", { name: "What are you adding?" })).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Receipt", "Statement", "Travel", "Asset register"]);
    expect(screen.getByRole("button", { name: /Continue to review/ })).toBeDisabled();
    pick([photo()]);
    expect(screen.getByRole("list", { name: "Chosen files" })).toHaveTextContent("blue-tokai.png");
    expect(screen.getByRole("button", { name: /Continue to review/ })).toBeEnabled();
  });

  it("2 · Review: the review's own button reads “Continue to confirmation” and a persistent footer action does the same", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await open();
    expect(current()).toBe("2 · Review");
    expect(screen.getByLabelText("Merchant").closest("form")!.querySelector('button[type="submit"]')).toHaveTextContent("Continue to confirmation");
    expect(screen.queryByText(/Use the review's Save button/)).toBeNull();
    expect(footerContinue()).toHaveTextContent("Continue to confirmation");
    fireEvent.click(footerContinue());
    expect(current()).toBe("3 · Confirm");
    expect(local.save).not.toHaveBeenCalled();
  });

  it("3 · Confirm is blocked while the account is unselected; choosing it enables Confirm, which saves once with the reviewed values", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await open();
    fireEvent.click(footerContinue());
    expect(screen.getByRole("alert")).toHaveTextContent("Account needs confirmation.");
    expect(screen.getByText("Not chosen")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(local.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Choose the account" }));
    expect(current()).toBe("2 · Review");
    fireEvent.click(screen.getByRole("button", { name: "Pick Amex" }));
    fireEvent.change(screen.getByLabelText("Merchant"), { target: { value: "Blue Tokai Indiranagar" } });
    fireEvent.click(footerContinue());
    expect(confirmButton()).toBeEnabled();
    expect(screen.getByText(/09 Nov 2026/, { selector: "small" })).toBeInTheDocument();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(local.save).toHaveBeenCalledTimes(1));
    expect(local.save).toHaveBeenCalledWith(expect.objectContaining({ merchant: "Blue Tokai Indiranagar", account: "amex" }));
    expect(await screen.findByRole("dialog", { name: "Saved to your records." })).toBeInTheDocument();
  });

  it("a suggested account is never shown as confirmed and blocks Confirm until the owner confirms it", async () => {
    local.account = "amex"; local.accountConfirmed = false;
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await open();
    fireEvent.click(footerContinue());
    const account = screen.getByText("Account").closest("div")!;
    expect(account).toHaveTextContent("Amex Platinum Travel · needs confirmation");
    expect(account).toHaveTextContent("From: Card ending 1006 printed on the bill matches Amex Platinum Travel");
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Choose the account" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm this account" }));
    fireEvent.click(footerContinue());
    expect(confirmButton()).toBeEnabled();
    expect(screen.getByText("Account").closest("div")).not.toHaveTextContent("needs confirmation");
  });

  it("statements and asset registers go to Statement Desk, the authoritative intake", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Statement" }));
    pick([sheet()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    expect(await screen.findByText("Statement Desk with 1 file(s) · no context")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Start over/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Asset register" }));
    pick([photo()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    expect(await screen.findByText("Statement Desk with 1 file(s) · assets")).toBeInTheDocument();
    expect(local.save).not.toHaveBeenCalled();
  });

  it("travel receipts are tagged to the current trip; voice opens the existing voice entry", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Travel" }));
    pick([photo()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    expect(await screen.findByText(/trip trip-1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Start over/ }));
    fireEvent.click(screen.getByRole("button", { name: /Describe it by voice/ }));
    expect(await screen.findByText(/Mode voice · 0 file/)).toBeInTheDocument();
  });

  it("another screen's purpose preselects the intake (Assets → Asset register)", () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    fireEvent(window, new CustomEvent(SMART_ADD_EVENT, { detail: { intent: "assets" } }));
    expect(screen.getByRole("radio", { name: "Asset register" })).toHaveAttribute("aria-checked", "true");
  });

  it("Escape closes and focus returns to the opener", () => {
    const close = vi.fn();
    const opener = document.createElement("button"); document.body.appendChild(opener); opener.focus();
    const view = render(<IntelligentCanvas open onOpenChange={close} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledWith(false);
    view.rerender(<IntelligentCanvas open={false} onOpenChange={close} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("Original and Details tabs (iPhone)", () => {
  it("switching tabs keeps edits and the selected document, without remounting the review or saving", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await open([photo("page-1.png"), photo("page-2.png")]);
    const merchant = screen.getByLabelText("Merchant") as HTMLInputElement;
    fireEvent.change(merchant, { target: { value: "Edited merchant" } });
    fireEvent.click(screen.getByRole("tab", { name: "Original" }));
    expect(screen.getByRole("tab", { name: "Original" })).toHaveAttribute("aria-controls", "sf-canvas-original");
    fireEvent.click(screen.getByRole("button", { name: /2\. page-2/ }));
    expect(screen.getByText("Preview of page-2.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    fireEvent.click(screen.getByRole("tab", { name: "Original" }));
    expect(screen.getByText("Preview of page-2.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByLabelText("Merchant")).toBe(merchant);
    expect(merchant.value).toBe("Edited merchant");
    expect(local.save).not.toHaveBeenCalled();
  });
});

describe("navigation shortcuts never save, or save twice", () => {
  it("Enter key in a field opens confirmation instead of saving", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await open();
    fireEvent.submit(screen.getByLabelText("Merchant").closest("form")!);
    expect(current()).toBe("3 · Confirm");
    expect(local.save).not.toHaveBeenCalled();
  });

  it("double-tap on Confirm and save saves once", async () => {
    let release = () => {};
    local.gate = new Promise<void>((r) => { release = r; });
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await toConfirmedStep3();
    const button = confirmButton();
    fireEvent.click(button); fireEvent.click(button); fireEvent.doubleClick(button);
    await act(async () => { release(); });
    await waitFor(() => expect(local.save).toHaveBeenCalledTimes(1));
  });

  it("browser Back/Forward at confirmation returns to review without saving", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await toConfirmedStep3();
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(current()).toBe("2 · Review");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(local.save).not.toHaveBeenCalled();
  });

  it("closing and reopening the sheet requires confirming again and saves nothing", async () => {
    const view = render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await toConfirmedStep3();
    view.rerender(<IntelligentCanvas open={false} onOpenChange={() => {}} />);
    view.rerender(<IntelligentCanvas open onOpenChange={() => {}} />);
    expect(current()).toBe("2 · Review");
    expect(screen.getByLabelText("Merchant")).toHaveValue("Blue Tokai Coffee Roasters");
    expect(local.save).not.toHaveBeenCalled();
  });

  it("switching browser tabs (visibility change) saves nothing", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await toConfirmedStep3();
    act(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); });
    expect(current()).toBe("3 · Confirm");
    expect(local.save).not.toHaveBeenCalled();
  });

  it("re-submitting during a slow save (Enter, footer, Confirm) does nothing; a retry after a failure re-confirms and reuses the same draft id", async () => {
    let release = () => {};
    local.gate = new Promise<void>((r) => { release = r; });
    local.fail = true;
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await toConfirmedStep3();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(local.save).toHaveBeenCalledTimes(1));
    const form = screen.getByLabelText("Merchant").closest("form")!;
    fireEvent.submit(form);
    fireEvent.click(footerContinue());
    expect(footerContinue()).toBeDisabled();
    expect(local.save).toHaveBeenCalledTimes(1);
    expect(current()).toBe("2 · Review");
    await act(async () => { release(); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Tap Retry");
    local.fail = false; local.gate = null;
    await waitFor(() => expect(footerContinue()).toBeEnabled());
    fireEvent.click(footerContinue());
    expect(current()).toBe("3 · Confirm");
    expect(local.save).toHaveBeenCalledTimes(1);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(local.save).toHaveBeenCalledTimes(2));
    expect(local.save.mock.calls.map((c) => (c[0] as { draftId: string }).draftId)).toEqual(["draft-1", "draft-1"]);
    expect(await screen.findByRole("dialog", { name: "Saved to your records." })).toBeInTheDocument();
  });
});

describe("canvas rules", () => {
  it("step numbers", () => {
    expect(stepOf("add", false)).toBe(1);
    expect(stepOf("receipt", false)).toBe(2);
    expect(stepOf("receipt", true)).toBe(3);
    expect(stepOf("done", false)).toBe(3);
  });
  it("routes: spreadsheets always go to Statement Desk", () => {
    expect(canvasRoute("receipt", [sheet()])).toBe("statement");
    expect(canvasRoute("travel", [photo()])).toBe("receipt");
    expect(canvasRoute("asset", [photo()])).toBe("statement");
  });
  it("the summary reads the review form without changing it, with an unambiguous date and the account state", () => {
    const form = document.createElement("form");
    form.setAttribute("data-account-state", "suggested");
    form.setAttribute("data-account-evidence", "Card ending 4821 printed on the bill matches HDFC Savings");
    form.innerHTML = '<input id="m" value="Swiggy"><input id="a" value="742"><input id="d" value="2026-11-09"><button aria-label="Category">Food</button><button aria-label="Account">HDFC Savings</button>';
    const s = readReviewForm(form, [photo()]);
    expect(s.account).toBe("HDFC Savings");
    expect(s.accountState).toBe("suggested");
    expect(s.accountEvidence).toContain("4821");
    expect(canConfirm(s)).toBe(false);
    expect(s.rows).toEqual([{ label: "Amount", value: "INR 742" }, { label: "Date", value: "09 Nov 2026" }, { label: "Category", value: "Food" }]);
    expect((form.querySelector("#a") as HTMLInputElement).value).toBe("742");
    form.setAttribute("data-account-state", "unselected");
    expect(readReviewForm(form, []).account).toBeNull();
    form.setAttribute("data-account-state", "confirmed");
    expect(canConfirm(readReviewForm(form, []))).toBe(true);
    expect(readReviewForm(null, []).original).toBe("Typed or spoken entry");
  });
});

// KK decision 5: the desktop review is the narrow canvas (reference 09); the original opens side by side only when
// the owner asks, and only on wide screens. Decision 8: one short guidance line per state.
const setWide = (wide: boolean) => {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: (query: string) => ({ matches: wide && query === "(min-width: 1100px)", media: query, addEventListener: () => {}, removeEventListener: () => {} }) });
};
describe("narrow review with an optional side-by-side original (wide screens)", () => {
  afterEach(() => { Reflect.deleteProperty(window, "matchMedia"); });

  it("opens narrow with Details/Original tabs; side by side widens it and keeps edits; one column narrows it again", async () => {
    setWide(true);
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await open();
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveClass("sf-canvas-wide");
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    const merchant = screen.getByLabelText("Merchant") as HTMLInputElement;
    fireEvent.change(merchant, { target: { value: "Edited before widening" } });
    fireEvent.click(screen.getByRole("button", { name: "Original side by side" }));
    expect(dialog).toHaveClass("sf-canvas-wide");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(dialog.querySelector(".sf-canvas-split")).toHaveAttribute("data-side", "true");
    expect(screen.getByText("Preview of blue-tokai.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Merchant")).toBe(merchant);
    expect(merchant.value).toBe("Edited before widening");
    fireEvent.click(screen.getByRole("button", { name: "One column" }));
    expect(dialog).not.toHaveClass("sf-canvas-wide");
    expect(screen.getByRole("tab", { name: "Original" })).toBeInTheDocument();
    expect(merchant.value).toBe("Edited before widening");
    expect(local.save).not.toHaveBeenCalled();
  });

  it("offers no side-by-side view below the wide breakpoint, and Statement Desk keeps its wide comparison", async () => {
    setWide(false);
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    await open();
    expect(screen.queryByRole("button", { name: /side by side/ })).toBeNull();
    expect(screen.getByRole("dialog")).not.toHaveClass("sf-canvas-wide");
    fireEvent.click(screen.getByRole("button", { name: /Start over/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Statement" }));
    pick([sheet()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    await screen.findByText(/Statement Desk with 1 file/);
    expect(screen.getByRole("dialog")).toHaveClass("sf-canvas-wide");
  });

  it("keeps each state's guidance to one short line and keeps the reason Continue is unavailable", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    const ledes = () => [...document.querySelectorAll(".sf-canvas-lede, .sf-canvas-hint")].filter((e) => !e.closest("[hidden]")).map((e) => e.textContent ?? "");
    expect(ledes()).toEqual(["Give us a receipt, statement, travel booking or asset register. Your source remains visible for checking."]);
    fireEvent.click(screen.getByRole("radio", { name: "Travel" }));
    expect(ledes()[1]).toBe("Tagged to your trip “Mumbai visit”.");
    fireEvent.click(screen.getByRole("radio", { name: "Receipt" }));
    await open();
    expect(ledes()).toEqual(["Check the suggested account and classification before saving."]);
    for (const t of ledes()) expect(t.length).toBeLessThanOrEqual(110);
    // The reason Continue is unavailable stays, as one short line tied to the button.
    const source = readFileSync("src/components/smart-add/IntelligentCanvas.tsx", "utf8");
    expect(source).toMatch(/aria-describedby=\{!reviewReady \? "sf-continue-why" : undefined\}/);
    expect(source).toMatch(/id="sf-continue-why" className="sf-foot-note">Finish the checks in Details first \(e\.g\. “Looks right”\)\.</);
  });
});

describe("guidance and keyboard rules", () => {
  it("one hint per choice: none for a receipt, the trip for travel, the purpose for a statement", () => {
    expect(kindHint("receipt")).toBe("");
    expect(kindHint("statement")).toBe("Checked line by line in Statement Desk.");
    expect(kindHint("statement", "Assets")).toBe("Checked in Statement Desk for Assets.");
    expect(kindHint("travel", null, "Dubai")).toBe("Tagged to your trip “Dubai”.");
    expect(kindHint("travel")).toBe("No current trip, so it is saved as an ordinary expense.");
  });
  it("treats a covered bottom of 80 px or more as the keyboard, less as browser chrome", () => {
    expect(keyboardInset(852, 852, 0)).toBe(0);
    expect(keyboardInset(852, 800, 0)).toBe(0);
    expect(keyboardInset(852, 516, 0)).toBe(336);
    expect(keyboardInset(852, 516, 40)).toBe(296);
  });
});
