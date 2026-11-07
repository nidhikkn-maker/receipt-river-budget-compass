import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";
const mock = vi.hoisted(() => ({ store: {} as Record<string, unknown>, move: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => mock.store }));
import { CategoryMergePreview } from "./CategoryMergePreview";
afterEach(cleanup);
it("preview and cancel never move records; split references block an unsafe merge", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  mock.move.mockReset(); mock.save.mockReset();
  mock.store = { transactions: [{ id: "e", date: "2026-11-01", title: "Split bill", amount: 10, category: "Other", allocations: [{ category: "Meals", amount: 5 }, { category: "Travel", amount: 5 }] }], commitments: [], budgets: { Meals: 100 }, preferences: { ...defaultPreferences(), categories: [{ name: "Meals", archived: false }, { name: "Travel", archived: false }] }, moveCategory: mock.move, savePreferences: mock.save };
  const close = vi.fn(); render(<CategoryMergePreview source="Meals" onClose={close} />);
  expect(mock.move).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("combobox", { name: "Merge into category" }));
  fireEvent.click(await screen.findByRole("option", { name: "Travel" }));
  expect(screen.getByRole("button", { name: "Confirm merge" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("split allocations");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalled(); expect(mock.move).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
});
it('preview includes trip plans and refuses a legacy merge that cannot preserve them atomically',async()=>{
 mock.move.mockReset();mock.save.mockReset();
 mock.store={transactions:[],commitments:[{id:'c',name:'Rent',category:'Meals',amount:12}],budgets:{Meals:100},preferences:{...defaultPreferences(),categories:[{name:'Meals',archived:false},{name:'Travel',archived:false}],trips:[{id:'trip',name:'Original trip',budgetLines:[{category:'Meals',amount:40}]}]},moveCategory:mock.move,savePreferences:mock.save};
 render(<CategoryMergePreview source='Meals' onClose={()=>{}}/>);
 fireEvent.click(screen.getByRole('combobox',{name:'Merge into category'}));fireEvent.click(await screen.findByRole('option',{name:'Travel'}));
 expect(screen.getByRole('button',{name:'Confirm merge'})).toBeDisabled();
 expect(screen.getByRole('alert')).toHaveTextContent('atomic merge');
 expect(mock.move).not.toHaveBeenCalled();expect(mock.save).not.toHaveBeenCalled();
});