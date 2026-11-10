// Regression (was the reproduction, see docs/evidence/screens/2026-11-10-prompt-replacement-2/repro/): the remaining
// value edits use the in-app ValueDialog, never window.prompt. Same saved change as the pop-up path, the rule shown
// inline, nothing saved on Cancel or Escape.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { emptyBooks } from "@/lib/books/types";
import type { Expense } from "@/lib/expenses";
import { callsOf, harness, reset, spy } from "../records-archive/harness";
import { resetFake } from "./fake-supabase";

vi.mock("@/lib/store", async () => ({ useStore: (await import("../records-archive/harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("../records-archive/harness")).routerMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/integrations/supabase/client", async () => (await import("./fake-supabase")).supabaseMock);
vi.mock("@/components/HomeModePicker", () => ({ HomeModePicker: () => null }));
vi.mock("@/components/CategoryMergePreview", () => ({ CategoryMergePreview: () => null }));
import { PropertyPanel } from "@/components/books/PropertyPanel";
import { FinanceSettings } from "@/components/FinanceSettings";
import { OrganisationDirectory } from "@/components/OrganisationDirectory";
import { AllocationEditor } from "@/components/SplitAndClaim";
import { GoalsPanel } from "@/components/WealthPanels";

const property = {
  id: "p-1", name: "Indiranagar house", address: "12th Main", docIds: [],
  buildings: [{ id: "b-1", name: "Main block", floors: [{ id: "f-1", name: "Ground", units: [{ id: "u-1", name: "G1" }] }] }],
};
const lease = { id: "l-1", propertyId: "p-1", unitId: "u-1", tenant: "R. Rao", start: "2025-12-01", end: "2026-11-30", rent: 45000, paymentTerms: "monthly" };
const groceries = {
  id: "e-2", title: "Big basket", category: "Groceries", amount: 3000, originalAmount: 3000, currency: "INR", fxRate: 1,
  date: "2026-11-03", txnType: "expense", receipts: [], tags: [],
  allocations: [{ category: "Groceries", amount: 2000 }, { category: "Household", amount: 1000 }],
} as unknown as Expense;
const goal = { id: "g-1", name: "Emergency fund", target: 300000, saved: 120000, monthly: 10000, reserve: true };

let promptSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { resetFake(); promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => { throw new Error("window.prompt must not be used"); }); });
afterEach(() => { expect(promptSpy).not.toHaveBeenCalled(); cleanup(); vi.restoreAllMocks(); });
const dialog = () => screen.getAllByRole("dialog").at(-1)!;
const field = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const press = (name: string) => fireEvent.click(within(dialog()).getByRole("button", { name }));
const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
const alertText = () => within(dialog()).getByRole("alert").textContent;
type Books = { properties: typeof property[]; leases: typeof lease[] };
const books = () => harness.stored["books"] as Books;

describe("remaining value edits use the in-app dialog", () => {
  it("Property → + building / + floor / + unit: a name is required; adds the same part; Cancel adds nothing", async () => {
    reset({ ...defaultPreferences(), books: { ...emptyBooks(), properties: [property], leases: [lease] } } as unknown as Record<string, unknown>, {});
    render(<PropertyPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add building to Indiranagar house" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Add building · Indiranagar house");
    press("Add building");
    expect(alertText()).toBe("Name the building");
    press("Cancel");
    await closed();
    expect(harness.saves).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Add building to Indiranagar house" }));
    fireEvent.change(field("Building name"), { target: { value: "Annexe" } });
    press("Add building");
    await closed();
    expect(books().properties[0]!.buildings.map((b) => b.name)).toEqual(["Main block", "Annexe"]);
    fireEvent.click(screen.getByRole("button", { name: "Add floor to Main block" }));
    fireEvent.change(field("Floor name (e.g. Ground)"), { target: { value: "First" } });
    press("Add floor");
    await closed();
    fireEvent.click(screen.getByRole("button", { name: "Add unit to Main block Ground" }));
    fireEvent.change(field("Unit name (e.g. 2A)"), { target: { value: "G2" } });
    press("Add unit");
    await closed();
    const main = books().properties[0]!.buildings[0]!;
    expect(main.floors.map((f) => [f.name, f.units.map((u) => u.name)])).toEqual([["Ground", ["G1", "G2"]], ["First", []]]);
  });

  it("Property → Renew: date prefilled with the current end; an earlier date is explained (the pop-up silently ignored it); saves the new end", async () => {
    reset({ ...defaultPreferences(), books: { ...emptyBooks(), properties: [property], leases: [lease] } } as unknown as Record<string, unknown>, {});
    render(<PropertyPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Renew lease for R. Rao" }));
    expect(field("Renew until").value).toBe("2026-11-30");
    expect(field("Renew until").type).toBe("date");
    press("Renew lease");
    expect(alertText()).toBe("Choose a date after the current end, 2026-11-30");
    fireEvent.change(field("Renew until"), { target: { value: "2027-11-30" } });
    press("Renew lease");
    await closed();
    expect(books().leases).toEqual([{ ...lease, end: "2027-11-30" }]);
  });

  it("Settings → Rename category: prefilled; an existing name points to Merge; renames references then the catalog", async () => {
    reset(defaultPreferences() as unknown as Record<string, unknown>, { moveCategory: spy("moveCategory"), name: "KK", updateName: spy("updateName"), loading: false });
    render(<FinanceSettings />);
    const [first, second] = (harness.store["preferences"] as { categories: { name: string }[] }).categories;
    fireEvent.click(screen.getByRole("button", { name: `Rename ${first!.name}` }));
    expect(field("New category name").value).toBe(first!.name);
    fireEvent.change(field("New category name"), { target: { value: second!.name } });
    press("Rename category");
    expect(alertText()).toBe("Use merge for an existing category");
    fireEvent.change(field("New category name"), { target: { value: "  Dining out " } });
    press("Rename category");
    await closed();
    expect(callsOf("moveCategory").map((c) => c.args)).toEqual([[first!.name, "Dining out"]]);
    expect((harness.store["preferences"] as { categories: { name: string }[] }).categories[0]!.name).toBe("Dining out");
  });

  it("Organisations → Rename: prefilled; duplicate (any case) explained inline; renames the tag", async () => {
    reset({ ...defaultPreferences(), tags: [{ group: "Organisation", name: "Acme" }, { group: "Organisation", name: "Globex" }] } as unknown as Record<string, unknown>, { setTags: spy("setTags") });
    render(<OrganisationDirectory />);
    fireEvent.click(screen.getByRole("button", { name: "Rename Acme" }));
    expect(field("Organisation name").value).toBe("Acme");
    fireEvent.change(field("Organisation name"), { target: { value: "globex" } });
    press("Rename organisation");
    expect(alertText()).toBe("“globex” already exists");
    fireEvent.change(field("Organisation name"), { target: { value: "Acme Corp" } });
    press("Rename organisation");
    await closed();
    expect((harness.stored["tags"] as { group: string; name: string }[]).filter((t) => t.group === "Organisation").map((t) => t.name)).toEqual(["Acme Corp", "Globex"]);
  });

  it("Split → Save as template: name required; saves the same template lines", async () => {
    reset(defaultPreferences() as unknown as Record<string, unknown>, { setAllocations: spy("setAllocations") });
    render(<AllocationEditor e={groceries} />);
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
    press("Save template");
    expect(alertText()).toBe("Name the template");
    fireEvent.change(field("Template name"), { target: { value: "Monthly shop" } });
    press("Save template");
    await closed();
    expect(harness.stored["splitTemplates"]).toEqual([{ name: "Monthly shop", lines: [{ category: "Groceries", pct: 66.67 }, { category: "Household", pct: 33.33 }] }]);
  });

  it("Goals → Update: prefilled with saved so far; blank and negative explained; saves the goal with the new amount", async () => {
    reset(defaultPreferences() as unknown as Record<string, unknown>, { goals: [goal], saveGoal: spy("saveGoal") });
    render(<GoalsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Update saved so far for Emergency fund" }));
    expect(field("Saved so far (₹)").value).toBe("120000");
    fireEvent.change(field("Saved so far (₹)"), { target: { value: "" } });
    press("Save amount");
    expect(alertText()).toBe("Enter the amount saved so far (0 if nothing yet)");
    fireEvent.change(field("Saved so far (₹)"), { target: { value: "-5" } });
    expect(alertText()).toBe("Amounts can't be negative");
    fireEvent.keyDown(field("Saved so far (₹)"), { key: "Escape" });
    await closed();
    expect(callsOf("saveGoal")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Update saved so far for Emergency fund" }));
    fireEvent.change(field("Saved so far (₹)"), { target: { value: "135000" } });
    press("Save amount");
    await closed();
    expect(callsOf("saveGoal").map((c) => c.args)).toEqual([[{ ...goal, saved: 135000 }]]);
  });
});
