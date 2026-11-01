import { createContext,useContext,useState,type ReactNode } from 'react';
import { defaultPreferences } from '../../src/lib/preferences';
import type { Expense } from '../../src/lib/expenses';
const initial:Expense[]=Array.from({length:91},(_,n)=>({id:`review-${n}`,title:`Controlled ${n}`,merchant:`Merchant ${n}`,category:'Miscellaneous',scope:'personal',memberId:null,splits:[],amount:n+1,originalAmount:n+1,currency:'INR',fxRate:1,paymentMethod:'upi',reconciledAt:null,statementRef:null,date:'2026-04-01',description:`Source narration ${n}`,receipts:[],accountId:'bank',txnType:'expense'}));
const fixture=((window as unknown as {inboxFixture?: {transactions:Expense[];saves:string[][];failNextSave:boolean;prior:Expense[];context:unknown}}).inboxFixture??={transactions:JSON.parse(sessionStorage.getItem('inbox-test-records')??JSON.stringify(initial)) as Expense[],saves:[] as string[][],failNextSave:false,prior:[] as Expense[],context:undefined as unknown});
Object.assign(window,{inboxFixture:fixture});
const Context=((window as unknown as {isolatedInboxContext?: ReturnType<typeof createContext<ReturnType<typeof makeStore>|null>>}).isolatedInboxContext??=createContext<ReturnType<typeof makeStore>|null>(null));
function makeStore(entries:Expense[],update:(e:Expense[])=>void){return {userId:'isolated-review-owner',transactions:entries,expenses:entries,transferCounterparts:[],accounts:[{id:'bank',name:'Controlled bank',kind:'savings',archived:false,openingBalance:10000}],preferences:defaultPreferences(),commitments:[],pendingCount:0,memberName:()=> 'Me',history:async()=>[],refresh:async()=>{},categoryHistory:async()=>[],financialCorrectionHistory:async()=>[],reviewMetadataHistory:async()=>[],bulkSetCategory:async(ids:string[],category:string)=>{if(fixture.failNextSave){fixture.failNextSave=false;throw Error('Controlled interrupted save');}fixture.prior=fixture.transactions.map(e=>({...e}));fixture.transactions=fixture.transactions.map(e=>ids.includes(e.id)?{...e,category}:e);fixture.saves.push(ids);sessionStorage.setItem('inbox-test-records',JSON.stringify(fixture.transactions));update([...fixture.transactions]);return 'controlled-batch';},undoCategoryBatch:async()=>{fixture.transactions=fixture.prior;sessionStorage.setItem('inbox-test-records',JSON.stringify(fixture.transactions));update([...fixture.transactions]);}};}
export function StoreFixture({children}:{children:ReactNode}){const [entries,update]=useState(fixture.transactions);return <Context.Provider value={makeStore(entries,update)}>{children}</Context.Provider>;}
export function useStore(){const store=useContext(Context);if(!store)throw Error('Isolated store required');return store;}
export const listImportRules=async()=>[];
export const listImports=async()=>[];
export const statementEvidence=async()=>{throw Error('No statement fixture');};
export const readReviewContext=async()=>fixture.context;
export const writeReviewContext=async(_owner:string,value:unknown)=>{fixture.context=value;};
export const supabase={from:()=>{const q={select:()=>q,in:()=>q,order:()=>q,limit:()=>q,gte:()=>q,then:(resolve:(v:unknown)=>void)=>resolve({data:[],error:null})};return q;}};
export const localDrafts=async()=>[];

export const localToFile=()=>null;
export const putLocalDraft=async()=>{};
export const removeLocalDraft=async()=>{};
export const fileToLocal=async()=>({});

export const listImportRows=async()=>[];
export const reviseRows=async()=>{throw Error("Test cannot revise real imports");};
