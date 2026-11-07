// Opt-in ACTUAL AI service acceptance; synthetic documents only. No auth/store mutations.
// Usage: bun scripts/check-actual-statement-extraction.ts /tmp/browser/actual-extraction
import { readFileSync, writeFileSync } from 'node:fs';
import { readStatementWithAI } from '../src/lib/statement-reader.server';
import { readStatement } from '../src/lib/statement-import';
import { fromStatementLines } from '../src/lib/statement-pipeline/line';
import { buildPlan } from '../src/lib/statement-pipeline/plan';
import { applyUpload, originalId } from '../src/lib/statement-pipeline/apply';
import { PGlite } from '@electric-sql/pglite';
import { accountBalance, cashflow, type Account } from '../src/lib/ledger';
import { buildReportDoc, emptyFilters } from '../src/lib/report-centre';
import type { Expense } from '../src/lib/expenses';
const root=process.argv[2];if(!root)throw Error('Supply synthetic fixture folder');
const results=[];
for(const [name,mime] of [['statement.csv','text/csv'],['scan.jpg','image/jpeg'],['scanned.pdf','application/pdf'],['text.pdf','application/pdf']]) {
 const bytes=readFileSync(`${root}/${name}`);const file=new File([bytes],name,{type:mime});
 const lines=mime==='text/csv'?await readStatement(file):await readStatementWithAI(`data:${mime};base64,${bytes.toString('base64')}`,mime);
 const assert=(ok:boolean,label:string)=>{if(!ok)throw Error(`${name}: ${label}`);};
 assert(lines.length===2&&lines.every(l=>(l.direction??'debit')==='debit')&&lines.map(l=>l.amount).sort((a,b)=>a-b).join()==='250,480','original rows/amount/direction');
 assert(lines.map(l=>l.date).sort().join()==='2026-10-02,2026-10-03','original dates');
 const db=new PGlite();
 try {
  await db.exec('CREATE TABLE entries(id text PRIMARY KEY,data jsonb); CREATE TABLE originals(id text PRIMARY KEY,bytes bytea);');
  const account:Account={id:'bank',name:'Synthetic bank',kind:'savings',openingBalance:1000,archived:false};
  const statement={name,accountId:'bank',hint:null,currency:'INR',opening:1000,closing:270,lines:fromStatementLines(name,lines)};
  const q=buildPlan([statement],[account],[],[{name:'Other',archived:false}]).accounts[0];if(!q)throw Error('No plan');
  const source=await originalId('synthetic-owner',await file.arrayBuffer());
  const req=[{account:q,decisions:[...q.auto,...q.ask],reconcileIds:[]}];
  const api={transactions:[],refresh:async()=>{},addAccount:async()=>{throw Error('Unexpected account');},setArchived:async()=>{},remove:async()=>{},
   prepareSource:async()=>{await db.query('INSERT INTO originals VALUES($1,$2) ON CONFLICT DO NOTHING',[source,bytes]);return source;},
   save:async(input:unknown,opts?:{createId?:string})=>{const i=input as Expense;await db.query('INSERT INTO entries VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',[opts?.createId,JSON.stringify({...i,id:opts?.createId,originalAmount:i.amount,fxRate:1,receipts:[],splits:[]})]);},
   reconcile:async(id:string,ref:string|null)=>{await db.query("UPDATE entries SET data=jsonb_set(data,'{statementRef}',$2::jsonb) WHERE id=$1",[id,JSON.stringify(ref)]);},
  };
  await applyUpload(req,api);await applyUpload(req,api);
  const saved=(await db.query<{data:Expense}>('SELECT data FROM entries')).rows.map(r=>r.data);
  assert(saved.length===2&&saved.every(e=>e.statementRef?.includes(source)??false),'duplicate prevention and source links');
  assert(accountBalance(account,saved)===270&&cashflow(saved).spent===730,'closing and spending');
  const report=buildReportDoc('monthly',emptyFilters('2026-10-01','2026-10-31'),{transactions:saved,accounts:[account],valuations:[],commitments:[],loans:[],budgets:{},trips:[],drafts:[],memberName:()=> 'Synthetic',accountName:()=>account.name,today:'2026-10-31'});
  assert(report.summary.some(row=>row[0]==='Total expenses'&&row[1]==='INR 730.00'),'report total');
  results.push({name,extraction:mime==='text/csv'?'actual deterministic CSV parser':'actual AI Gateway streaming / Astra',persistence:'disposable PostgreSQL adapters, not hosted Cloud',passed:true,rows:2,spent:730,closing:270,source});
  console.log(`${name}: PASS actual reading → isolated persistence → retry → report`);
 } finally {await db.close();}
}
writeFileSync(`${root}/connected-results.json`,JSON.stringify(results,null,2));