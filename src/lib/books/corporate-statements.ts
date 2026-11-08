/** Read-only double-entry projection of the canonical ledger. Never posts or balances missing facts. */
import type { Expense } from '../expenses';
import { categoryParts } from '../expenses';
import type { Account } from '../ledger';
import { accountBalance, isLiability, repaymentParts } from '../ledger';
import { addMoney, subtractMoney, sumMoney, roundMoney, proportionMoney } from '../money';
import type { VaultDoc } from '../documents';
import type { EntityProfile } from '../entities';
import type { BooksData } from './types';
import { effectiveEntity, ownerOf } from './entity-accounts';
import type { Report } from '../reports';
import { accountingErrors, balancedGroups, journalAccountDelta, journalFromEntry } from './accounting-journal';
import {accountingCanonical} from './accounting-post';
import {statutoryErrors,STATUTORY_HEADS} from './statutory-mappings';

export const CORPORATE_TYPES = ['company-trial-balance','company-profit-loss','company-balance-sheet','company-cash-flow','company-audit-schedules'] as const;
export type CorporateType = typeof CORPORATE_TYPES[number];
export type BookRole = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'unclassified';
export interface CorporateLine {
  id: string; groupId: string; date: string; code: string; label: string; role: BookRole;
  debit: number; credit: number; entryId: string | null; documentIds: string[]; originalPaths: string[];
  originalAmount: number | null; currency: string; formula: string; statutory?:import('./statutory-mappings').StatutoryMapping; source?:import('./accounting-journal').AccountingLeg['source'];
}
export interface CorporateBalance { code: string; label: string; role: BookRole; opening: number; debit: number; credit: number; closing: number; lineIds: string[]; statutory?:import('./statutory-mappings').StatutoryMapping }
export interface CorporateWorking {
  entityId: string; entityName: string; from: string; to: string; lines: CorporateLine[];
  balances: CorporateBalance[]; issues: { recordId: string; message: string }[];
  profit: number; assets: number; liabilities: number; equity: number; unclassified: number;
  trialDifference: number; balanceDifference: number;
  cash: { opening: number; operating: number; investing: number; financing: number; unclassified: number; closing: number; difference: number };
}
/** Readiness is source-based; balanced arithmetic alone never clears unexplained facts. */
export function corporateCloseErrors(workings:CorporateWorking[]):string[]{
 return workings.flatMap(w=>[...w.issues.map(i=>`${w.entityName}: ${i.message}`),...(w.trialDifference!==0||w.balanceDifference!==0||w.cash.difference!==0?[`${w.entityName}: Financial statements do not agree.`]:[])]);
}
const cashKinds = ['savings','current','cash','wallet'];
const roleOf = (a: Account): BookRole => isLiability(a.kind) ? 'liability' : 'asset';
const normalBalance = (role: BookRole, signed: number) => ['liability','equity','income'].includes(role) ? -signed : signed;

export function corporateStatements(p: { entityId: string; entities: EntityProfile[]; entries: Expense[]; accounts: Account[]; books: BooksData; documents: VaultDoc[]; from: string; to: string }): CorporateWorking {
  const entity = p.entities.find(e => e.id === p.entityId);
  if (!entity) throw Error('Choose an available company before preparing its accounts.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to) || p.from > p.to) throw Error('Choose a valid accounting period.');
  const map = p.books.entityAccounts ?? {};
  const accounts = p.accounts.filter(a => ownerOf(map,a.id) === entity.id);
  const ids = new Set(accounts.map(a=>a.id));
  const byAccount = new Map(p.accounts.map(a=>[a.id,a]));
  const issues: CorporateWorking['issues'] = [];
  const issue = (recordId:string,message:string) => { if (!issues.some(i=>i.recordId===recordId&&i.message===message)) issues.push({recordId,message}); };
  if (!accounts.length) issue(entity.id,'No company accounts are linked.');
  const lines: CorporateLine[] = [];
  const docsFor = (id:string) => p.documents.filter(d => d.transactionId===id || p.books.docLinks.some(l=>l.kind==='transaction'&&l.targetId===id&&l.docId===d.id));
  const emit = (groupId:string,date:string,code:string,label:string,role:BookRole,signed:number,e:Expense|null,docIds:string[]=[],paths:string[]=[],formula='') => {
    signed=roundMoney(signed); if (signed===0) return;
    lines.push({id:`${groupId}:${lines.filter(l=>l.groupId===groupId).length}`,groupId,date,code,label,role,debit:Math.max(0,signed),credit:Math.max(0,-signed),entryId:e?.id??null,documentIds:docIds,originalPaths:paths,originalAmount:e?.originalAmount??null,currency:e?.currency??'INR',formula});
  };
  for (const a of accounts) {
    if (!Number.isFinite(a.openingBalance)) { issue(a.id,'Opening balance is invalid.'); continue; }
    const amount=isLiability(a.kind)?-a.openingBalance:a.openingBalance;
    const docs=p.documents.filter(d=>d.accountId===a.id&&d.docDate!=null&&d.docDate<p.from);
    emit(`opening:${a.id}`,'0000-00-00',`account:${a.id}`,a.name,roleOf(a),amount,null,docs.map(d=>d.id),docs.map(d=>d.filePath),'Saved account opening balance; undated, not audited capital');
    emit(`opening:${a.id}`,'0000-00-00','unclassified:opening','Opening counterpart — not confirmed capital','unclassified',-amount,null,docs.map(d=>d.id),docs.map(d=>d.filePath),'Opposite of saved opening balance; requires audited opening mapping');
    if (amount) issue(a.id,'Saved opening balance has no dated double-entry capital/retained-earnings mapping; opening counterpart remains unclassified.');
  }
  const entries = new Map<string,Expense>();
  for (const e of p.entries) {
    if (e.transferCounterpartOf || e.date>p.to) continue;
    if (entries.has(e.id)) { if(JSON.stringify(entries.get(e.id))!==JSON.stringify(e)) issue(e.id,'Conflicting duplicate entry ID; only the first visible record is used.'); continue; }
    entries.set(e.id,e);
  }
  const journalEntries=new Set<string>();
  const journalIds=[...new Set([...entries.values()].flatMap(e=>{const a=journalFromEntry(e);return a?.journal.entityId===entity.id?[a.journal.id]:[];}))];
  for(const id of journalIds){
    const members=[...entries.values()].filter(e=>journalFromEntry(e)?.journal.id===id);
    const primary=members.filter(e=>journalFromEntry(e)?.primary);
    const j=primary[0]?journalFromEntry(primary[0])?.journal:undefined;
    if(!j||primary.length!==1){issue(id,'Journal primary evidence is missing or duplicated; journal requires recovery.');continue;}
    // A period may subsequently close; validation of saved facts must not reject that closure.
    const errors=accountingErrors(j,p.accounts,{...p.books,closedPeriods:[]},p.documents);
    const linked=j.legs.filter(l=>l.accountId);
    if(members.length!==Math.max(1,linked.length))errors.push('Journal ledger membership is incomplete.');
    if(members.some(e=>JSON.stringify(journalFromEntry(e)?.journal)!==JSON.stringify(j)||e.date!==j.date))errors.push('Journal evidence changed between canonical legs.');
    for(const l of linked){const candidates=members.filter(e=>e.accountId===l.accountId);const a=p.accounts.find(a=>a.id===l.accountId);if(candidates.length!==1||!a||accountBalance({...a,openingBalance:0},candidates)!==journalAccountDelta(l))errors.push('Journal and canonical account movement differ.');}
    if(!linked.length&&members.some(e=>e.accountId||e.toAccountId))errors.push('Noncash journal unexpectedly moves a money account.');
    if(j.settlement&&j.kind!=='reversal'){
      const bank=entries.get(j.settlement.entryId);const s=j.settlement.snapshot;
      if(!bank||bank.entityId!==entity.id||bank.amount!==s.amount||bank.date!==s.date||bank.accountId!==s.accountId||(bank.txnType??'expense')!==s.txnType||bank.category!==s.category||accountingCanonical(bank.allocations??[])!==accountingCanonical(s.allocations))errors.push('Settlement bank source changed or is unavailable; recover original evidence.');
    }
    if(errors.length){errors.forEach(message=>issue(id,message));continue;}
    for(const member of members){
      const account=p.accounts.find(a=>a.id===member.accountId);
      if(j.kind!=='opening'&&account&&cashKinds.includes(account.kind)&&(!member.reconciledAt||!member.statementRef))issue(id,'Cash journal has not been reconciled to a retained statement line.');
    }
    members.forEach(e=>journalEntries.add(e.id));
    for(const l of j.legs){if(l.statutory)statutoryErrors(l).forEach(message=>issue(id,message));}
    const docs=p.documents.filter(d=>j.documentIds.includes(d.id));
    for(const l of j.legs){emit(`journal:${id}`,j.kind==='opening'?j.date.slice(0,4)+'-03-31':j.date,l.code,l.label,l.role,subtractMoney(l.debit,l.credit),primary[0]??null,docs.map(d=>d.id),docs.map(d=>d.filePath),`${j.kind}: ${j.description}${j.reversesId?`; exact reversal of ${j.reversesId}`:''}${j.settlement?`; bank source ${j.settlement.entryId}; accrued source ${j.settlement.journalId}`:''}${j.recurringSource?`; recognition template ${j.recurringSource.templateId}`:''}`);const line=lines.at(-1);if(line?.groupId===`journal:${id}`){if(l.source)line.source=l.source;if(l.statutory)line.statutory=l.statutory;}}
  }
  for (const e of entries.values()) {
    if(journalEntries.has(e.id))continue;
    const company=effectiveEntity(e,map);
    const touched=accounts.filter(a=>a.id===e.accountId||a.id===e.toAccountId);
    if (!touched.length && company!==entity.id) continue;
    if(!Number.isFinite(e.amount)||e.amount<0){issue(e.id,'Invalid ledger amount; entry excluded.');continue;}
    const kind=e.txnType??'expense';
    const docs=docsFor(e.id);
    const documentIds=docs.map(d=>d.id);
    const paths=[...new Set([...docs.map(d=>d.filePath),...e.receipts.map(r=>r.path)])];
    if (!paths.length) issue(e.id,'No retained original document or receipt is linked.');
    if (!e.reconciledAt && touched.some(a=>cashKinds.includes(a.kind)||a.kind==='credit_card')) issue(e.id,'Bank/card movement has not been reconciled to a statement.');
    const post=(code:string,label:string,role:BookRole,amount:number,formula:string) => emit(e.id,e.date,code,label,role,amount,e,documentIds,paths,formula);
    let net=0;
    for (const a of touched) {
      const delta=accountBalance({...a,openingBalance:0},[e]);
      const signed=isLiability(a.kind)?-delta:delta;
      post(`account:${a.id}`,a.name,roleOf(a),signed,'Canonical accountBalance for this entry, liabilities credit-normal');
      net=addMoney(net,signed);
    }
    // A manually assigned company expense paid from another company/personal account is due to that payer.
    if (company===entity.id&&!touched.length) {
      if (['expense','income','refund','reimbursement'].includes(kind)) {
        const moneyIn=['income','refund','reimbursement'].includes(kind);
        const payer=e.accountId??'unknown';
        post(`due:${moneyIn?'from':'to'}:${payer}`,`Due ${moneyIn?'from':'to'} ${byAccount.get(payer)?.name??'unidentified payer'}`,moneyIn?'asset':'liability',moneyIn?e.amount:-e.amount,'Manually assigned company event paid outside company accounts');
        net=moneyIn?e.amount:-e.amount;
      } else {issue(e.id,'Manually assigned movement has no linked company account; classification requires review.');continue;}
    }
    if (!net) continue; // Internal transfers/card settlements have two equal legs; no expense again.
    const counter=-net;
    if (company===entity.id && ['expense','refund','income'].includes(kind)) {
      const role:BookRole=kind==='income'?'income':'expense';
      const parts=categoryParts(e);
      if(sumMoney(parts.map(x=>x.amount))!==roundMoney(e.amount)){issue(e.id,'Category allocation does not equal the original entry; counterpart remains unclassified.');post('unclassified:allocation','Invalid category allocation','unclassified',counter,'Unclassified counterpart of ledger movement');continue;}
      let allocated=0;
      parts.forEach((part,i)=>{const value=i===parts.length-1?subtractMoney(counter,allocated):proportionMoney(counter,part.amount,e.amount||1);allocated=addMoney(allocated,value);post(`${role}:${part.category}`,part.category,role,value,'Saved category allocation; total equals ledger counterpart');});
    } else if (kind==='loan_repayment' && company===entity.id && ids.has(e.accountId??'')&&ids.has(e.toAccountId??'')) {
      post('expense:loan-interest','Loan interest','expense',counter,'Stored INR repayment interest; principal already reduces the loan');
      if(counter!==repaymentParts(e).interest)issue(e.id,'Loan interest differs from the saved repayment split.');
    } else if (['transfer','investment','card_payment','loan_repayment'].includes(kind)) {
      const external=[e.accountId,e.toAccountId].find(id=>!!id&&!ids.has(id))??'unknown';
      // Cross-boundary money belongs to a due-from/to account, never company profit.
      post(`due:${counter>0?'from':'to'}:${external}`,`Due ${counter>0?'from':'to'} ${byAccount.get(external)?.name??'unidentified counterparty'}`,counter>0?'asset':'liability',counter,'Transfer across company boundary; never sales or spending');
      if(external==='unknown')issue(e.id,'Transfer destination/source is missing; intercompany classification is unverified.');
    } else if(kind==='adjustment' && company===entity.id && p.books.journals.some(j=>j.status==='posted'&&j.transactionId===e.id) && net<0) {
      post('expense:depreciation','Posted book depreciation','expense',counter,'Existing posted depreciation journal; no second asset/ledger entry');
    } else {
      post(`unclassified:${kind}`,`${kind} counterpart — requires accounting classification`,'unclassified',counter,'Unclassified counterpart of canonical movement, not a balancing profit');
      issue(e.id,`${kind} has no confirmed accounting counterpart; not treated as income or expense.`);
    }
    if (company!==entity.id && touched.length && !['transfer','investment','card_payment','loan_repayment'].includes(kind)) issue(e.id,'Company account movement is manually attributed elsewhere; counterpart requires review.');
  }
  // Registers are supporting schedules, not extra postings. Their absence must not imply completeness.
  for(const i of p.books.gstInvoices)if(entity.gstins.includes(i.gstin)&&i.date<=p.to&&!i.transactionId&&![...entries.values()].some(e=>journalEntries.has(e.id)&&journalFromEntry(e)?.journal.invoiceId===i.id))issue(i.id,'Invoice is register-only: accrual/settlement has not been posted to the ledger.');
  for(const j of p.books.journals)if(j.status==='prepared'&&j.period<=p.to.slice(0,7)&&p.books.docLinks.some(l=>l.kind==='asset'&&l.targetId===j.assetId&&p.documents.some(d=>d.id===l.docId&&d.entityId===entity.id)))issue(j.id,'Prepared depreciation is not posted; financial statements exclude it.');
  const balances:CorporateBalance[]=[];
  for(const group of balancedGroups(lines))issue(group,'Accounting group is not balanced; review its source legs.');
  for(const code of [...new Set(lines.map(l=>l.code))]){
    const all=lines.filter(l=>l.code===code);const first=all[0];if(!first)continue;
    if(all.some(l=>l.role!==first.role))issue(code,'Accounting role differs between source records; account mapping requires correction.');
    const opening=sumMoney(all.filter(l=>l.date<p.from).map(l=>subtractMoney(l.debit,l.credit)));
    const win=all.filter(l=>l.date>=p.from);const debit=sumMoney(win.map(l=>l.debit));const credit=sumMoney(win.map(l=>l.credit));
    const sourceLegs=[...entries.values()].flatMap(e=>{const j=journalFromEntry(e);return j?.primary?j.journal.legs.filter(l=>l.code===code):[];});const statutory=sourceLegs.find(l=>l.statutory)?.statutory;
    if(statutory&&sourceLegs.some(l=>l.statutory&&accountingCanonical(l.statutory)!==accountingCanonical(statutory)))issue(code,'Statutory classifications conflict between retained journals.');
    if(sourceLegs.length&&sourceLegs.some(l=>l.statutory)&&sourceLegs.some(l=>!l.statutory))issue(code,'Statutory classification is missing from part of the retained history.');
    balances.push({code,label:first.label,role:first.role,opening,debit,credit,closing:addMoney(opening,debit,-credit),lineIds:all.map(l=>l.id),...(statutory?{statutory}:{})});
  }
  const total=(role:BookRole)=>sumMoney(balances.filter(b=>b.role===role).map(b=>normalBalance(role,b.closing)));
  const periodIncome=sumMoney(balances.filter(b=>b.role==='income').map(b=>subtractMoney(b.credit,b.debit)));
  const periodExpense=sumMoney(balances.filter(b=>b.role==='expense').map(b=>subtractMoney(b.debit,b.credit)));
  const profit=subtractMoney(periodIncome,periodExpense);
  const assets=total('asset'),liabilities=total('liability'),equity=addMoney(total('equity'),total('income'),-total('expense')),unclassified=total('unclassified');
  const cashIds=new Set(accounts.filter(a=>cashKinds.includes(a.kind)).map(a=>`account:${a.id}`));
  const cash={opening:sumMoney(balances.filter(b=>cashIds.has(b.code)).map(b=>b.opening)),operating:0,investing:0,financing:0,unclassified:0,closing:sumMoney(balances.filter(b=>cashIds.has(b.code)).map(b=>b.closing)),difference:0};
  for(const group of [...new Set(lines.filter(l=>l.date>=p.from).map(l=>l.groupId))]){
    const ls=lines.filter(l=>l.groupId===group);const delta=sumMoney(ls.filter(l=>cashIds.has(l.code)).map(l=>subtractMoney(l.debit,l.credit)));if(!delta)continue;
    if(group.startsWith('journal:')){
      const source=[...entries.values()].find(e=>journalFromEntry(e)?.journal.id===group.slice(8));const j=source?journalFromEntry(source)?.journal:undefined;
      const bucket=j?.legs.find(l=>l.accountId&&cashIds.has(l.code))?.cashFlow;
      cash[bucket??'unclassified']=addMoney(cash[bucket??'unclassified'],delta);
      if(!bucket)issue(group,'Cash journal has no confirmed cash-flow classification.');
      continue;
    }
    const e=entries.get(group);const other=e?[byAccount.get(e.accountId??''),byAccount.get(e.toAccountId??'')].filter((a):a is Account=>!!a&&!cashKinds.includes(a.kind)):[];
    if(e?.txnType==='loan_repayment'&&ids.has(e.accountId??'')&&ids.has(e.toAccountId??'')){
      const interest=repaymentParts(e).interest;cash.operating=addMoney(cash.operating,-interest);cash.financing=addMoney(cash.financing,delta,interest);continue;
    }
    const bucket=ls.some(l=>l.role==='unclassified')?'unclassified':other.some(a=>['investment','fixed_deposit','other_asset'].includes(a.kind))?'investing':other.some(a=>['loan','other_liability'].includes(a.kind))||ls.some(l=>l.code.startsWith('due:'))?'financing':'operating';
    cash[bucket]=addMoney(cash[bucket],delta);
  }
  cash.difference=subtractMoney(cash.closing,addMoney(cash.opening,cash.operating,cash.investing,cash.financing,cash.unclassified));
  return {entityId:entity.id,entityName:entity.name,from:p.from,to:p.to,lines,balances,issues,profit,assets,liabilities,equity,unclassified,trialDifference:sumMoney(balances.map(b=>b.closing)),balanceDifference:addMoney(assets,-liabilities,-equity,unclassified),cash};
}

export function corporateReport(w:CorporateWorking,type:CorporateType):Report {
  const title=`${({'company-trial-balance':'Trial Balance','company-profit-loss':'Profit & Loss','company-balance-sheet':'Balance Sheet','company-cash-flow':'Cash Flow','company-audit-schedules':'Audit supporting schedules'} as const)[type]} — ${w.entityName}`;
  const f=(n:number)=>n.toFixed(2);
  const heads=['Code','Account / figure','Opening debit (+) / credit (-)','Period debit','Period credit','Closing debit','Closing credit','Input line IDs'];
  if(type==='company-trial-balance')return {title,headers:heads,rows:w.balances.map(b=>[b.code,b.label,f(b.opening),f(b.debit),f(b.credit),f(Math.max(0,b.closing)),f(Math.max(0,-b.closing)),b.lineIds.join('; ')])};
  if(type==='company-profit-loss')return {title,headers:['Role','Account / figure','Amount (INR)','Input line IDs'],rows:[...w.balances.filter(b=>['income','expense'].includes(b.role)).map(b=>[b.role,b.label,f(b.role==='income'?subtractMoney(b.credit,b.debit):subtractMoney(b.debit,b.credit)),b.lineIds.join('; ')]),['profit','Period profit / loss',f(w.profit),'Income less expense; unclassified excluded']]};
  if(type==='company-balance-sheet')return {title,headers:['Role','Account / figure','Amount (INR)','Input line IDs','Statutory working classification'],rows:[...w.balances.filter(b=>!['income','expense'].includes(b.role)).map(b=>[b.role,b.label,f(normalBalance(b.role,b.closing)),b.lineIds.join('; '),b.statutory?.status==='confirmed'?STATUTORY_HEADS[b.statutory.head]:'Professional review required']),['equity','Cumulative recorded profit / loss',f(subtractMoney(sumMoney(w.balances.filter(b=>b.role==='income').map(b=>-b.closing)),sumMoney(w.balances.filter(b=>b.role==='expense').map(b=>b.closing)))),'Historical income/expense ledger inputs','Professional review required'],['check','Balance equation difference (including unclassified)',f(w.balanceDifference),'Assets + debit unclassified − liabilities − equity','Working statement, not statutory certification']]};
  if(type==='company-cash-flow')return {title,headers:['Cash flow','Amount (INR)','Basis'],rows:Object.entries(w.cash).map(([k,v])=>[k,f(v),'Company cash-account ledger legs; internal cash transfers cancel'])};
  return {title,headers:['Date','Group ID','Entry ID','Code','Account','Role','Debit','Credit','Document IDs','Original paths','Original amount','Currency','Formula','Statutory working head','Classification basis','Review status','Source page','Source quote'],rows:w.lines.map(l=>[l.date,l.groupId,l.entryId??'',l.code,l.label,l.role,f(l.debit),f(l.credit),l.documentIds.join('; '),l.originalPaths.join('; '),l.originalAmount??'',l.currency,l.formula,l.statutory?STATUTORY_HEADS[l.statutory.head]:'',l.statutory?.basis??'',l.statutory?.status??'Professional review required',l.source?.page??'',l.source?.quote??''])};
}