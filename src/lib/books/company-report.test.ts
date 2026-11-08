import {it,expect} from 'vitest';
import {companyReportEntries} from './company-report';
import {buildReport,toCsv,toExcel} from '../reports';
import type {Expense} from '../expenses';
it('company exports preserve manual ownership and account inheritance, exclude personal/other-company money, and produce real literal XLSX cells',async()=>{
 const base:Expense={id:'a',title:'A bill',merchant:null,category:'Other',scope:'business',memberId:null,splits:[],receipts:[],amount:200.25,originalAmount:200.25,currency:'INR',fxRate:1,date:'2026-10-01',description:'',paymentMethod:'cash',accountId:'bank-a'};
 const entries=[base,{...base,id:'manual',title:'Manual A',accountId:'bank-b',entityId:'a',entitySource:'manual' as const,amount:10.1},{...base,id:'other',title:'Other B',accountId:'bank-b',amount:999},{...base,id:'personal',title:'Personal',accountId:'cash',amount:888}];
 const selected=companyReportEntries(entries,'a',{a:['bank-a'],b:['bank-b']});expect(selected.map(e=>e.id)).toEqual(['a','manual']);
 expect(companyReportEntries(entries,'personal',{a:['bank-a'],b:['bank-b']}).map(e=>e.id)).toEqual(['personal']);
 const r=buildReport('expenses',selected,()=>'',{});expect(toCsv(r)).not.toMatch(/Other B|Personal|999|888/);expect(r.rows.map(x=>x[10])).toEqual(['200.25','10.10']);
 const {read,utils}=await import('xlsx');const w=read(await (await toExcel(r)).arrayBuffer(),{type:'array'});const sheet=w.Sheets['Report'];if(!sheet)throw Error('Missing report');expect(utils.sheet_to_json(sheet,{header:1})).toContainEqual(r.rows[0]);
});