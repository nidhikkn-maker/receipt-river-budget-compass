import type { ExpenseInput } from "./expenses";
export interface PendingEntry { id:string; owner:string; input:ExpenseInput; files:File[]; createdAt:string }
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open("ledgerline-offline",1);r.onupgradeneeded=()=>{r.result.createObjectStore("entries",{keyPath:"id"});r.result.createObjectStore("snapshots");};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function operation<T>(store:string,mode:IDBTransactionMode,action:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const d=await db();try{return await new Promise<T>((resolve,reject)=>{const tx=d.transaction(store,mode);const r=action(tx.objectStore(store));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{d.close();}}
export const queueEntry=(entry:PendingEntry)=>operation("entries","readwrite",s=>s.put(entry));
export const pendingEntries=async(owner:string)=>(await operation<PendingEntry[]>("entries","readonly",s=>s.getAll())).filter(e=>e.owner===owner);
export const removePending=(id:string)=>operation("entries","readwrite",s=>s.delete(id));
export const putSnapshot=(owner:string,data:unknown)=>operation("snapshots","readwrite",s=>s.put(data,owner));
export const getSnapshot=<T>(owner:string)=>operation<T|undefined>("snapshots","readonly",s=>s.get(owner));
