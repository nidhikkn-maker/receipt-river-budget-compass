// P0-026 (pending documents one-tap delete). Before the fix the "Saved receipts to add" list on New entry had an X
// button ("Delete <file>") that hard-deleted the pending, unlinked vault document and its file in one tap, with no
// reason, no recovery and no history. Evidence: docs/evidence/screens/2026-11-10-p0-025-026/repro-pending-documents.before.txt.
// Now: Archive with a reason (the row and file are untouched), Restore from the archived list, and the archive
// history is kept in owner settings (recordArchive). Staging cleanup after a successful save is separate and kept.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { callsOf, confirmInDialog, harness, OWNER, reset, spy } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => ({ ...(await import("./harness")).routerMock, useRouter: () => ({ navigate: async () => undefined, history: { back: () => undefined } }) }));
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<object>()), useServerFn: () => vi.fn(async () => ({ ok: false, error: "not in tests" })) }));
vi.mock("@/lib/receipt-extract.functions", () => ({ extractReceipt: vi.fn() }));
vi.mock("@/lib/fx.functions", () => ({ getFxRate: vi.fn() }));
vi.mock("@/lib/assistant.functions", () => ({ parseSpokenEntry: vi.fn() }));
vi.mock("@/lib/offline", () => ({ fileToLocal: vi.fn(), localDrafts: vi.fn(async () => []), localToFile: vi.fn(), putLocalDraft: vi.fn(async () => undefined), removeLocalDraft: vi.fn(async () => undefined) }));
vi.mock("@/lib/drafts", async (orig) => ({ ...(await orig<typeof import("@/lib/drafts")>()), getDraft: vi.fn(async () => null), upsertDraft: vi.fn(), completeDraft: vi.fn(), uploadDraftReceipt: vi.fn() }));

import { NewExpense } from "@/routes/_authenticated/new";

const pending = { id: "doc-p1", title: "Receipt to add · bill.jpg", docType: "receipt", filePath: `${OWNER}/docs/bill.jpg`, fileName: "bill.jpg", mimeType: "image/jpeg", size: 2048, docDate: null, amount: null, currency: "INR", merchant: null, notes: "pending-receipt", text: "", transactionId: null, accountId: null, loanId: null, expiresOn: null, createdAt: "2026-11-09T10:00:00Z", fields: [] };
beforeEach(() => reset({}, { documents: [pending], removeDocument: spy("removeDocument"), addDocument: spy("addDocument"), save: spy("save"), signedUrl: async () => null }));
afterEach(cleanup);
const registry = () => (harness.stored["recordArchive"] ?? []) as Record<string, unknown>[];

describe("P0-026 pending documents on New entry: archive with reason, never one-tap delete", () => {
  it("offers no one-tap Delete; Archive needs a reason, keeps the row and file, and Restore brings it back with history", async () => {
    render(<NewExpense />);
    fireEvent.click(await screen.findByText("Saved receipts to add (1)"));
    expect(screen.queryByRole("button", { name: "Delete bill.jpg" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Archive document ${pending.fileName}` }));
    await confirmInDialog("Duplicate photo of the same bill", /^Archive document$/);
    expect(callsOf("removeDocument")).toHaveLength(0);
    expect(harness.store["documents"]).toEqual([pending]);
    expect(registry()).toEqual([expect.objectContaining({ id: "documents:doc-p1", table: "documents", recordId: "doc-p1", archivedBy: OWNER, archiveReason: "Duplicate photo of the same bill" })]);
    expect(screen.queryByText("Saved receipts to add (1)")).toBeNull();
    const archived = screen.getByText(/^Archived receipts to add \(1\)/).closest("section, details, div") as HTMLElement;
    fireEvent.click(within(archived).getByRole("button", { name: `Restore ${pending.fileName}` }));
    await confirmInDialog("Still need to add this bill", /^Restore document$/);
    expect(screen.getByText("Saved receipts to add (1)")).toBeInTheDocument();
    expect((registry()[0]!["archiveHistory"] as { action: string; by: string }[]).map((e) => [e.action, e.by])).toEqual([["archived", OWNER], ["restored", OWNER]]);
    expect(callsOf("removeDocument")).toHaveLength(0);
  });
});
