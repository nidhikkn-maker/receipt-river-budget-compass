import { supabase } from '@/integrations/supabase/client';
import { encryptOffline,decryptOffline } from './offline';
import type { Json } from '@/integrations/supabase/types';
import type { Claimant } from './expense-claim';
import type { Database } from '@/integrations/supabase/types';
export interface ClaimPreparationData { choice:string;picked:string[];excluded:string[];organisation:string;profileId:string;routeId:string;accountId:string;claimant:Claimant;purpose:string;from:string;to:string;format:'detailed'|'summary';rejected:string[];advanceInput?:string }
/** Explicit purchases must match as a set; "entries" alone cannot identify a preparation. */
export function sameClaimSubject(a:ClaimPreparationData,b:ClaimPreparationData){return a.choice===b.choice&&(a.choice!=='entries'||JSON.stringify([...new Set(a.picked)].sort())===JSON.stringify([...new Set(b.picked)].sort()));}
export interface ClaimPreparation { id:string;data:ClaimPreparationData;revision:number;mutationId:string;updatedAt:string }
const inFlight=new Map<string,Promise<unknown>>();
function localDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('ledgerline-claim-preparations',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function localOp<T>(mode:IDBTransactionMode,key:string,value?:unknown):Promise<T>{const db=await localDB();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction('drafts',mode);const s=tx.objectStore('drafts');const r=mode==='readonly'?s.get(key):s.put(value,key);tx.oncomplete=()=>resolve(r.result as T);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function saveLocalPreparation(owner:string,p:ClaimPreparation){await localOp('readwrite',owner,await encryptOffline(owner,p));}
export async function loadLocalPreparation(owner:string){const sealed=await localOp<Awaited<ReturnType<typeof encryptOffline>>|undefined>('readonly',owner);return sealed?decryptOffline<ClaimPreparation>(owner,sealed):null;}
export async function loadCloudPreparation(owner:string,id?:string){const q=supabase.from('claim_preparations').select('*').eq('owner_id',owner);const {data,error}=id?await q.eq('id',id).maybeSingle():await q.order('updated_at',{ascending:false}).limit(1).maybeSingle();if(error)throw Error(error.message);return data?{id:data.id,data:data.data as unknown as ClaimPreparationData,revision:data.revision,mutationId:data.mutation_id,updatedAt:data.updated_at}:null;}
export async function saveCloudPreparation(owner:string,p:ClaimPreparation){
 const key=`${owner}:${p.id}`;const previous=inFlight.get(key)??Promise.resolve();
 const operation=previous.catch(()=>{}).then(async()=>{const {data,error}=await supabase.rpc('save_claim_preparation',{_id:p.id,_data:p.data as unknown as Json,_expected:p.revision,_mutation:p.mutationId});if(error)throw Error(error.message);if(!data)throw Error('Preparation was not saved');return {...p,revision:data.revision,updatedAt:data.updated_at};});
 inFlight.set(key,operation);try{return await operation;}finally{if(inFlight.get(key)===operation)inFlight.delete(key);}
}
export async function clearLocalPreparations(owner:string){const db=await localDB();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').delete(owner);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export interface ClaimReportJob { id:string;path:string;name:string;activity:string;bytes:number[];missing:string[];row:Database['public']['Tables']['report_history']['Insert'] }
export async function saveLocalClaimReport(owner:string,job:ClaimReportJob){await localOp('readwrite',`${owner}:report`,await encryptOffline(owner,job));}
export async function loadLocalClaimReport(owner:string){const sealed=await localOp<Awaited<ReturnType<typeof encryptOffline>>|undefined>('readonly',`${owner}:report`);return sealed?decryptOffline<ClaimReportJob>(owner,sealed):null;}
export async function clearLocalClaimReport(owner:string){const db=await localDB();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').delete(`${owner}:report`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}