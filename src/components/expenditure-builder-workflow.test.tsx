// Actual builder/PDF with isolated mocked storage and history. Not hosted acceptance.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { defaultPreferences } from '@/lib/preferences';
import type { Expense } from '@/lib/expenses';
const local = vi.hoisted(() => ({ store: {} as Record<string, unknown>, uploaded: null as Blob | null, history: null as Record<string, unknown> | null, loseReply: true, offline: false, download: vi.fn() }));
vi.mock('@/lib/store', () => ({ useStore: () => local.store }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/AppShell', () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('./useClaimPreparation', () => ({ useClaimPreparation: () => ({ status: '', saveNow: vi.fn() }) }));
vi.mock('@/lib/reports', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/reports')>(), downloadBlob: local.download }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  storage: { from: () => ({ upload: async (_path: string, blob: Blob) => { if (local.offline) return { error: Error('Offline') }; local.uploaded = blob; return { error: null }; } }) },
  from: () => {
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'range', 'contains', 'limit']) q[method] = () => q;
    q['then'] = (done: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(done);
    q['maybeSingle'] = async () => ({ data: local.history, error: null });
    q['insert'] = async (row: Record<string, unknown>) => { local.history = row; if (local.loseReply) { local.loseReply = false; return { error: Error('Lost response') }; } return { error: null }; };
    return q;
  },
} }));
import { ExpenditureReportBuilder } from './ExpenditureReportBuilder';
async function bytes(blob: Blob) {
  return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(Error('Missing bytes')); reader.onerror = reject; reader.readAsArrayBuffer(blob); }));
}
async function prepare() {
  local.uploaded = null; local.history = null; local.loseReply = true; local.offline = false; local.download.mockReset();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:isolated-report'), revokeObjectURL: vi.fn() }));
  const original = await PDFDocument.create(); const page = original.addPage([321, 456]); const font = await original.embedFont(StandardFonts.Helvetica); page.drawText('ISOLATED ORIGINAL BILL', { x: 20, y: 100, font });
  const originalBytes = await original.save();
  const nativeBlob = (await import('node:buffer')).Blob;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => new nativeBlob([originalBytes], { type: 'application/pdf' }) })));
  const entry = { id: 'e', title: 'Test hotel', merchant: 'Test hotel', category: 'Hotels', scope: 'business', amount: 12.34, originalAmount: 12.34, currency: 'INR', fxRate: 1, date: '2026-11-01', description: '', paymentMethod: 'bank_transfer', accountId: 'bank', receipts: [{ name: 'bill.pdf', path: 'isolated/bill.pdf', type: 'application/pdf' }], tags: [], splits: [], reimbursementStatus: 'pending', reimbursement: { reimbursable: 12.34, receipts: [] } } as Expense;
  local.store = { userId: 'isolated', name: 'Test owner', loading: false, preferences: defaultPreferences(), transactions: [entry], expenses: [entry], accounts: [{ id: 'bank', name: 'Test bank', kind: 'savings', openingBalance: 100, archived: false }], memberName: () => 'Test owner', signedUrl: async () => 'https://isolated.invalid/bill.pdf' };
  return entry;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('actual statement builder verifies fetched originals, saves exact PDF despite lost response, and downloads identical bytes', async () => {
  const entry = await prepare(); const snapshot = JSON.stringify(entry);
  render(<ExpenditureReportBuilder mode="statement" search={{ entry: 'e' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate statement PDF' }));
  await screen.findByRole('button', { name: 'Confirm documents & generate' });
  expect(local.uploaded).toBeNull(); expect(local.history).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm documents & generate' }));
  await screen.findByText('Saved in Reports Centre → Report history.');
  const blob = local.uploaded; if (!blob) throw Error('No uploaded PDF');
  const pdf = await PDFDocument.load(await bytes(blob));
  expect(pdf.getPages().some(p => p.getWidth() === 321 && p.getHeight() === 456)).toBe(true);
  expect(local.history).toMatchObject({ owner_id: 'isolated', kind: 'expenditure-statement', file_size: blob.size });
  expect((local.history?.['filters'] as { snapshot: { summary: { total: number } } }).snapshot.summary.total).toBe(12.34);
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  expect(await bytes(local.download.mock.calls[0]?.[0])).toEqual(await bytes(blob));
  expect(JSON.stringify(entry)).toBe(snapshot);
});
it('actual builder cancel creates no PDF/history; failed upload keeps local PDF and retries the same history identity', async () => {
  await prepare(); render(<ExpenditureReportBuilder mode="statement" search={{ entry: 'e' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate statement PDF' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel', exact: true }));
  expect(local.history).toBeNull(); expect(local.uploaded).toBeNull();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate statement PDF' })).toBeEnabled());
  local.offline = true;
  fireEvent.click(screen.getByRole('button', { name: 'Generate statement PDF' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm documents & generate' }));
  await screen.findByRole('button', { name: 'Retry saving to history' });
  expect(local.history).toBeNull();
  local.offline = false; fireEvent.click(screen.getByRole('button', { name: 'Retry saving to history' }));
  await screen.findByText('Saved in Reports Centre → Report history.');
  expect(local.history?.['file_size']).toBe(local.uploaded?.size);
});