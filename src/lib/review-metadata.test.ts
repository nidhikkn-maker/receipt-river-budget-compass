import { it,expect } from 'vitest';
import { metadataPreview,metadataStillCurrent } from './review-metadata';
import { defaultPreferences } from './preferences';
import type { Expense } from './expenses';
import type { FinancialReview } from './financial-review';
import type { Account } from './ledger';
const e:Expense={id:'test',title:'Test',merchant:'Train',amount:1000,originalAmount:10,fxRate:100,currency:'USD',date:'2026-04-01',description:'Source',category:'Travel',scope:'personal',memberId:null,splits:[],receipts:[],paymentMethod:'other',accountId:'bank',reconciledAt:null,statementRef:null};
const row=(transaction:Expense):FinancialReview=>({transaction,issues:[],group:'category',confidence:'low',status:'Unresolved',evidence:[],targetAccountIds:[]});
const prefs={...defaultPreferences(),tags:[{group:'Organisation',name:'AET'}]};
it('non-trip organisation preserves original currency source and requires current records',()=>{const p=metadataPreview([row(e)],new Map([[e.id,{organisation:'AET'}]]),prefs,[]);expect(p.after[0]).toMatchObject({department:'AET',originalAmount:10,amount:1000,description:'Source',accountId:'bank'});expect(metadataStillCurrent(p,[e],prefs,[])).toBe(true);expect(metadataStillCurrent(p,[{...e,correctionRevision:1}],prefs,[])).toBe(false);});
it('claimed entries remain excluded instead of silently changing responsibility',()=>{const p=metadataPreview([row(e),row({...e,id:'claim',reimbursementStatus:'pending'})],new Map([[e.id,{organisation:'AET'}],['claim',{organisation:'AET'}]]),prefs,[]);expect(p.items.map(i=>i.id)).toEqual(['test']);expect(p.excluded[0]?.id).toBe('claim');});
it('combined category workspace organisation and activity changes preserve original money and source',()=>{
 const configured={...prefs,categories:[{name:'Office & Supplies',archived:false}],tags:[...prefs.tags,{group:'Project',name:'Audit'}]};
 const patch={category:'Office & Supplies',scope:'official' as const,organisation:'AET',tag:'Project: Audit'};
 const p=metadataPreview([row(e)],new Map([[e.id,patch]]),configured,[]);
 expect(p.items[0]?.patch).toEqual(patch);
 expect(p.after[0]).toMatchObject({category:'Office & Supplies',scope:'official',department:'AET',tags:['Project: Audit'],amount:1000,originalAmount:10,fxRate:100,currency:'USD',accountId:'bank',description:'Source'});
 expect(e.scope).toBe('personal');
});
it('mixed bulk mapping retains eligible expenses and excludes claims, splits and financial movements',()=>{
 const records:Expense[]=[e,{...e,id:'claim',reimbursementStatus:'pending'},{...e,id:'split',workspaceAllocations:[{workspace:'personal',amount:1000}]},{...e,id:'move',txnType:'transfer',toAccountId:'other'}];
 const p=metadataPreview(records.map(row),new Map(records.map(t=>[t.id,{scope:'official' as const}])),prefs,[]);
 expect(p.selected).toBe(4);expect(p.items.map(t=>t.id)).toEqual(['test']);
 expect(p.excluded.map(t=>t.id)).toEqual(['claim','split','move']);
 expect(p.after[0]).toMatchObject({scope:'official',accountId:'bank',amount:1000,originalAmount:10});
 expect(records.every(t=>t.scope==='personal')).toBe(true);
});
it('bulk payment mapping never moves accounts or accepts an archived instrument',()=>{
 const bank:Account={id:'bank',name:'Bank',kind:'savings',openingBalance:0,archived:false};
 const instrument={id:'upi',nickname:'UPI',type:'upi' as const,accountId:'bank',archived:false};
 const configured={...prefs,paymentInstruments:[instrument]};
 const other={...e,id:'other',accountId:'elsewhere'};
 const p=metadataPreview([row(e),row(other)],new Map([[e.id,{paymentInstrumentId:'upi'}],[other.id,{paymentInstrumentId:'upi'}]]),configured,[bank]);
 expect(p.items.map(t=>t.id)).toEqual(['test']);expect(p.excluded.map(t=>t.id)).toEqual(['other']);
 expect(p.after[0]).toMatchObject({accountId:'bank',paymentInstrumentId:'upi',paymentMethod:'upi'});
 expect(()=>metadataPreview([row(e)],new Map([[e.id,{paymentInstrumentId:'upi'}]]),{...configured,paymentInstruments:[{...instrument,archived:true}]},[bank])).toThrow('No selected');
 expect(metadataStillCurrent(p,[e,other],{...configured,paymentInstruments:[]},[bank])).toBe(false);
});