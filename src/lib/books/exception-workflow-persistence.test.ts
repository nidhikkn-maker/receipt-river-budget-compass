// @vitest-environment node
// Disposable disk database only: changed reconciliation -> Inbox -> resolution -> frozen reports.
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';
import { reconciliationExceptions } from './reconciliation-exceptions';
import { continuousAudit } from './audit';
import { emptyBooks } from './types';
import { buildReportDoc, emptyFilters, type ReportData } from '../report-centre';
import { renderReportPdf } from '../report-pdf';
import { savePreparedReport } from '../report-save';
import type { Expense } from '../expenses';
import type { EntityProfile } from '../entities';
import type { VaultDoc } from '../documents';
it('company differences/missing bills persist, resolve from saved evidence, and freeze selected report families with interrupted-save replay',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledgerline-exception-batch-'));let db=new PGlite(join(dir,'pg'));
 const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
 try {
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE records(id text PRIMARY KEY,owner uuid,data jsonb);GRANT SELECT,INSERT,UPDATE ON records TO authenticated;ALTER TABLE records ENABLE ROW LEVEL SECURITY;CREATE POLICY own ON records TO authenticated USING(owner=auth.uid()) WITH CHECK(owner=auth.uid());`);
 await db.exec(readFileSync('drizzle/migrations/0028_report_history.sql','utf8').split('CREATE OR REPLACE FUNCTION public.delete_my_finance_data')[0]??'');
 const entities:EntityProfile[]=[{id:'A',name:'Alpha',kind:'company',pan:'',gstins:['GA'],booksFrom:'2026-27'},{id:'B',name:'Beta',kind:'company',pan:'',gstins:['GB'],booksFrom:'2026-27'}];
 const base:Expense={id:'a',title:'Alpha source bill',merchant:'Acme Traders',category:'Equipment',scope:'business',memberId:null,splits:[],receipts:[],amount:200.25,originalAmount:200.25,currency:'INR',fxRate:1,date:'2026-10-01',description:'',paymentMethod:'bank_transfer',accountId:'bank-a',statementRef:'statement-a',reconciledAt:null};
 const books={...emptyBooks(),entityAccounts:{A:['bank-a'],B:['bank-b']},gstInvoices:[{id:'invoice-a',gstin:'GA',kind:'purchase' as const,number:'A1',date:base.date,party:'Acme Traders',partyGstin:'',taxable:250.25,igst:0,cgst:0,sgst:0,cess:0,docId:'doc-a'},{id:'invoice-b',gstin:'GB',kind:'purchase' as const,number:'B1',date:base.date,party:'Acme Traders',partyGstin:'',taxable:999.99,igst:0,cgst:0,sgst:0,cess:0,docId:'doc-b'}]};
 const persist=async(id:string,data:unknown,who=owner)=>db.query('INSERT INTO records VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO UPDATE SET data=excluded.data',[id,who,JSON.stringify(data)]);
 await persist('a',base);await persist('b',{...base,id:'b',title:'Excluded Beta',accountId:'bank-b',amount:999.99,originalAmount:999.99});await persist('private',{...base,id:'private',amount:888.88},other);await persist('books',books);await persist('documents',[]);
 const user=async(who:string)=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('app.uid',$1,false)",[who]);await db.exec('SET ROLE authenticated');};
 const reload=async()=>{const rows=(await db.query<{id:string;data:unknown}>('SELECT id,data FROM records')).rows;return {entries:rows.filter(r=>['a','b','payment'].includes(r.id)).map(r=>r.data as Expense),books:rows.find(r=>r.id==='books')?.data as typeof books,docs:rows.find(r=>r.id==='documents')?.data as VaultDoc[]};};
 await user(owner);let saved=await reload();
 const accounts:ReportData['accounts']=[{id:'bank-a',name:'Alpha bank',kind:'savings',openingBalance:1000,archived:false},{id:'bank-b',name:'Excluded Beta bank',kind:'savings',openingBalance:10000,archived:false}];
 const input=()=>({today:'2026-10-31',entities,entries:saved.entries,docs:saved.docs,books:saved.books,accounts,loans:[],holdings:[]});
 expect(reconciliationExceptions(input())).toHaveLength(1);expect(reconciliationExceptions(input())[0]).toMatchObject({entity:'A',evidence:'statement-a',key:'recon:supplier:GA:Acme Traders:2026-27'});
 expect(reconciliationExceptions(input())[0]?.comparison?.left.inputs[0]?.documentIds).toEqual([]); // absent original is never claimed visible
 expect(continuousAudit({...input(),assets:[],holdingsWithoutCost:[]}).filter(i=>i.type==='Missing invoice')).toHaveLength(2);
 await db.close();db=new PGlite(join(dir,'pg'));await user(owner);saved=await reload();expect(reconciliationExceptions(input())[0]?.text).toContain('50.00');
 const payment={...base,id:'payment',title:'Acme Traders remainder',amount:50,originalAmount:50};await persist('payment',payment);await persist('payment',payment);
 const doc={id:'doc-a',title:'Retained Alpha invoice',transactionId:'a',docType:'invoice',docDate:base.date,createdAt:base.date,text:'Printed invoice 250.25',fields:[],files:[]} as unknown as VaultDoc;
 await persist('documents',[doc]);await db.close();db=new PGlite(join(dir,'pg'));await user(owner);saved=await reload();
 expect(saved.entries).toHaveLength(3);expect(reconciliationExceptions(input())).toEqual([]);expect(continuousAudit({...input(),assets:[],holdingsWithoutCost:[]}).filter(i=>i.type==='Missing invoice').map(i=>i.evidence)).not.toContain('Ledger entry a');
 const filters={...emptyFilters('2026-10-01','2026-10-31'),accountIds:['bank-a']};
 const data:ReportData={transactions:saved.entries,accounts,valuations:[],commitments:[],loans:[],trips:[],drafts:[],budgets:{Equipment:500},memberName:()=>'',accountName:id=>id??'',today:'2026-10-31'};
 const kinds=['monthly','expense','category','account','wealth','unreconciled','imports','budget'] as const;
 for(const [index,kind] of kinds.entries()){
  const report=buildReportDoc(kind,filters,data);expect(JSON.stringify(report)).not.toMatch(/Excluded Beta|999\.99|888\.88/);expect(report.sourceEntryIds).toEqual(['a','payment']);
  expect(report.figureEvidence?.find(f=>f.id==='balance:bank-a')).toMatchObject({amount:749.75,inputs:[{id:'bank-a',amount:1000},{id:'a',amount:-200.25},{id:'payment',amount:-50}]});
  const pdf=await renderReportPdf(report,'mono',new Date('2026-10-31T12:00:00Z'));const bytes=new Uint8Array(await pdf.arrayBuffer());const id=`00000000-0000-0000-0000-${String(index+101).padStart(12,'0')}`,path=`${owner}/reports/${id}.pdf`;let uploads=0,inserts=0,lose=false;
  const adapter={read:async()=>{if(lose){lose=false;return {data:null,error:Error('Interrupted read')};}return {data:(await db.query<{id:string;owner_id:string;file_path:string;file_size:number}>('SELECT id,owner_id,file_path,file_size FROM report_history WHERE id=$1',[id])).rows[0]??null,error:null};},upload:async()=>{uploads++;writeFileSync(join(dir,`${kind}.pdf`),bytes);return {error:null};},insert:async()=>{inserts++;await db.query('INSERT INTO report_history(id,owner_id,kind,title,filters,file_path,file_size) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',[id,owner,kind,report.title,JSON.stringify({snapshot:report}),path,pdf.size]);lose=true;throw Error('Lost response');}};
  await expect(savePreparedReport({id,owner,path,size:pdf.size},adapter)).rejects.toThrow('Evidence retained');
  await db.close();db=new PGlite(join(dir,'pg'));await user(owner);await savePreparedReport({id,owner,path,size:pdf.size},adapter);expect(uploads).toBe(1);expect(inserts).toBe(1);
  expect((await db.query<{filters:{snapshot:typeof report}}>('SELECT filters FROM report_history WHERE id=$1',[id])).rows[0]?.filters.snapshot.figureEvidence).toEqual(report.figureEvidence);
  const retained=readFileSync(join(dir,`${kind}.pdf`));expect(retained).toEqual(Buffer.from(bytes));
  const text=execFileSync('python3',['-c','from pypdf import PdfReader; import sys; print("\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages))',join(dir,`${kind}.pdf`)],{encoding:'utf8'});expect(text).not.toMatch(/Excluded Beta|999\.99|888\.88/);expect(text).toMatch(/250\.25|749\.75/);
 }
 expect((await db.query('SELECT * FROM report_history')).rows).toHaveLength(8);await user(other);expect((await db.query('SELECT * FROM report_history')).rows).toEqual([]);expect((await db.query('SELECT * FROM records')).rows).toHaveLength(1);
 } finally {await db.close();rmSync(dir,{recursive:true,force:true});}
},60000);