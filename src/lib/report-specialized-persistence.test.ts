// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {it,expect} from 'vitest';
import {REPORT_TYPES,buildReportDoc,emptyFilters,type ReportData} from './report-centre';
import {CORPORATE_TYPES} from './books/corporate-statements';
import {renderReportPdf} from './report-pdf';
import {savePreparedReport} from './report-save';
import type {Expense} from './expenses';
const done=new Set(['monthly','expense','category','account','wealth','unreconciled','imports','budget']);
// Company statements refuse a personal ledger by design; they are built from a company ledger in report-centre-all and corporate-statements tests.
const skip=new Set<string>([...done,...CORPORATE_TYPES]);
it('remaining report families freeze real PDFs and saved source records through lost replies and owner-isolated restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'specialized-reports-'));let db=new PGlite(join(dir,'db'));
 const owner='00000000-0000-0000-0000-000000000001';
 try{
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE sources(id text PRIMARY KEY,owner uuid,data jsonb);GRANT SELECT ON sources TO authenticated;ALTER TABLE sources ENABLE ROW LEVEL SECURITY;CREATE POLICY own ON sources TO authenticated USING(owner=auth.uid());`);
 await db.exec(readFileSync('drizzle/migrations/0028_report_history.sql','utf8').split('CREATE OR REPLACE FUNCTION public.delete_my_finance_data')[0]??'');
 const base:Expense={id:'bill',title:'Synthetic retained bill',merchant:'Original vendor',category:'Food',scope:'business',memberId:null,splits:[],receipts:[{name:'Original',path:'owner/bill-original',type:'application/pdf'}],date:'2026-10-10',amount:200.25,originalAmount:200.25,currency:'INR',fxRate:1,description:'',paymentMethod:'cash',accountId:'a',reconciledAt:null,statementRef:'source-statement',tags:['Trip: Isolated trip'],reimbursementStatus:'pending',reimbursement:{payer:'Company',receipts:[],writeOff:0} as never};
 const tx=[base,{...base,id:'salary',title:'Synthetic income',txnType:'income' as const,amount:500.5,originalAmount:500.5,receipts:[],reimbursementStatus:'none' as const}];
 await db.query('INSERT INTO sources VALUES($1,$2,$3::jsonb)', ['source',owner,JSON.stringify(tx)]);
 await db.query('INSERT INTO sources VALUES($1,$2,$3::jsonb)', ['private','00000000-0000-0000-0000-000000000002',JSON.stringify([{...base,id:'other',amount:88888}])]);
 const asOwner=async(who:string)=>{await db.exec('RESET ROLE');await db.query("select set_config('app.uid',$1,false)",[who]);await db.exec('SET ROLE authenticated');};await asOwner(owner);
 const saved=(await db.query<{data:Expense[]}>('SELECT data FROM sources')).rows[0]?.data??[];
 const data:ReportData={transactions:saved,accounts:[{id:'a',name:'Isolated account',kind:'savings',openingBalance:1000,archived:false}],valuations:[],loans:[{id:'loan',accountId:'a',name:'Synthetic loan',principal:1200.25,rate:9,emi:100.25,nextDue:'2026-11-05',provider:'Lender',status:'active',payments:[{date:'2026-10-10',principal:80,interest:20.25,total:100.25}]}],budgets:{Food:500},commitments:[{id:'sub',name:'Synthetic subscription',kind:'subscription',direction:'out',amount:100.25,frequency:'monthly',intervalDays:null,nextDue:'2026-11-05',accountId:'a',category:'Food',confirmed:true,essential:false,status:'active'}],trips:[{id:'trip',name:'Isolated trip',destination:'Synthetic',start:'2026-10-01',end:'2026-10-31',budget:500,currencies:['INR'],bookings:[{id:'booking',kind:'hotel',provider:'Synthetic hotel',ref:'BOOK1',date:'2026-10-10',amount:300.25,status:'unpaid',expenseId:'bill'}],advances:[{id:'advance',date:'2026-10-01',amount:150,source:'Synthetic employer'}]}],drafts:[{id:'draft',status:'ready',updatedAt:'2026-10-10',data:{merchant:'Synthetic draft',amount:75.25}}],memberName:()=> 'Owner',accountName:()=> 'Isolated account',today:'2026-10-31'};
 let count=0;
 for(const [kind] of REPORT_TYPES.filter(([kind])=>!skip.has(kind))){
  const report=buildReportDoc(kind,{...emptyFilters('2026-10-01','2026-10-31'),accountIds:['a']},data);
  expect(report.sourceEntryIds).toEqual(['bill','salary']);expect(report.sourceDocumentRefs).toContain('owner/bill-original');
  const blob=await renderReportPdf(report,'mono',new Date('2026-10-31T12:00:00Z'));const bytes=new Uint8Array(await blob.arrayBuffer());
  const id=`00000000-0000-0000-0000-${String(++count+200).padStart(12,'0')}`,path=`${owner}/reports/${id}.pdf`;let uploaded=0,inserted=0,lose=false;
  const adapter={read:async()=>{if(lose){lose=false;return {data:null,error:Error('Interrupted read')};}return {data:(await db.query<{id:string;owner_id:string;file_path:string;file_size:number}>('SELECT id,owner_id,file_path,file_size FROM report_history WHERE id=$1',[id])).rows[0]??null,error:null};},upload:async()=>{uploaded++;writeFileSync(join(dir,`${kind}.pdf`),bytes);return {error:null};},insert:async()=>{inserted++;await db.query('INSERT INTO report_history(id,owner_id,kind,title,filters,file_path,file_size) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',[id,owner,kind,report.title,JSON.stringify({snapshot:report}),path,blob.size]);lose=true;throw Error('Committed reply lost');}};
  await expect(savePreparedReport({id,owner,path,size:blob.size},adapter)).rejects.toThrow('Evidence retained');
  if(count===1||kind==='trip-summary'){await db.close();db=new PGlite(join(dir,'db'));await asOwner(owner);}
  await savePreparedReport({id,owner,path,size:blob.size},adapter);expect(uploaded).toBe(1);expect(inserted).toBe(1);
  const frozen=(await db.query<{filters:{snapshot:typeof report}}>('SELECT filters FROM report_history WHERE id=$1',[id])).rows[0]?.filters.snapshot;
  expect(frozen).toEqual(report);expect(readFileSync(join(dir,`${kind}.pdf`))).toEqual(Buffer.from(bytes));
  const text=execFileSync('python3',['-c','from pypdf import PdfReader;import sys;print("\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages))',join(dir,`${kind}.pdf`)],{encoding:'utf8'});
  expect(text).not.toContain('88888');
  if(kind==='loan')expect(text).toContain('1,200.25');
  if(kind==='trip-summary')expect(text).toContain('200.25');
  if(kind==='subscription')expect(text).toContain('100.25');
  if(kind==='drafts')expect(text).toContain('75.25');
 }
 expect((await db.query('SELECT * FROM report_history')).rows).toHaveLength(REPORT_TYPES.length-skip.size);
 await db.close();db=new PGlite(join(dir,'db'));await asOwner(owner);expect((await db.query('SELECT * FROM report_history')).rows).toHaveLength(count);
 await asOwner('00000000-0000-0000-0000-000000000002');expect((await db.query('SELECT * FROM report_history')).rows).toEqual([]);expect((await db.query('SELECT * FROM sources')).rows).toHaveLength(1);
 }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
},60000);
