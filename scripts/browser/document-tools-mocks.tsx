import { useState } from 'react';
import { defaultPreferences } from '../../src/lib/preferences';
import { emptyBooks } from '../../src/lib/books/types';
import type { VaultDoc } from '../../src/lib/documents';

const documents: VaultDoc[] = ['a', 'b', 'c'].map(id => ({ id, title: `Controlled invoice ${id}`, docType: 'invoice', filePath: `owner/${id}`, fileName: 'invoice.pdf', mimeType: 'application/pdf', size: 16, docDate: '2026-10-02', amount: 1050, currency: 'INR', merchant: null, notes: '', text: '', transactionId: null, accountId: null, loanId: null, expiresOn: null, createdAt: '2026-10-02', fields: [{ label: 'Amount', value: '1050', originalValue: '1000', page: null, section: 'Clause 8', quote: 'Amount 1000', status: 'corrected', confidence: 'high' }] }));
export const fixture = { documents, denied: '', runs: JSON.parse(sessionStorage.getItem('cleanup-runs') ?? '[]'), removes: 0, downloads: 0, failCleanup: true, failFinal: false };
Object.assign(window, { documentTools: fixture });
export function useStore() {
  const [, bump] = useState(0);
  return { accounts: [], transactions: [], documents: fixture.documents, updateDocument: async () => { throw Error('Mutation forbidden'); }, removeDocument: async () => { throw Error('Mutation forbidden'); }, downloadFile: async () => {}, signedUrl: async (path: string) => path === fixture.denied ? null : `/__original/${path.split('/').at(-1)}`, preferences: { ...defaultPreferences(), books: emptyBooks() }, savePreferences: async () => {}, refresh: async () => bump(n => n + 1) };
}
export const useBooks = () => ({ books: emptyBooks(), preferences: defaultPreferences(), save: async () => {} });
export const listImports = async () => ['review', 'failed', 'paused', 'queued'].map((status, i) => ({ id: `past-${i}`, file_name: `${status}.pdf`, status, account_id: 'bank', period_from: '2026-10-01', period_to: '2026-10-31', currency: 'INR', error: status === 'failed' ? 'Reading interrupted' : null }));
const persist = () => sessionStorage.setItem('cleanup-runs', JSON.stringify(fixture.runs));
export const supabase = {
  from: () => ({
    select: () => { const q = { in: () => q, order: () => q, limit: () => Promise.resolve({ data: fixture.runs.filter((r: { status: string }) => !['done','cancelled'].includes(r.status)), error: null }) }; return q; },
    update: (patch: Record<string, unknown>) => ({ eq: async (_: string, id: string) => {
      if (fixture.failFinal && patch.status === 'done') return { error: { message: 'Final status interrupted' } };
      const row = fixture.runs.find((r: { id: string }) => r.id === id); Object.assign(row, patch); persist(); return { error: null };
    } }),
  }),
  storage: { from: () => ({ remove: async () => { fixture.removes++; return { error: fixture.failCleanup ? { message: 'Cleanup interrupted' } : null }; }, download: async () => { fixture.downloads++; throw Error('Cleanup must not download deleted bytes'); } }) },
};