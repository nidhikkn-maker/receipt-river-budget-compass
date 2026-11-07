import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyBooks } from "@/lib/books/types";

const state = vi.hoisted(() => ({ store: {} as Record<string, unknown>, runs: [] as unknown[], close: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => state.store }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/lib/document-extract.functions", () => ({ extractDocument: vi.fn() }));
vi.mock("@/lib/books/runs", () => ({
  documentIdForRun: (id: string) => id, startRun: vi.fn(),
  updateRun: async (_id: string, patch: unknown) => { state.runs.push(patch); }, closeRun: state.close,
}));
import { DocumentIntake } from "./DocumentIntake";
import type { ExtractedDocument } from "@/lib/document-extract.functions";

const baseRead = (docType: ExtractedDocument["docType"], overrides: Partial<ExtractedDocument> = {}): ExtractedDocument => ({
  docType, title: "Controlled original", date: "2026-10-02", amount: null, currency: "INR", merchant: null,
  notes: "", text: "", fields: [], ...overrides,
} as ExtractedDocument);
const open = (read: ExtractedDocument) => render(<DocumentIntake file={new File(["representative original"], "controlled.pdf", { type: "application/pdf" })} onClose={vi.fn()} resume={{ runId: "00000000-0000-0000-0000-000000000010", read, docType: read.docType, fields: read.fields.map(f => ({ ...f, status: "read" as const })), data: {} }} />);

describe("actual document review workflow (isolated persistence boundary)", () => {
  const add = vi.fn(), commit = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks(); state.runs = [];
    add.mockResolvedValue("00000000-0000-0000-0000-000000000010"); commit.mockResolvedValue(undefined);
    state.store = { preferences: { books: emptyBooks(), entities: [], assets: [], contractObligations: [] }, preferencesRevision: 4, documents: [], accounts: [], loans: [], transactions: [], addDocument: add, commitDocumentRecords: commit };
  });
  afterEach(cleanup);

  it("correcting an invoice field changes the approved GST amount and preserves its printed original", async () => {
    state.store['preferences'] = { books: emptyBooks(), entities: [{ id: "company-1", name: "Owner", kind: "company", pan: "AAACA1234A", gstins: ["33AAACA1234A1Z5"], booksFrom: "2020-21" }], assets: [], contractObligations: [] };
    open(baseRead("invoice", { amount: 1180, fields: [{ label: "Taxable value", value: "1000", originalValue: "1000", page: 2, quote: "Taxable value 1000", confidence: "high" }], gstInvoice: { number: "INV-44", date: "2026-10-02", seller: "Owner", sellerGstin: "33AAACA1234A1Z5", buyer: "Customer", buyerGstin: null, taxable: 1000, igst: 0, cgst: 90, sgst: 90, cess: 0 } }));
    fireEvent.click(screen.getByText(/Details read/));
    fireEvent.change(screen.getByDisplayValue("1000", { selector: "details input" }), { target: { value: "1100" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(commit.mock.calls[0]?.[1].books.gstInvoices[0]).toMatchObject({ taxable: 1100, docId: "00000000-0000-0000-0000-000000000010" });
    expect(add.mock.calls[0]?.[1].fields[0]).toMatchObject({ value: "1100", originalValue: "1000", status: "corrected", page: 2 });
  });

  it("utility review requires no invented cost and saves the consumer number with property links", async () => {
    open(baseRead("utility_bill", { property: { name: "Factory", address: "44 Industrial Road", owner: null, cost: null, acquiredOn: null, surveyNo: null, valuation: null, valuationDate: null, utilityConsumerNo: "04477112", insurer: null, propertyTaxId: null } }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    const payload = commit.mock.calls[0]?.[1];
    expect(payload.assets).toEqual([]);
    expect(payload.books.properties[0]).toMatchObject({ name: "Factory", notes: "Consumer 04477112" });
    expect(payload.books.docLinks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "property", docId: "00000000-0000-0000-0000-000000000010" })]));
  });

  it("receipt preserves printed total, low confidence and source location; never creates a payment", async () => {
    open(baseRead("receipt", { amount: 1180, merchant: "Cafe", fields: [{ label: "Total", value: "1180", originalValue: "1180", page: 1, quote: "Grand total 1180", confidence: "low" }] }));
    fireEvent.click(screen.getByText(/Details read/));
    expect(screen.getByText("low confidence")).toBeVisible();
    expect(add).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save to DocuRepo" }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0]?.[1]).toMatchObject({ amount: 1180, merchant: "Cafe", docType: "receipt", fields: [{ page: 1, quote: "Grand total 1180", confidence: "low", originalValue: "1180" }] });
    expect(commit.mock.calls[0]?.[1].books.gstInvoices).toEqual([]);
    expect(commit.mock.calls[0]?.[1].assets).toEqual([]);
    expect(commit.mock.calls[0]?.[2]).toBe(false);
  });

  it("contract waits for a source locator and stores obligations for review, never as paid or planned", async () => {
    open(baseRead("contract", { expiresOn: "2027-10-01", fields: [{ label: "Notice period", value: "30", originalValue: "30", page: null, quote: "30 days notice", confidence: "medium" }], obligations: [{ label: "Annual maintenance", amount: 12000, frequency: "yearly", dueDate: "2027-10-01", noticeDays: 30, evidence: "Annual fee INR 12000" }] }));
    fireEvent.click(screen.getByRole("button", { name: "Save to DocuRepo" }));
    expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Details read/));
    fireEvent.change(screen.getByLabelText("Page or section for Notice period"), { target: { value: "Termination clause 8" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save to DocuRepo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save to DocuRepo" }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0]?.[1]).toMatchObject({ expiresOn: "2027-10-01", fields: [{ section: "Termination clause 8", page: null }] });
    expect(commit.mock.calls[0]?.[1].contractObligations).toEqual([expect.objectContaining({ docId: "00000000-0000-0000-0000-000000000010", amount: 12000, status: "review", decidedAt: null })]);
  });

  it("unknown financial record leaves absent amount/date unknown and preserves unrelated records", async () => {
    open(baseRead("other", { date: null, amount: null }));
    fireEvent.click(screen.getByRole("button", { name: "Save to DocuRepo" }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0]?.[1]).toMatchObject({ amount: null, docDate: null, transactionId: null });
    expect(commit.mock.calls[0]?.[1].books.holdings).toEqual([]);
  });

  it("lost save response retries the exact approved request without copying the original or creating new obligations", async () => {
    commit.mockRejectedValueOnce(new Error("Connection lost after commit"));
    open(baseRead("contract", { obligations: [{ label: "Fee", amount: 800, frequency: "once", dueDate: "2026-12-01", noticeDays: null, evidence: "Fee 800" }] }));
    fireEvent.click(screen.getByRole("button", { name: "Save to DocuRepo" }));
    await screen.findByRole("button", { name: "Retry" });
    const approved = commit.mock.calls[0];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    expect(commit.mock.calls[1]).toEqual(approved); expect(add).toHaveBeenCalledTimes(1);
    expect(state.close).toHaveBeenCalledWith(expect.anything(), "done");
  });
});