import { emptyBooks } from "../../src/lib/books/types";
const key = "controlled-asset-document";
const blank = () => ({ preferences: { books: emptyBooks(), entities: [], assets: [{ id: "generator-1", name: "Generator", kind: "machinery", cost: 150000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 10, usefulLifeYears: 10, residualPct: 0, tag: "GEN-44" }], contractObligations: [] }, documents: [] as unknown[], runs: {} as Record<string, unknown>, reads: 0, commits: 0, failNext: true });
export const state = () => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(blank())) as ReturnType<typeof blank>;
const write = (s: ReturnType<typeof blank>) => localStorage.setItem(key, JSON.stringify(s));
const encoded = (file: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
export const useStore = () => ({
  ...state(), preferencesRevision: 4, accounts: [], loans: [], transactions: [],
  addDocument: async (file: File, meta: { id: string }) => { const s = state(); if (!s.documents.some((d) => (d as {id:string}).id === meta.id)) s.documents.push({ ...meta, original: await encoded(file), filePath: `synthetic/${meta.id}/${file.name}`, fileName:file.name, mimeType:file.type, size:file.size, createdAt:'2026-11-08T00:00:00Z' }); write(s); return meta.id; },
  savePreferences: async (preferences: ReturnType<typeof blank>['preferences']) => {const s=state();s.preferences=preferences;write(s);},
  downloadFile: async () => undefined,
  signedUrl: async () => null,
  commitDocumentRecords: async (_id: string, data: ReturnType<typeof blank>["preferences"]) => { const s = state(); if (!s.commits) { s.preferences = data; s.commits++; write(s); } if (s.failNext) { s.failNext = false; write(s); throw new Error("Controlled lost response"); } },
});
export const extractDocument = async () => undefined;
export const useServerFn = () => async ({ data }: { data: { dataUrl: string; mimeType: string } }) => {
  if (!data.dataUrl.startsWith("data:image/png;base64,") || data.mimeType !== "image/png") throw new Error("Original image was not passed to reader");
  const s = state(); s.reads++; write(s);
  const actual=localStorage.getItem('actual-synthetic-invoice-reading');
  if(actual)return JSON.parse(actual);
  if (location.search.includes('invoice')) return {ok:true,result:{docType:'asset_invoice',title:'Generator invoice',date:'2026-04-01',amount:150000,currency:'INR',merchant:'Engineering Works',text:'Generator 150000 invoice 1 April 2026',notes:'',fields:[{label:'Purchase cost',value:'150000',page:1,quote:'Generator 150000',confidence:'high'}],asset:{name:'Invoice generator',kind:'machinery',cost:150000,purchaseDate:'2026-04-01',owner:null,supplier:'Engineering Works',serial:null},obligations:[]}};
  return { ok: true, result: { docType: "maintenance", title: "Generator annual service", date: "2026-10-02", amount: 8000, merchant: "Engineering Works", currency: "INR", notes: "Annual service", text: "Serial GEN-44. Service 8000", fields: [{ label: "Serial number", value: "GEN-44", originalValue: "GEN-44", page: 1, quote: "Serial GEN-44", confidence: "high" }], asset: { name: "Generator", serial: "GEN-44", kind: "machinery", owner: null, cost: null, purchaseDate: null, supplier: "Engineering Works", warrantyUntil: null, insurance: null }, obligations: [] } };
};
export const documentIdForRun = (id: string) => id;
export const startRun = async (id: string, file: File) => { const s = state(); s.runs[id] = { original: await encoded(file) }; write(s); return { data: {} }; };
export const updateRun = async (id: string, patch: object) => { const s = state(); s.runs[id] = { ...(s.runs[id] as object), ...patch }; write(s); };
export const closeRun = async () => undefined;