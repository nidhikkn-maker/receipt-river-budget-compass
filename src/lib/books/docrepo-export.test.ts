// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { selectedDocumentZip } from './docrepo-export';
import type { VaultDoc } from '../documents';

const bytes = new TextEncoder().encode('original invoice');
const doc = async (id: string): Promise<VaultDoc> => ({ id, title: id, docType: 'invoice', filePath: `owner/${id}`, fileName: 'invoice.pdf', size: bytes.length, mimeType: 'application/pdf', docDate: null, amount: null, currency: 'INR', merchant: null, notes: '', text: '', transactionId: null, accountId: null, loanId: null, expiresOn: null, createdAt: '2026-11-07', fields: [{ label: 'Amount', value: '1050', originalValue: '1000', page: null, section: 'Clause 8', quote: '1000', confidence: 'high', status: 'corrected' }] });
const fetcher = (async () => new Response(bytes)) as typeof fetch;

it('exports exactly selected visible originals and their complete provenance, preserving full identities', async () => {
  const a = await doc('12345678-a'), b = await doc('12345678-b'), other = await doc('unselected');
  const sign = vi.fn(async (p: string) => `https://files.test/${p}`);
  const zip = unzipSync(await selectedDocumentZip([a, b, other], [a.id, b.id, a.id], [], '2026-11-07', sign, fetcher));
  expect(Object.keys(zip).sort()).toEqual(['12345678-a-invoice.pdf', '12345678-b-invoice.pdf', 'manifest.json']);
  const manifest = JSON.parse(strFromU8(zip['manifest.json'] ?? new Uint8Array()));
  expect(manifest.count).toBe(2);
  expect(manifest.documents[0].fields[0]).toMatchObject({ originalValue: '1000', section: 'Clause 8' });
  expect(sign.mock.calls.map(c => c[0])).toEqual([a.filePath, b.filePath]);
});
it('a selected inaccessible document refuses the entire bundle before any fetch', async () => {
  const sign = vi.fn();
  await expect(selectedDocumentZip([await doc('a')], ['a', 'revoked'], [], '', sign, fetcher)).rejects.toThrow('no longer available');
  expect(sign).not.toHaveBeenCalled();
});
it.each(['denied', 'failed', 'truncated', 'empty'] as const)('%s original never produces an apparently complete export', async kind => {
  const a = await doc('a');
  const sign = async () => kind === 'denied' ? null : 'https://files.test/a';
  const read = (async () => kind === 'failed' ? new Response('', { status: 503 }) : new Response(kind === 'empty' ? '' : kind === 'truncated' ? 'partial' : bytes)) as typeof fetch;
  await expect(selectedDocumentZip([a], ['a'], [], '', sign, read)).rejects.toThrow();
});