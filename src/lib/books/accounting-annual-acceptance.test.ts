// @vitest-environment node
import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
import {corporateStatements,corporateCloseErrors,corporateReport} from './corporate-statements';
import {corporateAuditPack} from './corporate-audit-pack';
import {statutorySchedules,type StatutoryHead} from './statutory-mappings';
import {reverseAccountingJournal,type AccountingJournal,type AccountingLeg} from './accounting-journal';
import {postAccountingWithRecovery,type AccountingReceipt} from './accounting-post';
import {readStatement} from '../statement-import';
import {emptyBooks} from './types';
import type {Expense} from '../expenses';
import type {VaultDoc} from '../documents';
import {sumMoney} from '../money';

it('12-month disposable company: persisted balanced journals, real CSV extraction, statements, source ZIP, correction, restart, review and fail-closed close',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'annual-accounting-'));let db=new PGlite(join(dir,'db'));
 const uid=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const owner=uid(1),other=uid(2),accountant=uid(3),bank=uid(4),second=uid(5),loan=uid(6),asset=uid(7);
 const entities=[{id:'A',name:'Synthetic Meridian Engineering Ltd',kind:'company' as const,pan:'',gstins:[],booksFrom:'2025-26'}];
 const accounts=[{id:bank,name:'Operating bank',kind:'current' as const,openingBalance:0,archived:false},{id:second,name:'Reserve bank',kind:'current' as const,openingBalance:0,archived:false},{id:loan,name:'Equipment loan',kind:'loan' as const,openingBalance:0,archived:false},{id:asset,name:'Plant equipment',kind:'other_asset' as const,openingBalance:0,archived:false}];
 const books={...emptyBooks(),entityAccounts:{A:accounts.map(a=>a.id)}};const documents:VaultDoc[]=[];const originals=new Map<string,Uint8Array>();let sequence=100;const journals:AccountingJournal[]=[];
 const user=async(id:string)=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('app.uid',$1,false)",[id]);await db.exec('SET ROLE authenticated');};
 const leg=(code:string,role:AccountingLeg['role'],signed:number,head:StatutoryHead,accountId?:string,cashFlow?:AccountingLeg['cashFlow']):AccountingLeg=>({code,label:code,role,debit:Math.max(0,signed),credit:Math.max(0,-signed),statutory:{head,status:'confirmed',framework:'Schedule III Division I',basis:'Explicit synthetic company reviewed classification'},...(accountId?{accountId}:{}),...(cashFlow?{cashFlow}:{})});
 const cash=(signed:number,bucket:AccountingLeg['cashFlow']='operating')=>leg(`account:${bank}`,'asset',signed,'cash',bank,bucket);
 const make=async(date:string,description:string,legs:AccountingLeg[],kind:AccountingJournal['kind']='accrual')=>{
  const id=uid(sequence++),docId=uid(sequence++),path=`${owner}/synthetic/${docId}.txt`;const text=['SYNTHETIC ISOLATED COMPANY ONLY',entities[0]?.name,date,description,...legs.map(l=>`${l.code}: debit ${l.debit.toFixed(2)} credit ${l.credit.toFixed(2)}`)].join('\n');
  const bytes=new TextEncoder().encode(text);originals.set(path,bytes);writeFileSync(join(dir,`${docId}.txt`),bytes);
  documents.push({id:docId,entityId:'A',filePath:path,fileName:`${docId}.txt`,docDate:date,size:bytes.length,mimeType:'text/plain'} as VaultDoc);
  await db.exec('RESET ROLE');await db.query('INSERT INTO documents VALUES($1,$2,$3,$4,false,$5,NULL)',[docId,owner,'A',path,date]);await user(owner);
  return {id,entityId:'A',date,kind,description,documentIds:[docId],legs} satisfies AccountingJournal;
 };
 const post=async(j:AccountingJournal)=>{const rev=(await db.query<{revision:number}>('SELECT revision FROM finance_preferences')).rows[0]?.revision??0;await db.query('SELECT post_accounting_journal($1,$2::jsonb,$3)',[j.id,JSON.stringify(j),rev]);if(!journals.some(v=>v.id===j.id))journals.push(j);};
 const entries=async()=> (await db.query<Record<string,unknown>>('SELECT * FROM expenses ORDER BY expense_date,id')).rows.map(r=>({id:r['id'],title:r['title'],category:r['category'],scope:'business',amount:Number(r['amount']),originalAmount:Number(r['original_amount']),date:r['expense_date'] instanceof Date?r['expense_date'].toISOString().slice(0,10):String(r['expense_date']).slice(0,10),txnType:r['txn_type'],accountId:r['account_id'],adjustmentSign:r['adjustment_sign'],entityId:r['entity_id'],entitySource:r['entity_source'],receiptDetails:r['receipt_details'],merchant:null,memberId:null,splits:[],receipts:[],currency:'INR',fxRate:1,reconciledAt:r['reconciled_at']?String(r['reconciled_at']):null,statementRef:r['statement_ref'],description:r['description'],paymentMethod:'other'} as Expense));
 const working=async()=>corporateStatements({entityId:'A',entities,books,accounts,documents,entries:await entries(),from:'2025-04-01',to:'2026-03-31'});
 try{
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb,revision bigint DEFAULT 0,updated_at timestamptz);GRANT SELECT ON finance_preferences TO authenticated;ALTER TABLE finance_preferences ENABLE ROW LEVEL SECURITY;CREATE POLICY own_preferences ON finance_preferences TO authenticated USING(owner_id=auth.uid());
 CREATE TABLE accounts(id uuid PRIMARY KEY,owner_id uuid,kind text,archived boolean DEFAULT false,name text,opening_balance numeric DEFAULT 0);GRANT SELECT ON accounts TO authenticated;ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;CREATE POLICY own_accounts ON accounts TO authenticated USING(owner_id=auth.uid());
 CREATE TABLE documents(id uuid PRIMARY KEY,owner_id uuid,entity_id text,file_path text,evidence_locked boolean DEFAULT false,doc_date date,transaction_id uuid);
 CREATE TABLE expenses(id uuid PRIMARY KEY,employee_id uuid,title text,category text,amount numeric CHECK(amount>0),original_amount numeric,currency text,expense_date date,description text,payment_method text,scope text,txn_type text,account_id uuid,adjustment_sign int,entity_id text,entity_source text,receipt_details jsonb,reconciled_at timestamptz,statement_ref text);
 GRANT SELECT,INSERT,UPDATE,DELETE ON expenses TO authenticated;ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;CREATE POLICY own_expenses ON expenses TO authenticated USING(employee_id=auth.uid()) WITH CHECK(employee_id=auth.uid());CREATE TABLE expense_history(id uuid,expense_id uuid,action text);`);
 await db.query('INSERT INTO auth.users VALUES($1,$2,now())',[accountant,'reviewer@example.test']);
 await db.query('INSERT INTO finance_preferences(owner_id,data) VALUES($1,$2)',[owner,JSON.stringify({entities,books})]);for(const a of accounts)await db.query('INSERT INTO accounts VALUES($1,$2,$3,false,$4,0)',[a.id,owner,a.kind,a.name]);
 await db.exec(readFileSync('scripts/accounting-foundation.sql','utf8'));await user(owner);
 await post(await make('2025-04-01','Printed opening schedules assets liabilities and equity',[cash(500000),leg(`account:${second}`,'asset',100000,'cash',second,'operating'),leg(`account:${asset}`,'asset',300000,'ppe',asset),leg('receivable:customer','asset',118000,'receivables'),leg('prepaid:insurance','asset',24000,'otherAsset'),leg(`account:${loan}`,'liability',-200000,'borrowings',loan),leg('payable:supplier','liability',-59000,'payables'),leg('gst:payable','liability',-18000,'otherLiability'),leg('capital','equity',-765000,'equity')],'opening'));
 await post(await make('2025-04-02','New equipment invoice paid once',[leg(`account:${asset}`,'asset',120000,'ppe',asset),cash(-120000,'investing')],'adjustment'));
 await post(await make('2025-04-03','Sanctioned equipment loan disbursal',[cash(100000,'financing'),leg(`account:${loan}`,'liability',-100000,'borrowings',loan)],'adjustment'));
 await post(await make('2025-04-04','Internal reserve bank transfer',[cash(-50000),leg(`account:${second}`,'asset',50000,'cash',second,'operating')],'adjustment'));
 for(let m=0;m<12;m++){
  const date=new Date(Date.UTC(2025,4+m,0)).toISOString().slice(0,10);
  await post(await make(date,'Service sales invoice including GST',[leg('receivable:customer','asset',118000,'receivables'),leg('income:sales','income',-100000,'revenue'),leg('gst:payable','liability',-18000,'otherLiability')]));
  await post(await make(date,'Customer receipt against invoice',[cash(118000),leg('receivable:customer','asset',-118000,'receivables')],'adjustment'));
  await post(await make(date,'Consumed materials purchase including GST',[leg('expense:materials','expense',40000,'cost'),leg('gst:input','asset',7200,'otherAsset'),leg('payable:supplier','liability',-47200,'payables')]));
  await post(await make(date,'Supplier settlement once',[leg('payable:supplier','liability',47200,'payables'),cash(-47200)],'adjustment'));
  await post(await make(date,'Operating expenses receipt',[leg('expense:operations','expense',20000,'cost'),cash(-20000)],'adjustment'));
  await post(await make(date,'Loan principal repayment and interest',[leg(`account:${loan}`,'liability',5000,'borrowings',loan),leg('expense:interest','expense',2000,'cost'),cash(-7000,'financing')],'adjustment'));
  await post(await make(date,'GST input setoff and cash remittance',[leg('gst:payable','liability',18000,'otherLiability'),leg('gst:input','asset',-7200,'otherAsset'),cash(-10800)],'adjustment'));
  await post(await make(date,'Monthly existing and new plant depreciation',[leg('expense:depreciation','expense',3700,'depreciation'),leg(`account:${asset}`,'asset',-3700,'ppe',asset)],'depreciation'));
  await post(await make(date,'Monthly prepaid insurance release',[leg('expense:insurance','expense',2000,'cost'),leg('prepaid:insurance','asset',-2000,'otherAsset')],'prepayment'));
 }
 const err=await make('2026-03-30','Erroneous accrued services pending correction',[leg('expense:services','expense',1500,'cost'),leg('accrual:services','liability',-1500,'otherLiability')]);await post(err);await post(reverseAccountingJournal(err,uid(sequence++),'2026-03-31','Reverse incorrect services invoice, retain original'));
 await post(await make('2026-03-31','Correct unpaid services accrual',[leg('expense:services','expense',1000,'cost'),leg('accrual:services','liability',-1000,'otherLiability')]));
 await post(await make('2026-03-31','Advance income tax bank challan',[leg('tax:advance','asset',30000,'otherAsset'),cash(-30000)],'adjustment'));
 const final=await make('2026-03-31','Reviewed current income tax provision',[leg('expense:income-tax','expense',100000,'cost'),leg('tax:advance','asset',-30000,'otherAsset'),leg('tax:payable','liability',-70000,'otherLiability')]);
 let writes=0,lose=false;const attempt={owner,requestId:final.id,expected:0,journal:final};const io={read:async()=>{if(lose){lose=false;throw Error('Interrupted readback');}return (await db.query<AccountingReceipt>('SELECT owner_id,request_id,journal,entry_ids FROM accounting_journal_evidence WHERE id=$1',[final.id])).rows[0]??null;},post:async()=>{writes++;await post(final);lose=true;throw Error('Lost commit response');}};
 await expect(postAccountingWithRecovery(attempt,io)).rejects.toThrow('unknown');await db.close();db=new PGlite(join(dir,'db'));await user(owner);await postAccountingWithRecovery(attempt,io);expect(writes).toBe(1);
 const before=await working();expect(before.issues.some(i=>i.message.includes('Cash journal'))).toBe(true);
 const rows=await entries();const money=rows.filter(e=>[bank,second].includes(e.accountId??'')&&e.receiptDetails?.accounting?.journal.kind!=='opening');
 const csv='Date,Description,Debit,Credit,Reference\n'+money.map(e=>`${e.date},${e.id},${e.adjustmentSign===-1?e.amount:''},${e.adjustmentSign===1?e.amount:''},${e.id}`).join('\n');
 const file={name:'annual-bank.csv',size:csv.length,text:async()=>csv,arrayBuffer:async()=>new TextEncoder().encode(csv).buffer};const extracted=await readStatement(file);expect(extracted).toHaveLength(money.length);
 expect(sumMoney(extracted.filter(r=>r.direction==='credit').map(r=>r.amount))-sumMoney(extracted.filter(r=>r.direction!=='credit').map(r=>r.amount))).toBe(346000);
 const bankDoc=uid(sequence++),path=`${owner}/synthetic/annual-bank.csv`;const bytes=new TextEncoder().encode(csv);originals.set(path,bytes);documents.push({id:bankDoc,entityId:'A',filePath:path,fileName:'annual-bank.csv',size:bytes.length,mimeType:'text/csv'} as VaultDoc);
 await db.exec('RESET ROLE');await db.query('INSERT INTO documents VALUES($1,$2,$3,$4,true,$5,NULL)',[bankDoc,owner,'A',path,'2026-03-31']);
 // Reconciliation is test-adapter persistence, not installed Cloud correction authority.
 for(const e of money)await db.query('UPDATE expenses SET reconciled_at=$1,statement_ref=$2 WHERE id=$3',['2026-04-01',`${bankDoc}:${e.id}`,e.id]);await user(owner);
 await expect(db.query('UPDATE expenses SET amount=1 WHERE id=$1',[money[0]?.id])).rejects.toThrow('immutable');
 const w=await working();const expected={profit:286600,assets:1439600,liabilities:388000,equity:1051600,cash:946000,operating:426000,investing:-120000,financing:40000};
 expect(w.profit).toBe(expected.profit);expect(w.assets).toBe(expected.assets);expect(w.liabilities).toBe(expected.liabilities);expect(w.equity).toBe(expected.equity);expect(w.cash.closing).toBe(expected.cash);expect(w.trialDifference).toBe(0);expect(w.balanceDifference).toBe(0);expect(w.cash.difference).toBe(0);expect(corporateCloseErrors([w])).toEqual([]);
 const cashClassificationDifference={operating:w.cash.operating-expected.operating,financing:w.cash.financing-expected.financing};
 expect(cashClassificationDifference).toEqual({operating:0,financing:0});
 const schedules=statutorySchedules(w);expect(schedules.issues).toEqual([]);expect(schedules.rows.find(r=>r.head==='ppe')?.closing).toBe(375600);
 const pack=await corporateAuditPack(w,documents,async p=>originals.has(p)?`https://isolated.invalid/${encodeURIComponent(p)}`:null,async input=>{const original=originals.get(decodeURIComponent(String(input).split('isolated.invalid/')[1]??''));return new Response(original?new Uint8Array(original).buffer:null);});const zip=unzipSync(new Uint8Array(await pack.arrayBuffer()));const manifest=JSON.parse(strFromU8(zip['accounting-evidence.json']??new Uint8Array()));expect(manifest.originals.length).toBe(originals.size);expect(w.lines.every(l=>l.originalPaths.length>0)).toBe(true);
 await db.query('SELECT set_accounting_review_grant($1,$2,false)',['A','reviewer@example.test']);await user(accountant);expect((await db.query('SELECT * FROM accounting_journal_evidence')).rows).toHaveLength(journals.length);await db.query('SELECT review_accounting_exception($1,$2,$3,$4,$5)',[uid(sequence++),owner,final.id,'year-close','Reviewed synthetic tax provision; no difference waived']);await expect(post({...final,id:uid(sequence++)})).rejects.toThrow('Owner preferences');await user(other);expect((await db.query('SELECT * FROM accounting_journal_evidence')).rows).toHaveLength(0);await user(owner);
 await db.exec('RESET ROLE');for(const f of ['0070_authoritative_period_close_evidence.sql','0072_period_recovery_authority.sql','0084_period_figure_snapshots.sql'])await db.exec(readFileSync('drizzle/migrations/'+f,'utf8'));await db.exec(readFileSync('scripts/accounting-close-guard.sql','utf8'));await user(owner);
 const figures={version:1,entries:{},gst:{},balances:{},corporate:[w]};const close=async(figs:unknown)=>db.query('SELECT change_accounting_period($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[uid(9000),'closed','synthetic-2025-26','2025-04-01','2026-03-31','Reviewed isolated evidence',JSON.stringify({closedPeriods:[],periodLog:[]}),JSON.stringify(figs)]);
 await expect(close({...figures,corporate:[{...w,issues:[{recordId:'bank',message:'Unresolved INR 500 statement difference'}]}]})).rejects.toThrow('Unresolved');expect((await db.query('SELECT * FROM period_close_evidence')).rows).toHaveLength(0);
 await close(figures);await db.close();db=new PGlite(join(dir,'db'));await user(owner);await close(figures);expect((await db.query('SELECT * FROM period_close_evidence')).rows).toHaveLength(1);await expect(post({...final,id:uid(sequence++)})).rejects.toThrow('closed');
 // Cash classification must pass before functional acceptance, even though close arithmetic can balance.
 const results={company:entities[0]?.name,period:'2025-04-01 to 2026-03-31',months:12,journals:journals.length,canonicalEntries:rows.length,extractedBankRows:extracted.length,expected,calculated:{profit:w.profit,assets:w.assets,liabilities:w.liabilities,equity:w.equity,cash:w.cash},cashClassificationDifference,trialDebit:sumMoney(w.balances.map(b=>Math.max(0,b.closing))),trialCredit:sumMoney(w.balances.map(b=>Math.max(0,-b.closing))),originals:manifest.originals.length,unresolved:w.issues,fullWorkflowAccepted:false,limitations:['Opening/invoices are supplied synthetic schedules, not actual AI document extraction.','Reconciliation persistence uses isolated adapter updates, not installed correction RPC.','No real-route upload-to-close browser journey or hosted acceptance.','Statutory disclosures and filing approval remain incomplete.']};
 mkdirSync('/tmp/browser/accounting-annual',{recursive:true});writeFileSync('/tmp/browser/accounting-annual/results.json',JSON.stringify(results,null,2));writeFileSync('/tmp/browser/accounting-annual/audit.zip',new Uint8Array(await pack.arrayBuffer()));writeFileSync('/tmp/browser/accounting-annual/trial-balance.json',JSON.stringify(corporateReport(w,'company-trial-balance'),null,2));
 console.log(JSON.stringify(results));
 }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
},60000);
