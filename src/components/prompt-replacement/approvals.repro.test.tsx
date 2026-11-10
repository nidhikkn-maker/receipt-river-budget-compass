// Regression (was the reproduction, see docs/evidence/screens/2026-11-10-prompt-replacement-2/repro/): approvals use
// in-app dialogs, never a browser pop-up (window.confirm/prompt). Same operation and data as before; Cancel and Escape
// change nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { emptyBooks } from "@/lib/books/types";
import { callsOf, harness, reset, spy } from "../records-archive/harness";
import { fake, resetFake } from "./fake-supabase";

vi.mock("@/lib/store", async () => ({ useStore: (await import("../records-archive/harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("../records-archive/harness")).routerMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", async () => (await import("./fake-supabase")).supabaseMock);
vi.mock("@/lib/offline", () => ({ localDrafts: async () => [], putLocalDraft: async () => undefined, removeLocalDraft: async () => undefined }));
vi.mock("@/components/books/AccountantReviews", () => ({ AccountantReviews: () => null }));
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/SectionTabs", () => ({ SectionTabs: () => null }));
vi.mock("@/components/StrategyStressCooling", () => ({ CoolingOff: () => null, StressTest: () => null }));
vi.mock("@/components/DecisionMemory", () => ({ DecisionMemory: () => null }));
vi.mock("@/lib/use-intelligence", async () => {
  const h = await import("../records-archive/harness");
  return {
    useIntelligence: () => ({
      store: h.harness.store, today: "2026-11-10", emis: 0, metrics: {},
      ef: { reserves: 0, coverage: 0, target: 0, months: 6, monthly: 0, gap: 0, accounts: [] },
      p: { cash: 200000, minBalance: 10000, reserves: 0, flow: { income: 120000, spent: 80000 } },
    }),
  };
});
import { AccountingJournalReview } from "@/components/books/AccountingJournalReview";
import { SharedWithMe } from "@/components/books/CompanyAccess";
import { RulesRegister } from "@/components/books/TaxCentre";
import { Route as StrategyRoute } from "@/routes/_authenticated/strategy";
const Strategy = (StrategyRoute as unknown as { component: () => React.ReactElement }).component;

const journal = {
  id: "j-1", entityId: "ent-1", date: "2026-10-31", kind: "accrual", description: "October audit fee accrual", documentIds: [],
  legs: [
    { code: "expense:audit", label: "Audit fee", role: "expense", debit: 50000, credit: 0 },
    { code: "payable:auditor", label: "Auditor", role: "liability", debit: 0, credit: 50000 },
  ],
};
const journalEntry = {
  id: "e-j1", title: "Audit fee accrual", amount: 0, date: "2026-10-31", txnType: "adjustment", receipts: [], tags: [],
  receiptDetails: { accounting: { primary: true, journal } },
};
const company = {
  grant_id: "g-1", owner_id: "own-2", entity_id: "ent-9", company_name: "Acme Traders", owner_email: "owner@example.test", can_write: true,
};
const sharedTxn = {
  id: "st-1", employee_id: "own-2", entity_id: "ent-9", title: "Office rent", merchant: "Landlord", category: "Rent",
  amount: 40000, currency: "INR", expense_date: "2026-10-05", txn_type: "expense",
};
const rule = {
  id: "r-1", area: "income_tax", key: "custom.threshold", title: "New threshold", value: "5000",
  sourceUrl: "https://incometax.gov.in/notice", publishedOn: "2024-03-01", effectiveFrom: "2024-04-01",
  appliesTo: [], status: "proposed", tests: [],
};
const closedFy = { id: "cp-1", from: "2024-04-01", to: "2025-03-31", closedOn: "2025-06-30", note: "FY 2024-25 audited" };

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
const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
type Books = { rules: { id: string; status: string }[] };

describe("approvals use in-app dialogs", () => {
  it("Company journal → Prepare reversal: required reason (the five-character rule) shown inline; prepares the same reversal and opens the journal for review", async () => {
    reset(defaultPreferences() as unknown as Record<string, unknown>, { transactions: [journalEntry], accountingAvailable: async () => true, documents: [] });
    render(<AccountingJournalReview entityId="ent-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare reversal" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Prepare a reversal of “October audit fee accrual”?");
    expect(dialog().textContent).toContain("Nothing is posted yet");
    press("Prepare reversal");
    expect(within(dialog()).getByRole("alert").textContent).toBe("Write the correction reason (at least five characters).");
    press("Cancel");
    await closed();
    fireEvent.click(screen.getByRole("button", { name: "Prepare reversal" }));
    fireEvent.change(within(dialog()).getByLabelText("Reason for reversing this journal"), { target: { value: "Accrual booked twice" } });
    press("Prepare reversal");
    const journalDialog = await screen.findByRole("heading", { name: "Company journal" });
    expect(journalDialog).toBeTruthy();
    expect((screen.getByLabelText("Journal explanation") as HTMLInputElement).value).toBe("Accrual booked twice");
    expect((screen.getByLabelText("Journal type") as HTMLSelectElement).value).toBe("reversal");
    expect((screen.getByLabelText("Debit 1") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("Credit 1") as HTMLInputElement).value).toBe("50000");
  });

  it("Shared company → Edit: description prefilled; blank refused inline; unchanged saves nothing; a change updates that entry's title", async () => {
    resetFake({ expenses: [sharedTxn], documents: [] }, { my_shared_companies: [company] });
    reset(defaultPreferences() as unknown as Record<string, unknown>, {});
    render(<SharedWithMe />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit description of Office rent" }));
    const field = () => within(dialog()).getByLabelText("Description") as HTMLInputElement;
    expect(field().value).toBe("Office rent");
    press("Save description");
    await closed();
    expect(fake.writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Edit description of Office rent" }));
    fireEvent.change(field(), { target: { value: "  " } });
    press("Save description");
    expect(within(dialog()).getByRole("alert").textContent).toBe("Write a description");
    fireEvent.change(field(), { target: { value: " Office rent October " } });
    press("Save description");
    await closed();
    expect(fake.writes.map((w) => [w.table, w.op, w.value, w.filters])).toEqual([["expenses", "update", { title: "Office rent October" }, [["id", "st-1"]]]]);
  });

  it("Rules → Approve a rule reaching into a closed year: names the year and why; Cancel leaves it proposed; Approve for open periods activates it", async () => {
    reset({ ...defaultPreferences(), books: { ...emptyBooks(), rules: [rule], closedPeriods: [closedFy] } } as unknown as Record<string, unknown>, {});
    render(<RulesRegister />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Approve “New threshold” for open periods only?");
    expect(dialog().textContent).toContain("reaches back into FY 2024-25, which is closed or filed");
    expect(dialog().textContent).toContain("FY 2024-25 keeps its earlier treatment (closed period 2024-04-01 to 2025-03-31)");
    press("Cancel");
    await closed();
    expect(harness.saves).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    press("Approve for open periods");
    await closed();
    expect((harness.stored["books"] as Books).rules.map((r) => [r.id, r.status])).toEqual([["r-1", "active"]]);
  });

  it("Rules → Approve a rule with no closed or filed years activates straight away (no dialog), as before", async () => {
    reset({ ...defaultPreferences(), books: { ...emptyBooks(), rules: [{ ...rule, effectiveFrom: "2026-04-01", publishedOn: "2026-03-01" }], closedPeriods: [closedFy] } } as unknown as Record<string, unknown>, {});
    render(<RulesRegister />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect((harness.stored["books"] as Books).rules.map((r) => r.status)).toEqual(["active"]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Strategy → Save as planned payment: in-app confirmation says nothing is paid; Cancel saves nothing; Save to plan saves the same planned commitment", async () => {
    reset(defaultPreferences() as unknown as Record<string, unknown>, { saveCommitment: spy("saveCommitment") });
    render(<Strategy />);
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as planned payment…" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Save “Make a purchase” of ₹45,000.00 as a planned payment?");
    expect(dialog().textContent).toContain("Nothing is paid and no money moves");
    fireEvent.keyDown(dialog(), { key: "Escape" });
    await closed();
    expect(callsOf("saveCommitment")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save as planned payment…" }));
    press("Save to plan");
    await closed();
    expect(callsOf("saveCommitment")).toHaveLength(1);
    expect(callsOf("saveCommitment")[0]!.args[0]).toMatchObject({ amount: 45000, accountId: null, direction: "out" });
  });
});
