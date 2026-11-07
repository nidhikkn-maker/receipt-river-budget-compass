import type { ExpenseInput } from "./expenses";
export interface PendingEntry { id:string; owner:string; input:ExpenseInput; files:File[]; createdAt:string }
interface Sealed { encrypted: true; iv: Uint8Array; bytes: ArrayBuffer }
interface StoredEntry extends Sealed { id: string; owner: string }
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open("ledgerline-offline",2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("entries"))r.result.createObjectStore("entries",{keyPath:"id"});if(!r.result.objectStoreNames.contains("snapshots"))r.result.createObjectStore("snapshots");if(!r.result.objectStoreNames.contains("keys"))r.result.createObjectStore("keys");};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function operation<T>(store:string,mode:IDBTransactionMode,action:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const d=await db();try{return await new Promise<T>((resolve,reject)=>{const tx=d.transaction(store,mode);const r=action(tx.objectStore(store));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{d.close();}}
const keyPromises=new Map<string,Promise<CryptoKey>>();
async function key(owner:string){const existing=keyPromises.get(owner);if(existing)return existing;const pending=(async()=>{const found=await operation<CryptoKey|undefined>("keys","readonly",s=>s.get(owner));if(found)return found;const generated=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);const d=await db();try{return await new Promise<CryptoKey>((resolve,reject)=>{const tx=d.transaction("keys","readwrite");const store=tx.objectStore("keys");const r=store.get(owner);let chosen=generated;r.onsuccess=()=>{if(r.result)chosen=r.result as CryptoKey;else store.put(generated,owner);};tx.oncomplete=()=>resolve(chosen);tx.onerror=()=>reject(tx.error);});}finally{d.close();}})();keyPromises.set(owner,pending);try{return await pending;}catch(e){keyPromises.delete(owner);throw e;}}
export async function encryptOffline(owner:string,value:unknown):Promise<Sealed>{const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(owner)},await key(owner),new TextEncoder().encode(JSON.stringify(value)));return {encrypted:true,iv,bytes};}
export async function decryptOffline<T>(owner:string,value:Sealed):Promise<T>{const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(value.iv),additionalData:new TextEncoder().encode(owner)},await key(owner),value.bytes);return JSON.parse(new TextDecoder().decode(bytes)) as T;}
export async function queueEntry(entry:PendingEntry){const files=await Promise.all(entry.files.map(async f=>({name:f.name,type:f.type,lastModified:f.lastModified,bytes:Array.from(new Uint8Array(await f.arrayBuffer()))})));const sealed=await encryptOffline(entry.owner,{...entry,files});return operation("entries","readwrite",s=>s.put({...sealed,id:entry.id,owner:entry.owner}));}
export async function pendingEntries(owner:string){const rows=await operation<(StoredEntry|PendingEntry)[]>("entries","readonly",s=>s.getAll());const result:PendingEntry[]=[];for(const row of rows.filter(e=>e.owner===owner)){if("encrypted" in row){const entry=await decryptOffline<Omit<PendingEntry,"files">&{files:{name:string;type:string;lastModified:number;bytes:number[]}[]}>(owner,row);result.push({...entry,files:entry.files.map(f=>new File([new Uint8Array(f.bytes)],f.name,{type:f.type,lastModified:f.lastModified}))});}else{await queueEntry(row);result.push(row);}}return result;}
export const removePending=(id:string)=>operation("entries","readwrite",s=>s.delete(id));
export const putSnapshot=async(owner:string,data:unknown)=>{const sealed=await encryptOffline(owner,data);return operation("snapshots","readwrite",s=>s.put(sealed,owner));};
export async function getSnapshot<T>(owner:string):Promise<T|undefined>{const data=await operation<T|Sealed|undefined>("snapshots","readonly",s=>s.get(owner));if(data===undefined)return undefined;if(data&&typeof data==="object"&&"encrypted" in data)return decryptOffline<T>(owner,data as Sealed);await putSnapshot(owner,data);return data as T;}
export async function clearOfflineOwner(owner:string){const entries=await operation<{id:string;owner:string}[]>("entries","readonly",s=>s.getAll());for(const e of entries.filter(x=>x.owner===owner))await removePending(e.id);await operation("snapshots","readwrite",s=>s.delete(owner));await operation("snapshots","readwrite",s=>s.delete(`drafts:${owner}`));await operation("snapshots","readwrite",s=>s.delete(`review:${owner}`));await operation("snapshots","readwrite",s=>s.delete(`originals:${owner}`));await operation("keys","readwrite",s=>s.delete(owner));keyPromises.delete(owner);}

export interface ReviewContext { selected: string[]; query: string; group: string; category: string; account: string; workspace: string; organisation: string; confidence?: string; sort?: string; from?: string; to?: string; minimum?: string; maximum?: string; view?: string; limit?: number; missingField?: string; transactionType?: string; categoryFilter?: string }
export async function readReviewContext(owner: string): Promise<ReviewContext | undefined> {
  const value = await operation<Sealed | undefined>('snapshots', 'readonly', s => s.get(`review:${owner}`));
  return value ? decryptOffline<ReviewContext>(owner, value) : undefined;
}
export async function writeReviewContext(owner: string, context: ReviewContext) {
  const value = await encryptOffline(owner, context);
  await operation('snapshots', 'readwrite', s => s.put(value, `review:${owner}`));
}

// ---- Offline expense drafts: one encrypted, owner-bound map per owner in the snapshots store ----
export interface LocalDraftFile { name: string; type: string; fingerprint?: string; path?: string; bytes: number[] }
export interface LocalDraft { id: string; data: Record<string, unknown>; files: LocalDraftFile[]; updatedAt: string }
type DraftMap = Record<string, LocalDraft>;
const draftKey = (owner: string) => `drafts:${owner}`;
async function readDraftMap(owner: string): Promise<DraftMap> {
  const v = await operation<Sealed | undefined>("snapshots", "readonly", (s) => s.get(draftKey(owner)));
  return v ? decryptOffline<DraftMap>(owner, v) : {};
}
const writeDraftMap = async (owner: string, m: DraftMap) => { const sealed = await encryptOffline(owner, m); return operation("snapshots", "readwrite", (s) => s.put(sealed, draftKey(owner))); };
export async function localDrafts(owner: string): Promise<LocalDraft[]> { return Object.values(await readDraftMap(owner)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export async function putLocalDraft(owner: string, d: LocalDraft) { const m = await readDraftMap(owner); m[d.id] = d; await writeDraftMap(owner, m); }
export async function removeLocalDraft(owner: string, id: string) { const m = await readDraftMap(owner); if (!(id in m)) return; delete m[id]; await writeDraftMap(owner, m); }
export async function fileToLocal(f: File, extra: { fingerprint?: string; path?: string } = {}): Promise<LocalDraftFile> { return { name: f.name, type: f.type, ...extra, bytes: Array.from(new Uint8Array(await f.arrayBuffer())) }; }
export const localToFile = (f: LocalDraftFile) => new File([new Uint8Array(f.bytes)], f.name, { type: f.type });

// Statement originals have a separate encrypted owner-bound queue, never a ledger entry.
export interface PendingOriginal { file: File; meta: import("./store").DocumentMeta }
interface StoredOriginal { file: LocalDraftFile; meta: import("./store").DocumentMeta }
const originalWrites = new Map<string, Promise<unknown>>();
async function originalMap(owner: string): Promise<Record<string, StoredOriginal>> {
  const value = await operation<Sealed | undefined>("snapshots", "readonly", s => s.get(`originals:${owner}`));
  return value ? decryptOffline<Record<string, StoredOriginal>>(owner, value) : {};
}
async function changeOriginals(owner: string, change: (rows: Record<string, StoredOriginal>) => Promise<void> | void) {
  const work = (originalWrites.get(owner) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const rows = await originalMap(owner); await change(rows);
    const sealed = await encryptOffline(owner, rows);
    await operation("snapshots", "readwrite", s => s.put(sealed, `originals:${owner}`));
  });
  originalWrites.set(owner, work);
  try { await work; } finally { if (originalWrites.get(owner) === work) originalWrites.delete(owner); }
}
export async function pendingOriginals(owner: string): Promise<PendingOriginal[]> {
  await originalWrites.get(owner);
  return Object.values(await originalMap(owner)).map(row => ({ file: localToFile(row.file), meta: row.meta }));
}
export async function keepOriginal(owner: string, row: PendingOriginal) {
  const id = row.meta.id;
  if (!id || !owner) throw new Error("Original needs an owner and stable document identity");
  await changeOriginals(owner, async rows => { rows[id] = { meta: row.meta, file: await fileToLocal(row.file) }; });
}
export async function removeOriginal(owner: string, id: string) {
  await changeOriginals(owner, rows => { delete rows[id]; });
}
