import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { parseStatementCsv, type Expense, type StatementLine } from './expenses';
import { normalizePreferences, type FinancePreferences } from './preferences';
import { stageImport, type ImportRule } from './historical-import';
import type { Account } from './ledger';
import { extractScannedChunk } from './scanned-import.server';
import { normalizeStatementRows } from './statement-rows';
import type { BalanceEvidence } from './balance-verification';
import { extractStatementIdentity, type StatementIdentity } from './statement-evidence';

async function paged(db: SupabaseClient<Database>, owner: string) {
  const rows: Expense[] = [];
  for(let from=0;;from+=1000) {
    const result=await db.from('expenses').select('*').eq('employee_id',owner).order('id').range(from,from+999);
    if(result.error) throw Error('Could not check existing transactions');
    rows.push(...result.data.map(t=>({id:t.id,title:t.title,merchant:t.merchant,date:t.expense_date,amount:Number(t.amount),originalAmount:Number(t.original_amount ?? t.amount),currency:t.currency,fxRate:Number(t.fx_rate),paymentMethod:t.payment_method as Expense['paymentMethod'],category:t.category,scope:t.scope as Expense['scope'],memberId:t.member_id,splits:[],description:t.description,receipts:[],reconciledAt:t.reconciled_at,statementRef:t.statement_ref,txnType:t.txn_type as NonNullable<Expense['txnType']>,accountId:t.account_id,toAccountId:t.to_account_id})));
    if(result.data.length<1000) break;
  }
  return rows;
}

export async function processImport(db: SupabaseClient<Database>, id: string, owner: string) {
  const result=await db.from('import_batches').select('*').eq('id',id).eq('owner_id',owner).single();
  if(result.error) throw Error('Import not found');
  const b=result.data;
  if(['review','paused','refused','cancelled'].includes(b.status)) return;
  try {
    let lines=b.raw_lines as unknown as StatementLine[];
    if(!lines.length) {
      const file=await db.storage.from('receipts').download(b.file_path);
      if(file.error || !file.data) throw Error('Original statement could not be read');
      if(/\.csv$/i.test(b.file_name)) {
        const text = await file.data.text(); lines=parseStatementCsv(text,true);
        const identity = await db.from('import_batches').update({statement_identity:extractStatementIdentity(text) as unknown as Json}).eq('id',b.id).eq('owner_id',owner);
        if(identity.error)throw Error('Could not preserve statement identity evidence');
      }
      else if(/\.xlsx?$/i.test(b.file_name)) {
        const {read,utils}=await import('xlsx');
        const book=read(new Uint8Array(await file.data.arrayBuffer()),{type:'array',cellDates:true});
        const identities:StatementIdentity[]=[];
        for(const name of book.SheetNames) {
          const sheet=book.Sheets[name]; if(!sheet) continue;
          const data=utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',raw:true});
          identities.push(...extractStatementIdentity(data.slice(0,30).map(r=>r.join(' ')).join('\n')));
          const header=data.findIndex(r=>r.some(c=>/date/i.test(String(c)))&&r.some(c=>/debit|withdrawal|amount|paid out/i.test(String(c))));
          if(header<0) continue;
          const csv=data.slice(header).map(r=>r.map(c=>`"${(c instanceof Date?c.toISOString().slice(0,10):String(c ?? '')).replaceAll('"','""')}"`).join(',')).join('\n');
          lines.push(...parseStatementCsv(csv,true).map(l=>({...l,ref:`${name}:${l.ref}`})));
        }
        const identity = await db.from('import_batches').update({statement_identity:identities as unknown as Json}).eq('id',b.id).eq('owner_id',owner);
        if(identity.error)throw Error('Could not preserve statement identity evidence');
      } else if(/\.pdf$/i.test(b.file_name)) {
        const complete=await extractScannedChunk(db,b,file.data);
        if(!complete)return;
        const pages=await db.from('import_pdf_pages').select('rows,balances').eq('batch_id',b.id).eq('owner_id',owner).order('page_start');
        if(pages.error)throw Error('Could not retrieve extracted PDF pages');
        const evidence:BalanceEvidence={opening:{value:null,quote:'',page:null},closing:{value:null,quote:'',page:null},periodFrom:null,periodTo:null};
        lines=[]; const identities:StatementIdentity[]=[];
        for(const page of pages.data){
          const source=page.rows as unknown as {date:string;description:string;amount:number;direction:string;reference:string;page:number}[];
          for(let i=0;i<source.length;i++){const row=source[i];if(!row)continue;const normalized=normalizeStatementRows([row])[0];if(normalized)lines.push({...normalized,ref:`PDF${row.page}:${i}:${row.reference}`});}
          const balances=page.balances as unknown as BalanceEvidence & {identities?:StatementIdentity[]};
          identities.push(...(balances.identities ?? []));
          if(balances.opening.value!=null)evidence.opening=balances.opening;
          if(balances.closing.value!=null)evidence.closing=balances.closing;
          evidence.periodFrom=balances.periodFrom??evidence.periodFrom;evidence.periodTo=balances.periodTo??evidence.periodTo;
        }
        const saved=await db.from('import_batches').update({raw_lines:lines as unknown as Json,source_balances:evidence as unknown as Json,statement_identity:identities as unknown as Json,...(evidence.periodFrom?{period_from:evidence.periodFrom}:{}),...(evidence.periodTo?{period_to:evidence.periodTo}:{})}).eq('id',b.id).eq('owner_id',owner);
        if(saved.error)throw Error('Could not preserve extracted source data');
      } else throw Error('Choose a CSV, Excel or PDF statement');
    }
    if(!lines.length) throw Error('No transactions found. Check the statement columns.');
    if(lines.length>10000) throw Error('Split statements larger than 10,000 transactions into smaller files.');
    const [accounts,prefs,rules]=await Promise.all([
      db.from('accounts').select('*').eq('owner_id',owner),
      db.from('finance_preferences').select('data').eq('owner_id',owner).maybeSingle(),
      db.from('import_rules').select('*').eq('owner_id',owner),
    ]);
    if(accounts.error || prefs.error || rules.error) throw Error('Could not load import settings');
    const known=new Set<string>();
    for(let from=0;;from+=1000) {
      const posts=await db.from('statement_line_imports').select('fingerprint').eq('owner_id',owner).eq('account_key',b.account_id).order('id').range(from,from+999);
      if(posts.error) throw Error('Could not check earlier imports');
      posts.data.forEach(p=>known.add(p.fingerprint)); if(posts.data.length<1000) break;
    }
    const transactions=await paged(db,owner);
    const ctx={transactions,accounts:accounts.data.map(a=>({id:a.id,name:a.name,kind:a.kind,openingBalance:Number(a.opening_balance),archived:a.archived})) as Account[], categories:normalizePreferences(prefs.data?.data as Partial<FinancePreferences> | undefined).categories,accountId:b.account_id,currency:b.currency};
    const staged=stageImport(lines,ctx,rules.data as unknown as ImportRule[],known);
    for(let i=0;i<staged.length;i+=250) {
      const ins=await db.from('import_rows').upsert(staged.slice(i,i+250).map(r=>({...r,owner_id:owner,batch_id:id,line:r.line as unknown as Json,proposal:r.proposal as unknown as Json})),{onConflict:'batch_id,fingerprint',ignoreDuplicates:true});
      if(ins.error) throw Error('Could not save extracted transactions');
    }
    const dates=lines.map(l=>l.date).sort();
    const latest=await db.from('import_batches').select('period_from,period_to,status').eq('id',id).eq('owner_id',owner).single();
    if(latest.error)throw Error('Could not load extracted statement period');if(latest.data.status==='cancelled')return;
    const saved=await db.from('import_batches').update({status:'review',raw_lines:lines as unknown as Json,period_from:latest.data.period_from ?? dates[0] ?? null,period_to:latest.data.period_to ?? dates.at(-1) ?? null,error:null,updated_at:new Date().toISOString()}).eq('id',id).eq('owner_id',owner).neq('status','cancelled');
    if(saved.error) throw Error('Could not finish import');
  } catch(e) {
    await db.from('import_batches').update({status:'failed',error:e instanceof Error?e.message:'Could not process statement',updated_at:new Date().toISOString()}).eq('id',id).eq('owner_id',owner);
    throw e;
  }
}

export async function runImportJobs(db: SupabaseClient<Database>) {
  const exhausted=await db.from('import_batches').update({status:'failed',error:'Processing attempts exhausted; retry explicitly'}).in('status',['queued','processing']).gte('attempts',3).lte('lease_until',new Date().toISOString());
  if(exhausted.error)throw Error('Could not recover exhausted imports');
  const claimed=await db.rpc('claim_import_batches');
  if(claimed.error) throw Error('Could not claim imports');
  let done=0,failed=0;
  for(const b of claimed.data) { try { await processImport(db,b.id,b.owner_id); done++; } catch { failed++; } }
  return {claimed:claimed.data.length,done,failed};
}