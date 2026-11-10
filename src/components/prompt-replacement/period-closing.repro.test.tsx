// Regression (was the reproduction, see docs/evidence/screens/2026-11-10-prompt-replacement-2/repro/): period closing,
// reopening and audit notes use in-app dialogs, never a browser pop-up. Closing names the period or year, states what is
// locked and that only the Audit operation can reopen it, and needs the period/FY label typed. The change_accounting_period
// call is the same as before; Cancel and Escape send nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { emptyBooks } from "@/lib/books/types";
import { harness, reset } from "../records-archive/harness";
import { fake, resetFake } from "./fake-supabase";

vi.mock("@/lib/store", async () => ({ useStore: (await import("../records-archive/harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("../records-archive/harness")).routerMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/integrations/supabase/client", async () => (await import("./fake-supabase")).supabaseMock);
vi.mock("@/lib/step-up", () => ({ withStepUp: (fn: () => unknown) => fn() }));
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/books/PeriodEvidence", () => ({ PeriodEvidence: () => null }));
vi.mock("@/components/books/ReconciliationDetails", () => ({ ReconciliationDetails: () => null }));
vi.mock("@/components/books/useBooks", async (orig) => ({ ...(await orig<typeof import("@/components/books/useBooks")>()), useDemat: () => [] }));
vi.mock("@/components/books/useAudit", () => ({
  useAuditAll: () => ({ open: [{ key: "f-1", to: "/inbox", type: "Bank", text: "HDFC balance differs from statement", evidence: "Statement", risk: "high" }], reviewed: [] }),
}));
import { Route as AuditRoute } from "@/routes/_authenticated/audit";
const Audit = (AuditRoute as unknown as { component: () => React.ReactElement }).component;

const closed = { id: "cp-1", from: "2024-04-01", to: "2025-03-31", closedOn: "2025-06-30", note: "FY 2024-25 audited" };
const store = () => reset({ ...defaultPreferences(), books: { ...emptyBooks(), closedPeriods: [closed] } } as unknown as Record<string, unknown>, { refresh: async () => undefined });

let confirmSpy: ReturnType<typeof vi.spyOn>;
let promptSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFake();
  confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => { throw new Error("window.confirm must not be used"); });
  promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => { throw new Error("window.prompt must not be used"); });
});
afterEach(() => {
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(promptSpy).not.toHaveBeenCalled();
  cleanup();
  vi.restoreAllMocks();
});
const dialog = () => screen.getAllByRole("dialog").at(-1)!;
const press = (name: string | RegExp) => fireEvent.click(within(dialog()).getByRole("button", { name }));
const closedDialog = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
const button = (name: string) => within(dialog()).getByRole("button", { name }) as HTMLButtonElement;
const periodCalls = () => fake.rpcCalls.filter((c) => c.name === "change_accounting_period").map((c) => c.args as Record<string, unknown>);

describe("period closing uses in-app dialogs with typed confirmation", () => {
  it("Close period: names the period, states what is locked and who can reopen; Close stays off until the period is typed; Cancel and Escape send nothing", async () => {
    store();
    render(<Audit />);
    fireEvent.click(screen.getByRole("button", { name: "Close period" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Close 2025-04-01 to 2026-03-31?");
    const text = dialog().textContent ?? "";
    expect(text).toContain("Entries, opening balances and GST invoices dated 2025-04-01 to 2026-03-31 can't be added, changed or removed while it is closed");
    expect(text).toContain("Only the Audit operation can reopen it");
    expect(dialog().className).toContain("native-sheet");
    expect(button("Close period").disabled).toBe(true);
    expect(button("Close period").className).toContain("bg-destructive");
    const typed = within(dialog()).getByLabelText(/Type the period/);
    fireEvent.change(typed, { target: { value: "2025-04-01 to 2026-03-30" } });
    expect(button("Close period").disabled).toBe(true);
    fireEvent.change(typed, { target: { value: "2025-04-01 to 2026-03-31" } });
    expect(button("Close period").disabled).toBe(false);
    press("Cancel");
    await closedDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close period" }));
    expect((within(dialog()).getByLabelText(/Type the period/) as HTMLInputElement).value).toBe(""); // starts empty again
    fireEvent.keyDown(dialog(), { key: "Escape" });
    await closedDialog();
    expect(periodCalls()).toHaveLength(0);
  });

  it("Close period: once typed, sends the same change_accounting_period close with the note and frozen figures", async () => {
    store();
    render(<Audit />);
    fireEvent.change(screen.getByPlaceholderText("Note (e.g. FY audited and filed)"), { target: { value: "FY audited" } });
    fireEvent.click(screen.getByRole("button", { name: "Close period" }));
    expect(dialog().textContent).toContain("Note kept with the close: “FY audited”");
    fireEvent.change(within(dialog()).getByLabelText(/Type the period/), { target: { value: " 2025-04-01  TO 2026-03-31 " } });
    press("Close period");
    await closedDialog();
    const [call] = periodCalls();
    expect(call).toMatchObject({ _action: "closed", _from: "2025-04-01", _to: "2026-03-31", _reason: "FY audited" });
    expect(call?.["_figures"]).toBeTruthy();
  });

  it("Freeze FY: names the year and its dates; the FY label must be typed; sends the same full-year close", async () => {
    store();
    render(<Audit />);
    fireEvent.click(screen.getByRole("button", { name: "Freeze FY 2025-26" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Freeze FY 2025-26?");
    expect(dialog().textContent).toContain("1 April 2025 to 31 March 2026");
    expect(dialog().textContent).toContain("Only the Audit operation can reopen it");
    expect(button("Freeze FY 2025-26").disabled).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText(/Type the year/), { target: { value: "FY 2025-26" } });
    press("Freeze FY 2025-26");
    await closedDialog();
    expect(periodCalls()).toEqual([expect.objectContaining({ _action: "closed", _from: "2025-04-01", _to: "2026-03-31", _reason: "FY 2025-26 frozen" })]);
  });

  it("Close period: a refused close keeps the dialog open with the reason", async () => {
    store();
    fake.rpc["change_accounting_period"] = null;
    render(<Audit />);
    const { supabase } = await import("@/integrations/supabase/client");
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: { message: "This period overlaps a closed period" } } as never);
    fireEvent.click(screen.getByRole("button", { name: "Close period" }));
    fireEvent.change(within(dialog()).getByLabelText(/Type the period/), { target: { value: "2025-04-01 to 2026-03-31" } });
    press("Close period");
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("This period overlaps a closed period");
  });

  it("Reopen: names the period; the reason is required and kept; sends the same reopen with that reason", async () => {
    store();
    render(<Audit />);
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Reopen 2024-04-01 to 2025-03-31?");
    press("Reopen period");
    expect(within(dialog()).getByRole("alert").textContent).toBe("Give the reason for reopening");
    expect(periodCalls()).toHaveLength(0);
    fireEvent.change(within(dialog()).getByLabelText("Reason for reopening (kept permanently)"), { target: { value: "Auditor asked for a late invoice" } });
    press("Reopen period");
    await closedDialog();
    expect(periodCalls()).toEqual([expect.objectContaining({ _action: "reopened", _period: "cp-1", _from: "2024-04-01", _to: "2025-03-31", _reason: "Auditor asked for a late invoice" })]);
  });

  it("Mark fixed / Accept with note: the note is required; Cancel saves nothing (the pop-up path saved nothing on Cancel either); the note is kept with the finding", async () => {
    store();
    render(<Audit />);
    fireEvent.click(screen.getByRole("button", { name: "Mark fixed" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Mark this finding fixed");
    expect(dialog().textContent).toContain("HDFC balance differs from statement");
    press("Mark fixed");
    expect(within(dialog()).getByRole("alert").textContent).toBe("Add a short note saying why"); // setFindingState's own rule
    press("Cancel");
    await closedDialog();
    expect(harness.saves).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Accept with note" }));
    fireEvent.change(within(dialog()).getByLabelText("Why is this acceptable? (kept with the finding)"), { target: { value: "Bank charges posted next day" } });
    press("Accept with note");
    await closedDialog();
    const findings = (harness.stored["books"] as { findings: { key: string; status: string; note: string }[] }).findings;
    expect(findings).toEqual([expect.objectContaining({ key: "f-1", status: "accepted", note: "Bank charges posted next day" })]);
  });
});
