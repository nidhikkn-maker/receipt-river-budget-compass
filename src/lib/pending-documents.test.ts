// P0-026: the only removal of a "saved to add later" receipt is the post-save cleanup of its staging copy
// (new.tsx, after save() succeeded with the receipt's bytes uploaded again). With P9 the database verifies the copy;
// before P9 the same narrow rule is checked in the request. Anything else is refused and the row is kept.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const net = vi.hoisted(() => ({ rpc: null as null | { code?: string; message: string }, deleted: [] as string[], filters: [] as string[], rows: 1 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: null, error: net.rpc }),
  from: () => { const q: Record<string, unknown> = {
    delete: () => q, eq: (k: string, v: string) => { net.filters.push(`${k}=${v}`); return q; }, is: (k: string) => { net.filters.push(`${k} is null`); return q; },
    select: () => Promise.resolve({ data: Array.from({ length: net.rows }, () => ({ id: "doc-1" })), error: null }).then((r) => { if (net.rows) net.deleted.push("doc-1"); return r; }),
  }; return q; },
} }));
import { discardUsedPendingDocument } from "./pending-documents";

const doc = { id: "doc-1", notes: "pending-receipt", transactionId: null };
beforeEach(() => { net.rpc = null; net.deleted = []; net.filters = []; net.rows = 1; });

describe("P0-026 discardUsedPendingDocument", () => {
  it("with P9 the database decides; a refusal keeps the row and nothing is deleted directly", async () => {
    await expect(discardUsedPendingDocument(doc)).resolves.toBeUndefined();
    net.rpc = { code: "42501", message: "P9_NOT_COPIED: this receipt is not saved with an entry yet, so it is kept" };
    await expect(discardUsedPendingDocument(doc)).rejects.toThrow("This receipt isn't saved with an entry yet, so it is kept.");
    expect(net.deleted).toEqual([]);
  });
  it("before P9 only an unlinked pending receipt row is removed, and a no-op delete is an error so the file stays", async () => {
    net.rpc = { code: "PGRST202", message: "Could not find the function public.discard_used_pending_document" };
    await expect(discardUsedPendingDocument(doc)).resolves.toBeUndefined();
    expect(net.filters).toEqual(["id=doc-1", "notes=pending-receipt", "transaction_id is null"]);
    net.rows = 0;
    await expect(discardUsedPendingDocument(doc)).rejects.toThrow(/kept/);
  });
  it("never removes other documents (linked, not pending, or evidence-locked)", async () => {
    for (const d of [{ ...doc, transactionId: "e1" }, { ...doc, notes: "" }, { ...doc, evidenceLocked: true }]) await expect(discardUsedPendingDocument(d)).rejects.toThrow(/Archive other documents/);
    expect(net.deleted).toEqual([]);
  });
  it("New entry clears a staging copy only after the entry was saved with that receipt's bytes, and has no one-tap delete", () => {
    const src = readFileSync("src/routes/_authenticated/new.tsx", "utf8");
    const submit = src.slice(src.indexOf("const submit = async"), src.indexOf("toast.success(editing ? \"Entry updated\""));
    // the cleanup line comes after the awaited save that uploads receipts.map((r) => r.file) (the copied bytes)
    expect(submit.indexOf("files: receipts.map((r) => r.file)")).toBeGreaterThan(0);
    expect(submit.indexOf("for (const id of fromInbox)")).toBeGreaterThan(submit.indexOf("files: receipts.map((r) => r.file)"));
    // fromInbox holds only receipts the user tapped Use on (their bytes were added to this entry's files)
    expect(src).toMatch(/setFromInbox\(\(x\) => \[\.\.\.x, id\]\); await onFiles\(dt\.files\);/);
    expect(src).not.toMatch(/aria-label=\{`Delete \$\{d\.fileName\}`\}/);
    expect(src.match(/removeDocument\(/g)).toHaveLength(1);
  });
});
