/** Saved-record reconciliation differences for the existing audit/Inbox, never postings. */
import type { Expense } from '../expenses';
import type { VaultDoc } from '../documents';
import { accountBalance, type Account } from '../ledger';
import { fyOf, fyRange } from '../entities';
import { effectiveEntity } from './entity-accounts';
import { supplierRecon, customerRecon, loanRecon, investmentRecon, intercompanyRecon } from './recon';
import type { BooksData } from './types';
import type { StoredHolding } from '../investments/demat';
import type { AuditItem } from './audit';
export function reconciliationExceptions(p: { today: string; entries: Expense[]; accounts: Account[]; docs: VaultDoc[]; books: BooksData; loans: { id: string; name: string; accountId: string | null }[]; holdings: StoredHolding[] }): AuditItem[] {
 const out: AuditItem[] = [];
 const add = (key:string,text:string,to:string,evidence:string,extra:Partial<AuditItem>={}) => out.push({key:`recon:${key}`,type:'Reconciliation',entity:'',account:null,fy:null,risk:'high',text,to,evidence,...extra});
 const years = [...new Set(p.books.gstInvoices.map(i => fyOf(i.date)))];
 for (const year of years) {
  const range=fyRange(year);
  for (const registration of [...new Set(p.books.gstInvoices.map(i=>i.gstin))]) {
   const entity=p.books.taxProfiles.find(t=>t.gstins.includes(registration))?.entityId;
   const invoices=p.books.gstInvoices.filter(i=>i.gstin===registration);
   // With no explicit company mapping, matching cannot borrow another company's payment.
   const entries=p.entries.filter(e=>entity ? effectiveEntity(e,p.books.entityAccounts ?? {})===entity : !effectiveEntity(e,p.books.entityAccounts ?? {}));
   const payments=(kind:string)=>entries.filter(e=>(e.txnType??'expense')===kind).map(e=>({id:e.id,amount:e.amount,date:e.date,text:`${e.title} ${e.merchant??''} ${e.description}`}));
   for (const r of supplierRecon(invoices,payments('expense'),range.start,range.end,p.books.allocationOrder)) add(`supplier:${registration}:${r.gstin||r.party}:${year}`,`${r.party}: supplier invoices and payments differ by INR ${r.difference.toFixed(2)}`,'/audit',invoices.filter(i=>i.kind==='purchase'&&(i.partyGstin||i.party)===(r.gstin||r.party)).map(i=>i.docId||i.id).join(', '),{entity:entity??registration,fy:year});
   for (const r of customerRecon(invoices,payments('income'),range.start,range.end,p.books.allocationOrder)) add(`customer:${registration}:${r.gstin||r.party}:${year}`,`${r.party}: customer invoices and receipts differ by INR ${r.outstanding.toFixed(2)}`,'/audit',invoices.filter(i=>i.kind==='sales'&&(i.partyGstin||i.party)===(r.gstin||r.party)).map(i=>i.docId||i.id).join(', '),{entity:entity??registration,fy:year});
  }
 }
 const loans=p.loans.filter(l=>p.accounts.some(a=>a.id===l.accountId));
 for(const r of loanRecon(loans,p.docs.filter(d=>d.docType==='loan_statement').map(d=>({loanId:d.loanId??null,date:d.docDate,outstanding:d.amount})),(id,date)=>{const a=p.accounts.find(a=>a.id===id);return a?accountBalance(a,p.entries.filter(e=>e.date<=date)):0;})) if(Math.abs(r.difference)>1) add(`loan:${r.loanId}:${r.statementDate}`,`${r.name}: lender and ledger differ by INR ${r.difference.toFixed(2)}`,'/audit',p.docs.filter(d=>d.loanId===r.loanId&&d.docDate===r.statementDate).map(d=>d.id).join(', '),{fy:fyOf(r.statementDate)});
 for(const r of investmentRecon(p.holdings)) add(`investment:${r.isin}`,`${r.name}: holding difference ${r.difference}${r.unresolved.length?`; ${r.unresolved.length} action quantities need checking`:''}`,'/wealth',p.holdings.filter(h=>h.isin===r.isin).flatMap(h=>h.sources).join(', '));
 for(const r of intercompanyRecon(p.entries,p.books.entityAccounts??{})) if(r.unconfirmed) add(`inter:${r.a}:${r.b}`,`${r.a} / ${r.b}: ${r.unconfirmed} between-company transfers not confirmed`,'/transfers',p.entries.filter(e=>e.txnType==='transfer'&&!e.reconciledAt).map(e=>e.statementRef||e.id).join(', '),{entity:`${r.a} / ${r.b}`});
 return out;
}