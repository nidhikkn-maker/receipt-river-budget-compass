import { expect, it } from "vitest";
import { mergeUploadHistory, settledUpload } from "./history";
import { cleanStatementUploads, type StatementUpload } from "../preferences";

const base: StatementUpload = { id: "u", at: "2026-11-07T10:00:00Z", label: "s.csv", posted: ["p1", "p2"], reconciled: ["r1"], createdAccounts: [], status: "interrupted", sources: [{ documentId: "d", accountId: "bank", file: "s.csv" }], expected: { posted: 2, reconciled: 1 } };
const ledger = [{ id: "p1", statementRef: "document:d · a" }, { id: "p2", statementRef: "document:d · b" }, { id: "r1", statementRef: "document:d · c" }];

it("a save whose every planned write is confirmed in the ledger is shown complete after reload", () => {
  expect(settledUpload(base, ledger)?.status).toBe("complete");
});

it("a save missing one planned entry stays interrupted", () => {
  expect(settledUpload({ ...base, posted: ["p1"] }, ledger)).toBeNull();
});

it("a posted entry absent from the ledger (undone or never written) keeps the upload interrupted", () => {
  expect(settledUpload(base, ledger.filter(e => e.id !== "p2"))).toBeNull();
});

it("a posted entry without its statement link keeps the upload interrupted", () => {
  expect(settledUpload(base, [{ id: "p1", statementRef: null }, ...ledger.slice(1)])).toBeNull();
});

it("older uploads without planned counts are never guessed complete", () => {
  const { expected: _e, ...old } = base;
  expect(settledUpload(old, ledger)).toBeNull();
});

it("planned counts survive cleaning and merging, and are not overwritten by later checkpoints", () => {
  const [clean] = cleanStatementUploads([base]);
  expect(clean.expected).toEqual({ posted: 2, reconciled: 1 });
  const merged = mergeUploadHistory({ statementUploads: [clean] } as never, { ...clean, expected: { posted: 0, reconciled: 0 } });
  expect(merged.statementUploads?.[0].expected).toEqual({ posted: 2, reconciled: 1 });
});
