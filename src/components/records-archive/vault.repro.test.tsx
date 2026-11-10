// P0-012 regression (was repro): vault documents are archived, never deleted. The documents row and its file are not
// touched (removeDocument is never called); archive status, who/when/why and history live in owner settings.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { callsOf, confirmInDialog, harness, OWNER, reset, spy } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./harness")).routerMock);
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/ContractObligations", () => ({ ContractObligations: () => null, NoticeDeadlines: () => null }));
vi.mock("@/components/books/VaultBooks", () => ({ VaultBooks: () => null }));
vi.mock("@/components/ExpenseDialog", () => ({ ExpenseDialog: () => null }));
import { Route } from "@/routes/_authenticated/vault";
const Vault = (Route as unknown as { component: () => React.ReactElement }).component;

const doc = { id: "doc-1", title: "LIC policy 2026", docType: "insurance", filePath: "owner/docs/lic.pdf", fileName: "lic.pdf", mimeType: "application/pdf", size: 1000, docDate: "2026-04-01", amount: 24000, currency: "INR", merchant: "LIC", notes: "", text: "", transactionId: null, accountId: null, loanId: null, expiresOn: null, createdAt: "2026-04-02T00:00:00Z", fields: [] };
const docs = [doc, { ...doc, id: "doc-2", title: "HDFC statement Oct 2026", docType: "bank_statement", evidenceLocked: true }];
beforeEach(() => reset({}, { documents: docs, removeDocument: spy("removeDocument"), updateDocument: spy("updateDocument"), signedUrl: async () => null, downloadFile: async () => undefined }));
afterEach(cleanup);
const registry = () => harness.stored["recordArchive"] as Record<string, unknown>[];

describe("P0-012 vault documents: archive instead of delete", () => {
  it("offers no Delete; Archive needs a reason; the row and file stay, and restore brings the document back", async () => {
    const snapshot = JSON.stringify(docs);
    render(<Vault />);
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Archive document ${doc.title}` }));
    expect(await confirmInDialog("Policy surrendered; kept as evidence", /^Archive document$/)).toBe("Archive this document?");
    expect(callsOf("removeDocument")).toHaveLength(0);
    expect(JSON.stringify(harness.store["documents"])).toBe(snapshot); // the row itself is unchanged
    expect(registry()).toEqual([expect.objectContaining({ id: "documents:doc-1", table: "documents", recordId: "doc-1", archivedBy: OWNER, archiveReason: "Policy surrendered; kept as evidence" })]);
    expect(screen.getByText("1 documents")).toBeInTheDocument();
    expect(screen.getByText(/^Archived documents \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Restore ${doc.title}` }));
    await confirmInDialog("Archived by mistake", /^Restore document$/);
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    expect((registry()[0]!["archiveHistory"] as { action: string }[]).map((e) => e.action)).toEqual(["archived", "restored"]);
    expect(callsOf("removeDocument")).toHaveLength(0);
  });
  it("evidence-locked originals can be archived too (archive never deletes) and the lock is left as it was", async () => {
    render(<Vault />);
    fireEvent.click(screen.getByRole("button", { name: "Archive document HDFC statement Oct 2026" }));
    await confirmInDialog("Account closed in 2026", /^Archive document$/);
    expect(callsOf("updateDocument")).toHaveLength(0);
    expect(callsOf("removeDocument")).toHaveLength(0);
  });
});
