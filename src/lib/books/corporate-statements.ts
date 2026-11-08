/** Read-only double-entry projection of the canonical ledger. Never posts or balances missing facts. */
import type { Expense } from '../expenses';
import { categoryParts } from '../expenses';
import type { Account } from '../ledger';
import { accountBalance, isLiability, repaymentParts } from '../ledger';
import { addMoney, subtractMoney, sumMoney, roundMoney } from '../money';
import type { VaultDoc } from '../documents';
import type { EntityProfile } from '../entities';
import type { BooksData } from './types';
import { effectiveEntity, ownerOf } from './entity-accounts';
import type { Report } from '../reports';

export const CORPORATE_TYPES = ['company-trial-balance','company-profit-loss','company-balance-sheet','company-cash-flow','company-audit-schedules'] as const;
export type CorporateType = typeof CORPORATE_TYPES[number];
export type BookRole = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'unclassified';
export interface CorporateLine {
  id: string; groupId: string; date: string; code: string; label: string; role: BookRole;
  debit: number; credit: number; entryId: string | null; documentIds: string[]; originalPaths: string[];
  originalAmount: number | null; currency: string; formula: string;
}
export interface CorporateBalance { code: string; label: string; role: BookRole; opening: number; debit: number; credit: number; closing: number; lineIds: string[] }
export interface CorporateWorking {
  entityId: string; entityName: string; from: string; to: string; lines: CorporateLine[];
  balances: CorporateBalance[]; issues: { recordId: string; message: string }[];
  profit: number; assets: number; liabilities: number; equity: number; unclassified: number;
  trialDifference: number; balanceDifference: number;
  cash: { opening: number; operating: number; investing: number; financing: number; unclassified: number; closing: number; difference: number };
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
  for (const e of entries.values()) {
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
        post(`due:${payer}`,`Due ${moneyIn?'from':'to'} ${byAccount.get(payer)?.name??'unidentified payer'}`,moneyIn?'asset':'liability',moneyIn?e.amount:-e.amount,'Manually assigned company event paid outside company accounts');
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
      parts.forEach((part,i)=>{const value=i===parts.length-1?subtractMoney(counter,allocated):roundMoney(counter*part.amount/(e.amount||1));allocated=addMoney(allocated,value);post(`${role}:${part.category}`,part.category,role,value,'Saved category allocation; total equals ledger counterpart');});
    } else if (kind==='loan_repayment' && company===entity.id && ids.has(e.accountId??'')&&ids.has(e.toAccountId??'')) {
      post('expense:loan-interest','Loan interest','expense',counter,'Stored INR repayment interest; principal already reduces the loan');
      if(counter!==repaymentParts(e).interest)issue(e.id,'Loan interest differs from the saved repayment split.');
    } else if (['transfer','investment','card_payment','loan_repayment'].includes(kind)) {
      const external=[e.accountId,e.toAccountId].find(id=>!!id&&!ids.has(id))??'unknown';
      // Cross-boundary money belongs to a due-from/to account, never company profit.
      post(`due:${external}`,`Due ${counter>0?'from':'to'} ${byAccount.get(external)?.name??'unidentified counterparty'}`,counter>0?'asset':'liability',counter,'Transfer across company boundary; never sales or spending');
      if(external==='unknown')issue(e.id,'Transfer destination/source is missing; intercompany classification is unverified.');
    } else {
      post(`unclassified:${kind}`,`${kind} counterpart — requires accounting classification`,'unclassified',counter,'Unclassified counterpart of canonical movement, not a balancing profit');
      issue(e.id,`${kind} has no confirmed accounting counterpart; not treated as income or expense.`);
    }
    if (company!==entity.id && touched.length && !['transfer','investment','card_payment','loan_repayment'].includes(kind)) issue(e.id,'Company account movement is manually attributed elsewhere; counterpart requires review.');
  }
  // Registers are supporting schedules, not extra postings. Their absence must not imply completeness.
  for(const i of p.books.gstInvoices)if(entity.gstins.includes(i.gstin)&&i.date<=p.to&&!i.transactionId)issue(i.id,'Invoice is register-only: accrual/settlement has not been posted to the ledger.');
  for(const j of p.books.journals)if(j.status==='prepared'&&j.period<=p.to.slice(0,7))issue(j.id,'Prepared depreciation is not posted; financial statements exclude it.');
  const balances:CorporateBalance[]=[];
  for(const code of [...new Set(lines.map(l=>l.code))]){
    const all=lines.filter(l=>l.code===code);const first=all[0];if(!first)continue;
    const opening=sumMoney(all.filter(l=>l.date<p.from).map(l=>subtractMoney(l.debit,l.credit)));
    const win=all.filter(l=>l.date>=p.from);const debit=sumMoney(win.map(l=>l.debit));const credit=sumMoney(win.map(l=>l.credit));
    balances.push({code,label:first.label,role:first.role,opening,debit,credit,closing:addMoney(opening,debit,-credit),lineIds:all.map(l=>l.id)});
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
    const e=entries.get(group);const other=e?[byAccount.get(e.accountId??''),byAccount.get(e.toAccountId??'')].filter((a):a is Account=>!!a&&!cashKinds.includes(a.kind)):[];
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
  if(type==='company-balance-sheet')return {title,headers:['Role','Account / figure','Amount (INR)','Input line IDs'],rows:[...w.balances.filter(b=>!['income','expense'].includes(b.role)).map(b=>[b.role,b.label,f(normalBalance(b.role,b.closing)),b.lineIds.join('; ')]),['equity','Cumulative recorded profit / loss',f(sumMoney(w.balances.filter(b=>b.role==='income').map(b=>-b.closing))-sumMoney(w.balances.filter(b=>b.role==='expense').map(b=>b.closing))),'Historical income/expense ledger inputs'],['check','Balance equation difference (including unclassified)',f(w.balanceDifference),'Assets + debit unclassified − liabilities − equity']]};
  if(type==='company-cash-flow')return {title,headers:['Cash flow','Amount (INR)','Basis'],rows:Object.entries(w.cash).map(([k,v])=>[k,f(v),'Company cash-account ledger legs; internal cash transfers cancel'])};
  return {title,headers:['Date','Group ID','Entry ID','Code','Account','Role','Debit','Credit','Document IDs','Original paths','Original amount','Currency','Formula'],rows:w.lines.map(l=>[l.date,l.groupId,l.entryId??'',l.code,l.label,l.role,f(l.debit),f(l.credit),l.documentIds.join('; '),l.originalPaths.join('; '),l.originalAmount??'',l.currency,l.formula])};
}