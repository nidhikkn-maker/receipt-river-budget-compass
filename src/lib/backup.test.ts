import { describe, expect, it } from "vitest";
import { createBackupZip, prepareRestore, readBackup, type Backup } from "./backup";
const backup: Backup = { app: "ledgerline", version: 2, owner: "a", exportedAt: "2026-10-31", data: { accounts: [{ id: "bank", owner_id: "a" }], family_members: [{ id: "child", owner_id: "a" }], expenses: [{ id: "bill", employee_id: "a", account_id: "bank", member_id: "child", splits: [{ memberId: "child", amount: 50 }], receipts: [{ path: "a/receipt.jpg" }] }], documents: [{ id: "doc", transaction_id: "bill", file_path: "a/document.pdf" }] } };
describe("Complete backups", () => {
  it('remaps reimbursement receiving accounts and report responsibility records across owners', () => {
    const b = { ...backup, data: { ...backup.data, finance_preferences: [{ owner_id: 'a', data: { reimbursementSettings: { profiles: [{ id: 'role', accountId: 'bank' }], responsibilities: [{ entryId: 'bill', shares: [{ organisation: 'AET', amount: 100 }] }], mappings: [{ activity: 'entries:bill', organisation: 'AET', profileId: 'role' }] } } }] } };
    let n = 0; const result = prepareRestore(b, 'b', () => `new-${++n}`);
    const p = result.data.finance_preferences?.[0]?.['data'] as { reimbursementSettings: { profiles: { accountId: string }[]; responsibilities: { entryId: string }[]; mappings: { activity: string }[] } };
    expect(p.reimbursementSettings.profiles[0]?.accountId).toBe(result.data.accounts?.[0]?.['id']);
    expect(p.reimbursementSettings.responsibilities[0]?.entryId).toBe(result.data.expenses?.[0]?.['id']);
    expect(p.reimbursementSettings.mappings[0]?.activity).toBe(`entries:${String(result.data.expenses?.[0]?.['id'])}`);
  });
  it("round trips records and original receipt binaries", () => {
    const result = readBackup(createBackupZip(backup, { "a/receipt.jpg": new Uint8Array([1, 2, 3]) }), true);
    expect(result.backup).toEqual(backup); expect([...result.files["a/receipt.jpg"] ?? []]).toEqual([1, 2, 3]);
  });
  it("preserves same-owner identifiers for repeatable restores", () => {
    const result = prepareRestore(backup, "a"); expect(result.data.expenses?.[0]?.["id"]).toBe("bill"); expect(result.paths.get("a/receipt.jpg")).toBe("a/receipt.jpg");
  });
  it("remaps linked accounts, family splits and files for a different owner", () => {
    let n = 0; const result = prepareRestore(backup, "b", () => `new-${++n}`);
    expect(result.data.expenses?.[0]?.["account_id"]).toBe(result.data.accounts?.[0]?.["id"]);
    expect(result.data.documents?.[0]?.["transaction_id"]).toBe(result.data.expenses?.[0]?.["id"]);
    expect(result.data.expenses?.[0]?.["employee_id"]).toBe("b");
    expect(result.data.expenses?.[0]?.["splits"]).toEqual([{ memberId: result.data.family_members?.[0]?.["id"], amount: 50 }]);
    expect(result.paths.get("a/receipt.jpg")).toMatch(/^b\/restored\//);
  });
  it("carries unsaved drafts with their receipt files and remaps them across owners", () => {
    const b: Backup = { ...backup, data: { ...backup.data, expense_drafts: [{ id: "draft", owner_id: "a", status: "ready", transaction_id: null, data: { accountId: "bank", memberId: "child", amount: "120" }, receipts: [{ path: "a/draft-photo.jpg" }] }] } };
    const round = readBackup(createBackupZip(b, { "a/draft-photo.jpg": new Uint8Array([4, 5]) }), true);
    expect(round.backup.data.expense_drafts?.[0]?.["status"]).toBe("ready");
    expect([...round.files["a/draft-photo.jpg"] ?? []]).toEqual([4, 5]);
    let n = 0; const result = prepareRestore(b, "b", () => `new-${++n}`);
    const draft = result.data.expense_drafts?.[0] as { owner_id: string; data: { accountId: string; memberId: string }; receipts: { path: string }[] };
    expect(draft.owner_id).toBe("b");
    expect(draft.data.accountId).toBe(result.data.accounts?.[0]?.["id"]);
    expect(draft.data.memberId).toBe(result.data.family_members?.[0]?.["id"]);
    expect(draft.receipts[0]?.path).toMatch(/^b\/restored\//);
  });
  it("rejects paths outside owner storage", () => {
    expect(() => prepareRestore({ ...backup, data: { documents: [{ file_path: "a/../private" }] } }, "a")).toThrow("invalid file path");
  });
  it("stages file replacements without overwriting current receipt paths", () => {
    let n = 0;
    const result = prepareRestore(backup, "a", () => `stage-${++n}`, true);
    expect(result.data.expenses?.[0]?.["id"]).toBe("bill");
    expect(result.paths.get("a/receipt.jpg")).toBe("a/restored/stage-1-receipt.jpg");
    expect(result.data.expenses?.[0]?.["receipts"]).toEqual([{ path: "a/restored/stage-1-receipt.jpg" }]);
    expect(backup.data.expenses?.[0]?.["receipts"]).toEqual([{ path: "a/receipt.jpg" }]);
  });
});