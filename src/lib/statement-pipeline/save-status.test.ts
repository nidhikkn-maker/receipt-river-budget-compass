import { expect, it } from "vitest";
import { mergeUploadHistory, settledUpload } from "./history";
import { cleanStatementUploads, type StatementUpload } from "../preferences";
import { undoUpload, type ApplyApi } from './apply';

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
  const clean = cleanStatementUploads([base])[0];
  if (!clean) throw Error('Missing cleaned upload');
  expect(clean.expected).toEqual({ posted: 2, reconciled: 1 });
  const merged = mergeUploadHistory({ statementUploads: [clean] } as never, { ...clean, expected: { posted: 0, reconciled: 0 } });
  expect(merged.statementUploads?.[0]?.expected).toEqual({ posted: 2, reconciled: 1 });
});

it('an unrelated statement link cannot certify completion', () => {
  expect(settledUpload(base, ledger.map(e => ({ ...e, statementRef: 'document:other · x' })))).toBeNull();
});

it('duplicate history IDs cannot satisfy planned counts', () => {
  expect(settledUpload({ ...base, posted: ['p1', 'p1'] }, ledger)).toBeNull();
});

it('source-less saves cannot infer complete financial evidence', () => {
  expect(settledUpload({ ...base, sources: [] }, ledger)).toBeNull();
});

it('an exact planned reference must read back, not merely the right document', () => {
  expect(settledUpload({ ...base, evidence: [{ id: 'p1', ref: 'document:d · expected-line' }] }, ledger)).toBeNull();
});

it('a receipt link lost before its checkpoint cannot be hidden by complete entry counts', () => {
  expect(settledUpload({ ...base, expected: { ...base.expected, posted: 2, reconciled: 1, drafts: 1 } }, ledger)).toBeNull();
});

it('receipt consumption must read back before completion and survives cleaning', () => {
  const u = { ...base, expected: { posted: 2, reconciled: 1, drafts: 1 }, linkedDrafts: [{ draftId: 'receipt', transactionId: 'p1' }], evidence: [{ id: 'p1', ref: ledger[0]?.statementRef ?? '' }] };
  const clean = cleanStatementUploads([u])[0];
  if (!clean) throw Error('Missing upload');
  expect(settledUpload(clean, ledger, [{ id: 'receipt', status: 'ready', transactionId: null }])).toBeNull();
  expect(settledUpload(clean, ledger, [{ id: 'receipt', status: 'saved', transactionId: 'p2' }])).toBeNull();
  expect(settledUpload(clean, ledger, [{ id: 'receipt', status: 'saved', transactionId: 'p1' }])?.status).toBe('complete');
});

it('Undo retains history when authoritative reads find a committed entry missing from the local snapshot', async () => {
  const api = { transactions: [], readExistingIds: async () => ['lost-response'], refresh: async () => undefined } as unknown as ApplyApi;
  const r = await undoUpload({ posted: ['lost-response'], reconciled: [], createdAccounts: [] }, api);
  expect(r.left).toEqual(['lost-response']);
});

it('failed authoritative Undo reads never certify successful cleanup', async () => {
  const api = { transactions: [], readExistingIds: async () => { throw Error('offline'); } } as unknown as ApplyApi;
  await expect(undoUpload({ posted: ['p'], reconciled: [], createdAccounts: [] }, api)).rejects.toThrow('offline');
});
it('pending Undo cannot settle complete and survives cleaning even beyond completed-history limits', () => {
  const pending = { ...base, status: 'complete' as const, undoError: 'Undo unfinished' };
  const history = cleanStatementUploads([...Array.from({ length: 12 }, (_, i) => ({ ...base, id: String(i), status: 'complete' })), pending]);
  expect(history.find(u => u.id === 'u')?.undoError).toBe('Undo unfinished');
  expect(settledUpload({ ...base, undoError: 'Undo unfinished' }, ledger)).toBeNull();
});
