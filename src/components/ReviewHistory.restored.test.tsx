// P0-003 regression: Review History reads each batch's real restored state; restored batches are listed as
// Restored with no Undo, and a batch restored elsewhere is not "restored" again with a success message.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: {} as Record<string, unknown>, toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/store", () => ({ useStore: () => m.store }));
vi.mock("sonner", () => ({ toast: m.toast }));
import { ReviewHistory } from "./ReviewHistory";

const fin = (id: string, undoneAt: string | null) => ({ id, createdAt: `2026-11-0${id.length}T09:00:00Z`, undoneAt, count: 1, entries: [{ before: { id: "t1", title: "Swiggy", txn_type: "transfer" }, after: { txn_type: "expense" } }] });
const meta = (id: string, undoneAt: string | null) => ({ id, createdAt: "2026-11-02T09:00:00Z", undoneAt, entries: [{ before: { title: "Uber", tags: [] }, after: { tags: ["Trip: Goa"] } }] });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("shows restored account/type and mapping batches as Restored without Undo; active ones keep Undo", async () => {
  m.store = { categoryHistory: async () => [], financialCorrectionHistory: async () => [fin("active", null), fin("restored", "2026-11-04T09:00:00Z")], reviewMetadataHistory: async () => [meta("m-restored", "2026-11-03T09:00:00Z")], undoFinancialCorrection: vi.fn(), undoReviewMetadata: vi.fn(), undoCategoryBatch: vi.fn() };
  render(<ReviewHistory />);
  await screen.findAllByText(/Account \/ type/);
  const items = screen.getAllByRole("listitem").filter((li) => /transactions/.test(li.textContent ?? "") && li.querySelector("p.font-medium"));
  expect(items).toHaveLength(3);
  const undoButtons = screen.getAllByRole("button", { name: "Review undo" });
  expect(undoButtons).toHaveLength(1);
  expect(screen.getAllByText(/Restored/)).toHaveLength(2);
  expect(within(undoButtons[0]!.closest("li")!).getByText(/Saved correction/)).toBeInTheDocument();
});

it("a batch restored on another device after the list loaded is not restored again", async () => {
  let restored: string | null = null;
  const undo = vi.fn();
  m.store = { categoryHistory: async () => [], financialCorrectionHistory: async () => [fin("active", restored)], reviewMetadataHistory: async () => [], undoFinancialCorrection: undo, undoReviewMetadata: vi.fn(), undoCategoryBatch: vi.fn() };
  render(<ReviewHistory />);
  fireEvent.click(await screen.findByRole("button", { name: "Review undo" }));
  restored = "2026-11-09T10:00:00Z"; // another device restores it now
  fireEvent.click(screen.getByRole("button", { name: "Confirm undo" }));
  await waitFor(() => expect(m.toast.info).toHaveBeenCalledWith("This change was already restored. Nothing else was changed."));
  expect(undo).not.toHaveBeenCalled();
  expect(m.toast.success).not.toHaveBeenCalled();
  expect(await screen.findByText(/Restored/)).toBeInTheDocument();
});
