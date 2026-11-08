/** Full, frozen dependencies for material account and cashflow figures; no second financial engine. */
import type { Expense } from './expenses';
import { accountBalance, cashflow, type Account } from './ledger';
import type { ReportFilters } from './report-centre';
export interface ReportFigureEvidence {id:string;label:string;amount:number;formula:string;inputs:{id:string;kind:'entry'|'opening';amount:number;sourceRefs:string[]}[]}
const refs=(e:Expense)=>[...(e.statementRef?[e.statementRef]:[]),...e.receipts.map(r=>r.path)];
export function reportFigureEvidence(accounts:Account[],transactions:Expense[],window:Expense[],f:ReportFilters):ReportFigureEvidence[]{
 const out:ReportFigureEvidence[]=[];
 for(const a of accounts){
  const rows=transactions.filter(e=>e.date<=f.to&&!e.transferCounterpartOf&&(e.accountId===a.id||e.toAccountId===a.id));
  out.push({id:`balance:${a.id}`,label:`${a.name} · ledger balance at ${f.to}`,amount:accountBalance(a,rows),formula:'Saved opening balance plus signed ledger movements; liabilities use the ledger owed convention',inputs:[{id:a.id,kind:'opening',amount:a.openingBalance,sourceRefs:[]},...rows.map(e=>({id:e.id,kind:'entry' as const,amount:accountBalance({...a,openingBalance:0},[e]),sourceRefs:refs(e)}))]});
 }
 for(const [key,label] of [['income','Income'],['spent','Spending net of refunds and reimbursements'],['net','Net cash flow']] as const){
  const included=window.filter(e=>!e.transferCounterpartOf&&cashflow([e])[key]!==0);
  out.push({id:`cashflow:${key}`,label,amount:cashflow(window)[key],formula:'Shared ledger cashflow rule; transfers, card settlements and loan principal excluded',inputs:included.map(e=>({id:e.id,kind:'entry',amount:cashflow([e])[key],sourceRefs:refs(e)}))});
 }
 return out;
}