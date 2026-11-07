// @vitest-environment node
import { expect, it } from 'vitest';
import { applyUpload, PartialUploadError, type ApplyApi } from './apply';
import { buildPlan } from './plan';
import { fromStatementLines } from './line';

it.each(['exact', 'wrong-reference', 'missing-timestamp', 'unavailable'] as const)(
 'lost evidence response %s: continue only after exact committed readback', async mode => {
  const account = buildPlan([{
    name: 'synthetic.csv', hint: null, accountId: 'bank', currency: 'INR', opening: 1000, closing: 750,
    lines: fromStatementLines('synthetic.csv', [{ ref: 'a', date: '2026-10-02', description: 'SWIGGY ORDER', amount: 250 }]),
  }], [{ id: 'bank', name: 'Bank', kind: 'savings', openingBalance: 1000, archived: false }], [], [{ name: 'Food', archived: false }]).accounts[0];
  if (!account) throw Error('Missing account');
  let ref: string | null = null; let writes = 0;
  const api = {
    transactions: [], save: async () => { writes++; }, prepareSource: async () => 'original',
    reconcile: async (_id: string, value: string | null) => { ref = value; throw Error('response lost'); },
    readEvidence: async () => {
      if (mode === 'unavailable') throw Error('read failed');
      return { statementRef: mode === 'wrong-reference' ? 'document:another · a' : ref, reconciledAt: mode === 'missing-timestamp' ? null : '2026-11-07' };
    }, refresh: async () => {},
  } as unknown as ApplyApi;
  const run = applyUpload([{ account, decisions: [...account.auto, ...account.ask], reconcileIds: [] }], api);
  if (mode === 'exact') expect((await run).posted).toHaveLength(1);
  else await expect(run).rejects.toBeInstanceOf(PartialUploadError);
  expect(writes).toBe(1);
 });