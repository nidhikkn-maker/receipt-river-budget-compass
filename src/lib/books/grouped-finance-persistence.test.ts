// @vitest-environment node
// Changed grouped workflows use disposable owner-scoped disk storage, never Cloud.
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it,expect } from 'vitest';
import { companyReportEntries } from './company-report';
import { advanceCrossProblems,proposeAdvanceAdjustment,advanceHeads,type GstAdvance } from './gst-special';
import { customerRecon } from './recon';
import { buildReport,toCsv,toExcel,type ReportKind } from '../reports';
import type { Expense } from '../expenses';
import type { GstInvoice } from './types';
it('persisted owner/company ledger produces all report families; reviewed lower-rate allocation survives retry/restart without duplicating source or payment',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledgerline-grouped-finance-'));let db=new PGlite(join(dir,'pg'));
 try{
 await db.exec(`CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('test.owner',true)$$;GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE records(id text PRIMARY KEY,owner text NOT NULL,data jsonb NOT NULL);ALTER TABLE records ENABLE ROW LEVEL SECURITY;CREATE POLICY own ON records TO authenticated USING(owner=auth.uid()) WITH CHECK(owner=auth.uid());GRANT SELECT,INSERT,UPDATE ON records TO authenticated;`);
 const expense:Expense={id:'bill-a',title:'Source invoice A',merchant:'Acme',category:'Other',scope:'business',memberId:null,splits:[],receipts:[{name:'invoice.png',path:'owner-a/doc-a',type:'image/png'}],amount:200.25,originalAmount:200.25,currency:'INR',fxRate:1,date:'2026-10-01',description:'Doc A',paymentMethod:'cash',accountId:'bank-a',department:'Sales',reconciledAt:'2026-10-02',statementRef:'doc-a',reimbursementStatus:'pending',reimbursement:{payer:'Acme',reimbursable:100,receipts:[{id:'r',txnId:'received',date:'2026-10-03',amount:50}]}};
 const ledger=[expense,{...expense,id:'received',title:'Claim payment',txnType:'reimbursement' as const,amount:50,originalAmount:50,receipts:[],reimbursement:undefined},{...expense,id:'other-company',accountId:'bank-b',amount:999}];
 // Persist concrete records with one stable identity per source; retries never append a second row.
 const persist=async(id:string,owner:string,data:unknown)=>db.query('INSERT INTO records VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO UPDATE SET data=excluded.data',[id,owner,JSON.stringify(data)]);
 for(const e of ledger)await persist(e.id,'owner-a',e);
 await persist('private','owner-b',{...expense,id:'private',amount:888});
 const inv:GstInvoice={id:'sale',gstin:'G',kind:'sales',number:'S1',date:'2026-10-01',party:'Acme',partyGstin:'',taxable:500,igst:60,cgst:0,sgst:0,cess:0};
 const advance:GstAdvance={id:'advance',gstin:'G',number:'A1',date:'2026-09-01',party:'Acme',partyGstin:'',supply:'services',taxable:1000,igst:180,cgst:0,sgst:0,cess:0,adjustments:[]};
 const adjusted={...advance,adjustments:[proposeAdvanceAdjustment(advance,inv,500,[advance])]};
 expect(advanceCrossProblems([adjusted],[inv])).toEqual([]);
 await persist('advance','owner-a',adjusted);await persist('advance','owner-a',adjusted);await persist('invoice','owner-a',inv);
 await db.close();db=new PGlite(join(dir,'pg'));
 await db.exec("SELECT set_config('test.owner','owner-a',false);SET ROLE authenticated;");
 const saved=(await db.query<{id:string;data:Expense}>('SELECT id,data FROM records WHERE id IN ($1,$2,$3,$4)',['bill-a','received','other-company','private'])).rows.map(r=>r.data);expect(saved).toHaveLength(3);
 const selected=companyReportEntries(saved,'a',{a:['bank-a'],b:['bank-b']});expect(selected).toHaveLength(2);
 const kinds:ReportKind[]=['expenses','business','categories','reimbursements','reimbursement-payments','departments'];
 for(const kind of kinds){const report=buildReport(kind,selected,()=> 'Owner A',{}, {departmentBudgets:{Sales:300},budgetMonth:'2026-10',claims:selected});
  const csv=toCsv(report);expect(csv).not.toMatch(/999|888|other-company|private/);expect(report.rows.length).toBeGreaterThan(0);
  const blob=await toExcel(report);writeFileSync(join(dir,`${kind}.xlsx`),new Uint8Array(await blob.arrayBuffer()));
  const {read,utils}=await import('xlsx');const book=read(readFileSync(join(dir,`${kind}.xlsx`)),{type:'buffer'});const sheet=book.Sheets['Report'];if(!sheet)throw Error('Missing report sheet');expect(utils.sheet_to_json(sheet,{header:1})).toEqual([report.headers,...report.rows]);
 }
 expect(buildReport('reimbursement-payments',selected,()=>'',{}, {claims:selected}).rows[0]?.[8]).toBe('50.00');
 const retained=(await db.query<{data:GstAdvance}>('SELECT data FROM records WHERE id=$1',['advance'])).rows[0]?.data;if(!retained)throw Error('Missing saved advance');expect(retained.adjustments).toHaveLength(1);expect(advanceHeads([retained],'G','2026-10').igst).toBe(-60);
 expect(customerRecon([inv],[{id:'p',amount:500,text:'Acme',date:'2026-10-02'}],'2026-10-01','2026-10-31')[0]).toMatchObject({invoiced:560,received:500,outstanding:60});
 await db.exec("RESET ROLE;SELECT set_config('test.owner','owner-b',false);SET ROLE authenticated;");expect((await db.query('SELECT * FROM records WHERE id=$1',['advance'])).rows).toEqual([]);
 expect((await db.query('SELECT * FROM records')).rows).toHaveLength(1);
 }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
},20000);