// @vitest-environment node
// Real PDF and applied ownership SQL in disposable disk storage; no Cloud calls.
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildReportDoc,emptyFilters,type ReportData } from './report-centre';
import { renderReportPdf } from './report-pdf';
import { savePreparedReport } from './report-save';
import type { Expense } from './expenses';
it('owner/entity source figures freeze in a real PDF; lost insert and readback recover after disk restart without replacing bytes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ledgerline-frozen-report-'));
 let db=new PGlite(join(dir,'pg'));
 const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',id='00000000-0000-0000-0000-000000000101',path=owner+'/reports/'+id+'.pdf';
 try{
  await db.exec(`CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;`);
  const migration=readFileSync('drizzle/migrations/0028_report_history.sql','utf8');
  await db.exec(migration.split('CREATE OR REPLACE FUNCTION public.delete_my_finance_data')[0] ?? '');
  await db.exec(`CREATE TABLE expenses(id text PRIMARY KEY,owner_id uuid,data jsonb);GRANT SELECT ON expenses TO authenticated;ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;CREATE POLICY owner_read ON expenses TO authenticated USING(owner_id=auth.uid());`);
  const base:Expense={id:'source-a',title:'SOURCE-A-INVOICE',merchant:'Synthetic supplier',category:'Equipment',scope:'business',memberId:null,splits:[],receipts:[],amount:200.25,originalAmount:200.25,currency:'INR',fxRate:1,date:'2026-10-02',description:'Synthetic original invoice A',paymentMethod:'bank_transfer',accountId:'bank-a',entityId:'entity-a',reconciledAt:'2026-10-03',statementRef:'document-a'};
  for(const [who,e] of [[owner,base],[owner,{...base,id:'source-b',title:'OTHER-ENTITY',accountId:'bank-b',entityId:'entity-b',amount:999.99}],[other,{...base,id:'private',title:'OTHER-OWNER',amount:888.88}]] as const){await db.query('INSERT INTO expenses VALUES($1,$2,$3::jsonb)',[e.id,who,JSON.stringify(e)]);}
  async function user(who:string){await db.query("SELECT set_config('app.uid',$1,false)",[who]);await db.exec('SET ROLE authenticated');}
  await user(owner);
  const visible=(await db.query<{data:Expense}>('SELECT data FROM expenses')).rows.map(x=>x.data);
  expect(visible.map(x=>x.id).sort()).toEqual(['source-a','source-b']);
  const data:ReportData={transactions:visible,accounts:[],valuations:[],commitments:[],loans:[],budgets:{},trips:[],drafts:[],memberName:()=>'',accountName:()=> 'Synthetic bank',today:'2026-10-31'};
  const filters={...emptyFilters('2026-10-01','2026-10-31'),accountIds:['bank-a']};
  const report=buildReportDoc('expense',filters,data);
  expect(report.sections.find(s=>s.title==='Expense entries')?.rows).toHaveLength(1);expect(report.summary).toContainEqual(['Entries','1']);expect(JSON.stringify(report)).toContain('200.25');expect(JSON.stringify(report)).not.toMatch(/OTHER-ENTITY|OTHER-OWNER|999.99|888.88/);
  const pdf=await renderReportPdf(report,'mono',new Date('2026-10-31T12:00:00Z'));
  const bytes=new Uint8Array(await pdf.arrayBuffer());
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  // Real jsPDF table values are text operators, not a mocked PDF prefix.
  const text=new TextDecoder().decode(bytes);expect(text).toMatch(/SOURCE-A/);expect(text).toContain('200.25');expect(text).not.toMatch(/OTHER-ENTITY|OTHER-OWNER|999.99|888.88/);
  const frozenHash=await crypto.subtle.digest('SHA-256',bytes);
  const expected={id,path,size:pdf.size,owner};let uploads=0,inserts=0,loseRead=false;
  const adapter={
   read:async()=>{if(loseRead){loseRead=false;return {data:null,error:Error('Lost readback')};}return {data:(await db.query<{id:string;owner_id:string;file_path:string;file_size:number}>('SELECT id,owner_id,file_path,file_size FROM report_history WHERE id=$1',[id])).rows[0]??null,error:null};},
   upload:async()=>{uploads++;writeFileSync(join(dir,'frozen.pdf'),bytes);return {error:null};},
   insert:async()=>{inserts++;await db.query('INSERT INTO report_history(id,owner_id,kind,title,period_from,period_to,filters,file_path,file_size) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',[id,owner,'expense',report.title,filters.from,filters.to,JSON.stringify({...filters,sourceIds:['source-a'],sourceDocuments:['document-a']}),path,pdf.size]);loseRead=true;throw Error('Lost insert reply');},
  };
  await expect(savePreparedReport(expected,adapter)).rejects.toThrow('could not be confirmed');
  await db.close();db=new PGlite(join(dir,'pg'));await user(owner);
  await savePreparedReport(expected,adapter);expect(uploads).toBe(1);expect(inserts).toBe(1);
  await db.exec('RESET ROLE');await db.query('UPDATE expenses SET data=$1::jsonb WHERE id=$2',[JSON.stringify({...base,amount:350}),base.id]);await user(owner);
  const retained=readFileSync(join(dir,'frozen.pdf'));expect(retained).toEqual(Buffer.from(bytes));expect(await crypto.subtle.digest('SHA-256',retained)).toEqual(frozenHash);
  const history=(await db.query<{filters:{sourceIds:string[];sourceDocuments:string[]}}>('SELECT filters FROM report_history')).rows[0];expect(history?.filters).toMatchObject({sourceIds:['source-a'],sourceDocuments:['document-a']});
  await db.exec('RESET ROLE');await user(other);expect((await db.query('SELECT * FROM report_history')).rows).toEqual([]);
  await expect(db.query('INSERT INTO report_history(id,owner_id,kind,title,file_path) VALUES($1,$2,$3,$4,$5)',['00000000-0000-0000-0000-000000000102',owner,'expense','Wrong owner',path])).rejects.toThrow(/row-level security/);
 }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
},20000);