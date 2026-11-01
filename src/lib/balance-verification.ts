import { accountBalance, type Account } from './ledger';
import { reconcileStatement } from './historical-import';
import type { Expense, StatementLine } from './expenses';

export interface SourceBalance { value: number | null; quote: string; page: number | null }
export interface BalanceEvidence { opening: SourceBalance; closing: SourceBalance; periodFrom: string | null; periodTo: string | null }
export interface BalanceReview { sourceOpening: number | null; sourceClosing: number | null; sourceReference: string; checkedOriginal: boolean; reviewedAt: string }
const difference=(a:number|null,b:number|null)=>a==null||b==null?null:Math.round((a-b)*100)/100;
export function verifyHistoricalBalances(input:{opening:number|null;closing:number|null;sourceOpening:number|null;sourceClosing:number|null;checkedOriginal:boolean;reference:string;lines:StatementLine[];liability:boolean;ledgerOpening:number|null;ledgerClosing:number|null;unresolved:number}) {
  const arithmetic=reconcileStatement(input.opening,input.closing,input.lines,input.liability);
  const openingDifference=difference(input.opening,input.sourceOpening),closingDifference=difference(input.closing,input.sourceClosing);
  const sourceVerified=input.checkedOriginal && !!input.reference.trim() && openingDifference===0 && closingDifference===0;
  const ledgerOpeningDifference=difference(input.ledgerOpening,input.sourceOpening),ledgerClosingDifference=difference(input.ledgerClosing,input.sourceClosing);
  return {...arithmetic,openingDifference,closingDifference,sourceVerified,ledgerOpeningDifference,ledgerClosingDifference,fullyReconciled:sourceVerified&&arithmetic.verified&&input.unresolved===0&&ledgerOpeningDifference===0&&ledgerClosingDifference===0};
}
export function ledgerPeriodBalances(account:Account,transactions:Expense[],from:string,to:string) {
  return {opening:accountBalance(account,transactions.filter(t=>t.date<from)),closing:accountBalance(account,transactions.filter(t=>t.date<=to))};
}