// @vitest-environment node
import { it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corporateStatements,CORPORATE_TYPES } from './corporate-statements';
import { buildReportDoc,emptyFilters } from '../report-centre';
import { renderReportPdf } from '../report-pdf';
import { savePreparedReport } from '../report-save';
import type { Expense } from '../expenses';
import { emptyBooks } from './types';

it('saved company ledger → all five frozen statements → owner-denied read → lost reply/restart recovery preserves exact originals and single report',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'corporate-ledger-'));let db=new PGlite(join(dir,'db'));
 const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
 const books={...emptyBooks(),entityAccounts:{A:['bank'],B:['other-bank']}};
 const entities=[{id:'A',name:'Synthetic Corporate Ltd',kind:'company' as const,pan:'',gstins:[],booksFrom:'2026-27'}];
 const accounts=[{id:'bank',name:'Corporate bank',kind:'current' as const,openingBalance:1000,archived:false}];
 const e:Expense={id:'bill',title:'Synthetic original bill',merchant:'Supplier',category:'Office',scope:'business',memberId:null,splits:[],receipts:[{path:`${owner}/original.pdf`,name:'original.pdf',type:'application/pdf'}],amount:100.25,originalAmount:100.25,currency:'INR',fxRate:1,date:'2026-04-10',description:'',paymentMethod:'bank_transfer',accountId:'bank',statementRef:'line-1',reconciledAt:'2026-04-30'};
 const user=async(who:string)=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('app.uid',$1,false)",[who]);await db.exec('SET ROLE authenticated');};
 try{
  await db.exec(`CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE records(id text PRIMARY KEY,owner uuid,data jsonb);ALTER TABLE records ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE ON records TO authenticated;CREATE POLICY own ON records TO authenticated USING(owner=auth.uid()) WITH CHECK(owner=auth.uid());`);
  await db.exec(readFileSync('drizzle/migrations/0028_report_history.sql','utf8').split('CREATE OR REPLACE FUNCTION public.delete_my_finance_data')[0]??'');
  await user(owner);await db.query('INSERT INTO records VALUES($1,$2,$3::jsonb)',['bill',owner,JSON.stringify(e)]);
  await db.close();db=new PGlite(join(dir,'db'));await user(owner);
  const entries=(await db.query<{data:Expense}>('SELECT data FROM records')).rows.map(r=>r.data);
  expect(corporateStatements({entityId:'A',entities,entries,accounts,books,documents:[],from:'2026-04-01',to:'2027-03-31'}).profit).toBe(-100.25);
  for(const [index,type] of CORPORATE_TYPES.entries()){
   const doc=buildReportDoc(type,{...emptyFilters('2026-04-01','2027-03-31'),entityId:'A'},{transactions:entries,accounts,books,entities,documents:[],valuations:[],commitments:[],loans:[],budgets:{},trips:[],drafts:[],memberName:()=>'',accountName:()=>'',today:'2026-11-08'});
   const pdf=await renderReportPdf(doc,'mono',new Date('2026-11-08T07:00:00Z'));expect(pdf.size).toBeGreaterThan(1000);
   const bytes=new Uint8Array(await pdf.arrayBuffer()),id=`00000000-0000-0000-0000-${String(301+index).padStart(12,'0')}`,path=`${owner}/reports/${id}.pdf`;let uploads=0,inserts=0,lose=false;
   const adapter={read:async()=>{if(lose){lose=false;return {data:null,error:Error('Interrupted readback')};}return {data:(await db.query<{id:string;owner_id:string;file_path:string;file_size:number}>('SELECT id,owner_id,file_path,file_size FROM report_history WHERE id=$1',[id])).rows[0]??null,error:null};},upload:async()=>{uploads++;writeFileSync(join(dir,`${type}.pdf`),bytes);return {error:null};},insert:async()=>{inserts++;await db.query('INSERT INTO report_history(id,owner_id,kind,title,filters,file_path,file_size) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',[id,owner,type,doc.title,JSON.stringify({snapshot:doc}),path,pdf.size]);lose=true;throw Error('Lost committed response');}};
   await expect(savePreparedReport({id,owner,path,size:pdf.size},adapter)).rejects.toThrow('Evidence retained');
   await db.close();db=new PGlite(join(dir,'db'));await user(owner);await savePreparedReport({id,owner,path,size:pdf.size},adapter);
   expect(uploads).toBe(1);expect(inserts).toBe(1);expect(readFileSync(join(dir,`${type}.pdf`))).toEqual(Buffer.from(bytes));
   const frozen=(await db.query<{filters:{snapshot:typeof doc}}>('SELECT filters FROM report_history WHERE id=$1',[id])).rows[0]?.filters.snapshot;
   expect(frozen?.corporateWorking?.profit).toBe(-100.25);expect(frozen?.sourceDocumentRefs).toEqual([`${owner}/original.pdf`]);
  }
  await db.query('UPDATE records SET data=$1::jsonb WHERE id=$2',[JSON.stringify({...e,amount:200.5}),'bill']);
  const history=(await db.query<{filters:{snapshot:{corporateWorking:{profit:number}}}}>('SELECT filters FROM report_history')).rows;
  expect(history).toHaveLength(5);expect(history.every(r=>r.filters.snapshot.corporateWorking.profit===-100.25)).toBe(true);
  await user(other);expect((await db.query('SELECT * FROM report_history')).rows).toEqual([]);expect((await db.query('SELECT * FROM records')).rows).toEqual([]);
 }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
},60000);