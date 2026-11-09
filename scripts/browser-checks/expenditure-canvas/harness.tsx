import { createRoot } from 'react-dom/client';
import { ExpenditureReportBuilder } from '@/components/ExpenditureReportBuilder';
import { defaultPreferences } from '@/lib/preferences';
import { PDFDocument } from 'pdf-lib';
const w = window as any;
(async () => {
  // Real WebP receipt produced by the browser itself (not PNG/JPEG, so the builder must convert it via canvas).
  const c = document.createElement('canvas'); c.width = 240; c.height = 160; const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 160); g.fillStyle = '#223546'; g.font = '20px sans-serif'; g.fillText('WEBP RECEIPT', 20, 80);
  const webp: Blob = await new Promise(r => c.toBlob(b => r(b!), 'image/webp', 0.9));
  w.__webpType = webp.type; w.__webpSize = webp.size;
  const webpBytes = await webp.arrayBuffer();
  const realFetch = window.fetch.bind(window);
  window.fetch = (async (u: any, i?: any) => String(u).startsWith('https://isolated.invalid/') ? new Response(webpBytes, { status: 200, headers: { 'content-type': 'image/webp' } }) : realFetch(u, i)) as any;
  const entry = { id: 'e', title: 'Test cafe', merchant: 'Test cafe', category: 'Food', scope: 'business', amount: 45.5, originalAmount: 45.5, currency: 'INR', fxRate: 1, date: '2026-11-01', description: '', paymentMethod: 'upi', accountId: 'bank', receipts: [{ name: 'receipt.webp', path: 'isolated/receipt.webp', type: 'image/webp' }], splits: [], memberId: null, reconciledAt: null, statementRef: null, tags: [] };
  w.__store = { userId: 'isolated-browser', name: 'Test owner', loading: false, preferences: defaultPreferences(), transactions: [entry], expenses: [entry], accounts: [{ id: 'bank', name: 'Test bank', kind: 'savings', openingBalance: 100, archived: false }], memberName: () => 'Test owner', signedUrl: async () => 'https://isolated.invalid/receipt.webp' };
  w.__inspect = async () => { const b: Blob = w.__uploaded; if (!b) return null; const pdf = await PDFDocument.load(await b.arrayBuffer());
    let jpeg = 0; for (const [, obj] of pdf.context.enumerateIndirectObjects()) { const s = String((obj as any).dict?.get?.((pdf.context as any).obj('Filter')) ?? ''); if (s.includes('DCTDecode')) jpeg++; }
    return { pages: pdf.getPageCount(), size: b.size, jpegImages: jpeg, history: w.__history ? { kind: w.__history.kind, file_size: w.__history.file_size } : null }; };
  createRoot(document.getElementById('root')!).render(<ExpenditureReportBuilder mode="statement" search={{ entry: 'e' }} />);
})();
