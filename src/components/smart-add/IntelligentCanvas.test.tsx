// Intelligent Canvas: 1 Add → 2 Review → 3 Confirm, and nothing is saved until Confirm. The existing review
// screens are replaced by stand-ins that call a save spy exactly where the real review would save.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";

const local = vi.hoisted(() => ({ save: vi.fn(), statement: vi.fn(), store: {} as Record<string, unknown> }));
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
  NewExpense: ({ embedded }: { embedded: { search: { mode?: string; trip?: string }; files?: File[]; onExit: (s?: { id?: string; label: string }) => void } }) => (
    <form aria-label="Review scanned details" onSubmit={(e) => { e.preventDefault(); local.save(embedded.search); embedded.onExit({ id: "e1", label: "Expense · Blue Tokai" }); }}>
      <p>Mode {embedded.search.mode ?? "none"} · {embedded.files?.length ?? 0} file(s){embedded.search.trip ? ` · trip ${embedded.search.trip}` : ""}</p>
      <label htmlFor="m">Merchant</label><input id="m" defaultValue="Blue Tokai Coffee Roasters" />
      <label htmlFor="a">Amount</label><input id="a" defaultValue="460" />
      <label htmlFor="d">Date</label><input id="d" defaultValue="2026-11-09" />
      <button type="button" aria-label="Account">Amex Platinum Travel</button>
      <button type="submit">Save expense</button>
    </form>
  ),
}));
vi.mock("@/routes/_authenticated/statements", () => ({
  StatementDeskPage: ({ embedded }: { embedded: { files: File[]; context?: string } }) => { local.statement(embedded); return <p>Statement Desk with {embedded.files.length} file(s) · {embedded.context ?? "no context"}</p>; },
}));

import { IntelligentCanvas } from "./IntelligentCanvas";
import { canvasRoute, readReviewForm, stepOf } from "./canvas-model";
import { SMART_ADD_EVENT } from "@/lib/smart-add-event";

const photo = () => new File(["x"], "blue-tokai.png", { type: "image/png" });
const sheet = () => new File(["a,b"], "hdfc-oct.csv", { type: "text/csv" });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText("Choose files"), { target: { files } });
const current = () => screen.getByRole("list", { name: "Steps" }).querySelector('[aria-current="step"]')?.textContent;

beforeEach(() => {
  local.save.mockReset(); local.statement.mockReset();
  local.store = { preferences: { ...defaultPreferences(), trips: [{ id: "trip-1", name: "Mumbai visit", destination: "Mumbai", start: "2026-01-01", end: "2999-12-31", budget: 0, currencies: ["INR"] }] } };
});
afterEach(cleanup);

describe("Intelligent Canvas steps", () => {
  it("1 · Add offers Receipt, Statement, Travel and Asset register; Continue waits for a source", () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Add anything. Effortlessly." })).toBeInTheDocument();
    expect(current()).toBe("1 · Add");
    expect(within(screen.getByRole("radiogroup", { name: "What are you adding?" })).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Receipt", "Statement", "Travel", "Asset register"]);
    expect(screen.getByRole("radio", { name: "Receipt" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Continue to review/ })).toBeDisabled();
    pick([photo()]);
    expect(screen.getByRole("list", { name: "Chosen files" })).toHaveTextContent("blue-tokai.png");
    expect(screen.getByRole("button", { name: /Continue to review/ })).toBeEnabled();
  });

  it("a receipt is never saved by the review's Save: it opens 3 · Confirm, and only Confirm saves (once)", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    pick([photo()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    expect(await screen.findByText(/Mode scan · 1 file/)).toBeInTheDocument();
    expect(current()).toBe("2 · Review");
    expect(screen.getByRole("region", { name: "Your original" })).toHaveTextContent("Preview of blue-tokai.png");

    fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
    expect(local.save).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Ready for confirmation." })).toBeInTheDocument();
    expect(current()).toBe("3 · Confirm");
    expect(screen.getByText(/Nothing is entered into the books without confirmation/)).toBeInTheDocument();
    expect(screen.getByText("Not posted yet")).toBeInTheDocument();
    expect(within(document.querySelector(".sf-canvas-confirm") as HTMLElement).getByText("Amex Platinum Travel")).toBeInTheDocument();
    expect(screen.getByText(/Blue Tokai Coffee Roasters/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Change/ }));
    expect(current()).toBe("2 · Review");
    expect(local.save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save expense" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm and save/ }));
    await waitFor(() => expect(local.save).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Saved to your records." })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Expense · Blue Tokai");
  });

  it("pressing Enter in a field is held the same way", () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    pick([photo()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    return screen.findByLabelText("Merchant").then((input) => {
      fireEvent.submit(input.closest("form")!);
      expect(local.save).not.toHaveBeenCalled();
      expect(current()).toBe("3 · Confirm");
    });
  });

  it("statements and asset registers go to Statement Desk, the authoritative intake", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Statement" }));
    pick([sheet()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    expect(await screen.findByText("Statement Desk with 1 file(s) · no context")).toBeInTheDocument();
    expect(current()).toBe("2 · Review");
    fireEvent.click(screen.getByRole("button", { name: /Start over/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Asset register" }));
    pick([photo()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    expect(await screen.findByText("Statement Desk with 1 file(s) · assets")).toBeInTheDocument();
    expect(local.save).not.toHaveBeenCalled();
  });

  it("a spreadsheet picked as a receipt still goes to Statement Desk", () => {
    expect(canvasRoute("receipt", [sheet()])).toBe("statement");
    expect(canvasRoute("travel", [photo()])).toBe("receipt");
    expect(canvasRoute("asset", [photo()])).toBe("statement");
  });

  it("travel receipts are tagged to the current trip; voice opens the existing voice entry", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Travel" }));
    expect(screen.getByText(/Linked to “Mumbai visit”/)).toBeInTheDocument();
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

  it("iPhone: the source/data toggle switches between details and the original", async () => {
    render(<IntelligentCanvas open onOpenChange={() => {}} />);
    pick([photo()]);
    fireEvent.click(screen.getByRole("button", { name: /Continue to review/ }));
    await screen.findByText(/Mode scan/);
    const split = document.querySelector(".sf-canvas-split")!;
    expect(split).toHaveAttribute("data-view", "details");
    fireEvent.click(screen.getByRole("tab", { name: "Original" }));
    expect(split).toHaveAttribute("data-view", "original");
    expect(screen.getByRole("tab", { name: "Original" })).toHaveAttribute("aria-selected", "true");
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

describe("canvas rules", () => {
  it("step numbers", () => {
    expect(stepOf("add", false)).toBe(1);
    expect(stepOf("receipt", false)).toBe(2);
    expect(stepOf("receipt", true)).toBe(3);
    expect(stepOf("done", false)).toBe(3);
  });
  it("the confirmation summary reads the review form without changing it", () => {
    const form = document.createElement("form");
    form.innerHTML = '<input id="m" value="Swiggy"><input id="a" value="742"><input id="d" value="2026-11-09"><button aria-label="Category">Food</button><button aria-label="Account">HDFC Savings</button>';
    const s = readReviewForm(form, [photo()]);
    expect(s.account).toBe("HDFC Savings");
    expect(s.original).toBe("blue-tokai.png");
    expect(s.headline).toContain("Swiggy");
    expect(s.rows).toEqual([{ label: "Amount", value: "INR 742" }, { label: "Date", value: "2026-11-09" }, { label: "Category", value: "Food" }]);
    expect((form.querySelector("#a") as HTMLInputElement).value).toBe("742");
    expect(readReviewForm(null, []).original).toBe("Typed or spoken entry");
  });
});
