import type { VaultDoc } from '../documents';
export interface LoanBalanceEvidence { id: string; loanId: string; amount: number; asOf: string; docId: string; sourceQuote: string; confirmedAt: string }
type LoanRef = { id: string; name: string; accountId: string | null; status: string };
type DocRef = Pick<VaultDoc, 'id' | 'loanId' | 'docType'>;
export function validateLoanBalance(e: LoanBalanceEvidence, loanId: string, documents: DocRef[], today: string): void {
 if (!Number.isFinite(e.amount) || e.amount < 0) throw new Error('Enter a non-negative outstanding balance');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(e.asOf) || Number.isNaN(Date.parse(e.asOf)) || new Date(`${e.asOf}T00:00:00Z`).toISOString().slice(0,10)!==e.asOf || e.asOf > today) throw new Error('Choose a valid statement balance date, not a future date');
 if (e.loanId !== loanId || !documents.some(d => d.id===e.docId && d.loanId===loanId && d.docType==='loan_statement')) throw new Error('Choose a retained lender statement linked to this loan');
 if (e.sourceQuote.trim().length<5 || !e.confirmedAt) throw new Error('Confirm the printed outstanding balance and its source');
}
export function standaloneLoanBalances(loans: LoanRef[], evidence: LoanBalanceEvidence[], documents: DocRef[], today: string) {
 const rows=loans.filter(l=>!l.accountId && l.status!=='closed').map(loan=>{
  const candidates=evidence.filter(e=>e.loanId===loan.id).filter(e=>{try{validateLoanBalance(e,loan.id,documents,today);return true;}catch{return false;}}).sort((a,b)=>b.asOf.localeCompare(a.asOf)||b.confirmedAt.localeCompare(a.confirmedAt));
  const latest=candidates[0]; const rival=latest && candidates.some(e=>e.asOf===latest.asOf && e.amount!==latest.amount);
  return {loan,evidence:rival?null:latest??null,conflict:!!rival};
 });
 const missing=rows.filter(r=>!r.evidence).map(r=>r.loan.name);
 const dates=rows.flatMap(r=>r.evidence?[r.evidence.asOf]:[]).sort();
 return {rows,amount:Math.round(rows.reduce((s,r)=>s+(r.evidence?.amount??0),0)*100)/100,missing,asOf:dates[0]??null};
}