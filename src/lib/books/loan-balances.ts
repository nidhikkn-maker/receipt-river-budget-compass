import type { VaultDoc } from '../documents';
import { sumMoney } from '../money';
/** A confirmed lender balance. `supersededAt/By` mark an observation replaced by a later confirmation for the same date (P0-014):
 * it is kept for the record but no longer used, exactly as if it had been replaced. */
export interface LoanBalanceEvidence { id: string; loanId: string; amount: number; asOf: string; docId: string; sourceQuote: string; confirmedAt: string; supersededAt?: string | undefined; supersededBy?: string | undefined }
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
  const candidates=evidence.filter(e=>e.loanId===loan.id && !e.supersededBy).filter(e=>{try{validateLoanBalance(e,loan.id,documents,today);return true;}catch{return false;}}).sort((a,b)=>b.asOf.localeCompare(a.asOf)||b.confirmedAt.localeCompare(a.confirmedAt));
  const latest=candidates[0]; const rival=latest && candidates.some(e=>e.asOf===latest.asOf && e.amount!==latest.amount);
  return {loan,evidence:rival?null:latest??null,conflict:!!rival};
 });
 const missing=rows.filter(r=>!r.evidence).map(r=>r.loan.name);
 const dates=rows.flatMap(r=>r.evidence?[r.evidence.asOf]:[]).sort();
 return {rows,amount:sumMoney(rows.map(r=>r.evidence?.amount??0)),missing,asOf:dates[0]??null};
}
/** Printed outstanding proposal read from a retained lender statement's extracted fields. Never confirms; ambiguous values return null. */
export type PrintedBalanceProposal = { amount: number; asOf: string | null; sourceQuote: string; ambiguous: false } | { ambiguous: true; reason: string } | null;
const OUTSTANDING = /(principal\s+outstanding|outstanding\s+(principal|balance|amount)|closing\s+(principal|balance)|balance\s+outstanding|loan\s+outstanding)/i;
const AS_OF = /(as\s+(on|of)|balance\s+date|statement\s+date|period\s+end|closing\s+date)/i;
function num(v: string): number | null { const s=v.replace(/[₹,\s]|rs\.?|inr/gi,''); return /^\d+(\.\d+)?$/.test(s)?Number(s):null; }
function isoDate(v: string): string | null {
 const t=v.trim(); if(/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
 const m=t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if(!m||!m[1]||!m[2]||!m[3]) return null;
 const iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; const d=new Date(`${iso}T00:00:00Z`);
 return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===iso ? iso : null;
}
export function proposePrintedBalance(doc: Pick<VaultDoc,'docType'|'docDate'|'fields'>): PrintedBalanceProposal {
 if(doc.docType!=='loan_statement') return null;
 const fields=doc.fields??[];
 const hits=fields.filter(f=>OUTSTANDING.test(f.label)).map(f=>({f,n:num(f.value)})).filter(h=>h.n!==null);
 if(!hits.length) return null;
 const values=[...new Set(hits.map(h=>h.n))];
 if(values.length>1) return {ambiguous:true,reason:`Statement prints ${values.length} different outstanding figures; enter the correct one yourself`};
 const h=hits[0]; if(!h) return null;
 const dateField=fields.find(f=>AS_OF.test(f.label)&&isoDate(f.value));
 const asOf=dateField?isoDate(dateField.value):(doc.docDate&&isoDate(doc.docDate))||null;
 const where=h.f.page?` (page ${h.f.page})`:h.f.section?` (${h.f.section})`:'';
 return {amount:h.n as number,asOf,sourceQuote:`${(h.f.quote||`${h.f.label} ${h.f.originalValue??h.f.value}`).trim()}${where}`,ambiguous:false};
}

/** Confirm a lender balance without losing the earlier one: a confirmation for the same loan and date supersedes the older
 * observation (kept with supersededAt/supersededBy) instead of deleting it. Figures match the old replace-in-place rule. */
export function withConfirmedBalance(list: readonly LoanBalanceEvidence[], e: LoanBalanceEvidence): LoanBalanceEvidence[] {
 return [...list.map(x=>x.loanId===e.loanId && x.asOf===e.asOf && !x.supersededBy ? { ...x, supersededAt: e.confirmedAt, supersededBy: e.id } : x), e];
}
