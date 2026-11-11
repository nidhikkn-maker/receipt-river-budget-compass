// R-E-I17: "Add asset from invoice" (DocumentIntake) and the saved-purchase asset step (ReceiptAssetHandoff) name the
// closed period when the database guard (0069) refuses an asset dated in it, instead of showing the raw database text.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyBooks } from "@/lib/books/types";

const state = vi.hoisted(() => ({ store: {} as Record<string, unknown>, runs: [] as unknown[] }));
vi.mock("@/lib/store", () => ({ useStore: () => state.store }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/lib/document-extract.functions", () => ({ extractDocument: vi.fn() }));
vi.mock("@/lib/books/runs", () => ({
  documentIdForRun: (id: string) => id, startRun: vi.fn(),
  updateRun: async (_id: string, patch: unknown) => { state.runs.push(patch); }, closeRun: vi.fn(),
}));
import { DocumentIntake } from "./DocumentIntake";
import { ReceiptAssetHandoff } from "./ReceiptAssetHandoff";
import type { ExtractedDocument } from "@/lib/document-extract.functions";

const DB_0069 = "assets financial facts overlap a closed period; reopen it first";
const closedPeriods = [
  { id: "p2", from: "2026-04-01", to: "2026-09-30", closedOn: "2026-10-05", note: "H1 closed" },
  { id: "p1", from: "2025-04-01", to: "2026-03-31", closedOn: "2026-05-01", note: "FY closed" },
];
const books = () => ({ ...emptyBooks(), closedPeriods });
const invoice = (purchaseDate: string): ExtractedDocument => ({
  docType: "asset_invoice", title: "Laptop invoice", date: purchaseDate, amount: 90000, currency: "INR", merchant: "Croma", notes: "", text: "", fields: [],
  asset: { name: "Laptop", kind: "computer", cost: 90000, purchaseDate, supplier: "Croma", owner: null, warrantyUntil: null, insurance: null, serial: null, putToUseOn: purchaseDate, method: null, usefulLifeYears: 3, residualPct: 5, openingTaxWdv: null, openingBookWdv: null, wdvFy: null },
} as unknown as ExtractedDocument);

afterEach(cleanup);

describe("DocumentIntake: Add asset from invoice", () => {
  const add = vi.fn(), commit = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks(); state.runs = [];
    add.mockResolvedValue("00000000-0000-0000-0000-000000000020");
    state.store = { preferences: { books: books(), entities: [], assets: [], contractObligations: [] }, preferencesRevision: 4, documents: [], accounts: [], loans: [], transactions: [], addDocument: add, commitDocumentRecords: commit };
  });
  const open = async (read: ExtractedDocument) => {
    render(<DocumentIntake file={new File(["original"], "invoice.pdf", { type: "application/pdf" })} onClose={vi.fn()} resume={{ runId: "00000000-0000-0000-0000-000000000020", read, docType: read.docType, fields: [], data: {} }} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Capitalise this as a fixed asset/ }));
  };

  it("a database refusal for a closed-period date names the period and the adjustment needed, not the raw text", async () => {
    commit.mockRejectedValue(new Error(DB_0069));
    await open(invoice("2026-08-15"));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This date is in a closed period (2026-04-01 to 2026-09-30); an authorised accounting adjustment is needed");
    expect(alert.textContent).not.toContain("reopen it first");
    expect(alert.textContent).not.toContain("Retry will finish linking");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[1].assets).toEqual([expect.objectContaining({ name: "Laptop", purchaseDate: "2026-08-15" })]);
  });

  it("other save failures keep their own message and the retry wording", async () => {
    commit.mockRejectedValueOnce(new Error("Connection lost after commit"));
    await open(invoice("2026-10-15"));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Connection lost after commit");
    expect(alert.textContent).not.toContain("closed period");
  });
});

describe("ReceiptAssetHandoff: saved purchase to asset", () => {
  const save = vi.fn();
  const entry = { id: "e1", title: "Office chair", merchant: "IKEA", amount: 12000, date: "2025-11-20", txnType: "expense" };
  beforeEach(() => {
    vi.clearAllMocks();
    state.store = { transactions: [entry], documents: [], preferences: { books: books(), assets: [] }, savePreferences: save };
  });

  it("a database refusal for a closed-period date names the period (the earliest one the asset reaches)", async () => {
    save.mockRejectedValue(new Error(DB_0069));
    render(<ReceiptAssetHandoff entryId="e1" />);
    fireEvent.click(screen.getByRole("button", { name: "Link saved purchase to asset" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("This date is in a closed period (2025-04-01 to 2026-03-31); an authorised accounting adjustment is needed, or the period reopened with a written reason. The record was not saved.");
    expect(screen.queryByText("Already linked to Things I own.")).toBeNull();
  });

  it("other failures show their own message; a successful save links the asset", async () => {
    save.mockRejectedValueOnce(new Error("Reconnect to save")).mockResolvedValueOnce(undefined);
    render(<ReceiptAssetHandoff entryId="e1" />);
    fireEvent.click(screen.getByRole("button", { name: "Link saved purchase to asset" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Reconnect to save");
    fireEvent.click(screen.getByRole("button", { name: "Link saved purchase to asset" }));
    await waitFor(() => expect(screen.getByText("Already linked to Things I own.")).toBeTruthy());
  });
});
