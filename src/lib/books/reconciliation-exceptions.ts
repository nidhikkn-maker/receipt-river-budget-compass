/** Saved-record reconciliation differences for the existing audit/Inbox, never postings. */
import type { Expense } from '../expenses';
import type { VaultDoc } from '../documents';
import { accountBalance, type Account } from '../ledger';
import { fyOf, fyRange, type EntityProfile } from '../entities';
import { effectiveEntity } from './entity-accounts';
import { supplierRecon, customerRecon, loanRecon, investmentRecon, intercompanyRecon } from './recon';
import type { BooksData } from './types';
import type { StoredHolding } from '../investments/demat';
import type { AuditItem } from './audit';
import { advanceCrossProblems } from './gst-special';
import { gstReconciliation } from './gst-reconciliation';
import { reconciliationAnchor, type ReconciliationContext, type ReconciliationInput } from './reconciliation-context';
import { addMoney } from '../money';
export function reconciliationExceptions(p: { today: string; entities: EntityProfile[]; entries: Expense[]; accounts: Account[]; docs: VaultDoc[]; books: BooksData; loans: { id: string; name: string; accountId: string | null }[]; holdings: StoredHolding[] }): AuditItem[] {
 const out: AuditItem[] = [];
 p={...p,entries:[...new Map(p.entries.map(e=>[e.id,e])).values()]};
 const add = (key:string,text:string,to:string,evidence:string,extra:Partial<AuditItem>={}) => out.push({key:`recon:${key}`,type:'Reconciliation',entity:'',account:null,fy:null,risk:'high',text,to,evidence,...extra});
 const entryInput = (e: Expense): ReconciliationInput => ({kind:'entry',id:e.id,label:e.title,date:e.date,amount:e.amount,documentIds:p.docs.filter(d=>d.transactionId===e.id).map(d=>d.id),sourceRefs:[...(e.statementRef?[e.statementRef]:[]),...(e.receipts??[]).map(r=>r.path)]});
 const documentInput = (d: VaultDoc): ReconciliationInput => ({kind:'document',id:d.id,label:d.title,date:d.docDate,amount:d.amount??0,documentIds:[d.id],sourceRefs:[d.filePath]});
 const compared = (key:string,text:string,comparison:ReconciliationContext,extra:Partial<AuditItem>={}) => {
  const inputs=[...comparison.left.inputs,...comparison.right.inputs];
  add(key,text,'/audit',[...new Set(inputs.flatMap(i=>[...i.documentIds,...i.sourceRefs]))].join(', ')||'No retained original linked',{...extra,comparison});
 };
 const years = [...new Set(p.books.gstInvoices.map(i => fyOf(i.date)))];
 for (const year of years) {
  const range=fyRange(year);
  for (const registration of [...new Set(p.books.gstInvoices.map(i=>i.gstin))]) {
   const matches=p.entities.filter(t=>t.gstins.includes(registration));
   const entity=matches.length===1?matches[0]?.id:undefined;
   const invoices=p.books.gstInvoices.filter(i=>i.gstin===registration);
   // With no explicit company mapping, matching cannot borrow another company's payment.
   const entries=matches.length>1?[]:p.entries.filter(e=>entity ? effectiveEntity(e,p.books.entityAccounts ?? {})===entity : !effectiveEntity(e,p.books.entityAccounts ?? {}));
   const payments=(kind:string)=>entries.filter(e=>(e.txnType??'expense')===kind).map(e=>({id:e.id,amount:e.amount,date:e.date,text:`${e.title} ${e.merchant??''} ${e.description}`}));
   const invoiceInputs = (ids:string[]):ReconciliationInput[] => invoices.filter(i=>ids.includes(i.id)).map(i=>({kind:'invoice',id:i.id,label:`${i.party} · ${i.number}${i.note?` (${i.note})`:''}`,date:i.date,amount:addMoney(i.taxable,i.igst,i.cgst,i.sgst,i.cess),documentIds:i.docId&&p.docs.some(d=>d.id===i.docId)?[i.docId]:[],sourceRefs:[]}));
   const partyContext = (family:'supplier'|'customer',r:{gstin:string;party:string;invoiced:number;invoiceIds:string[];paymentIds:string[]},paid:number,difference:number):ReconciliationContext => ({family,registration,recordId:r.gstin||r.party,from:range.start,to:range.end,left:{label:'Invoices (including tax)',amount:r.invoiced,inputs:invoiceInputs(r.invoiceIds)},right:{label:family==='supplier'?'Payments':'Receipts',amount:paid,inputs:entries.filter(e=>r.paymentIds.includes(e.id)).map(entryInput)},difference,unresolved:matches.length>1?['Registration belongs to multiple companies; payment matching is withheld']:[]});
   for (const r of supplierRecon(invoices,payments('expense'),range.start,range.end,p.books.allocationOrder)) compared(`supplier:${registration}:${r.gstin||r.party}:${year}`,`${r.party}: supplier invoices and payments differ by INR ${r.difference.toFixed(2)}`,partyContext('supplier',r,r.paid,r.difference),{entity:entity??registration,fy:year});
   for (const r of customerRecon(invoices,payments('income'),range.start,range.end,p.books.allocationOrder)) compared(`customer:${registration}:${r.gstin||r.party}:${year}`,`${r.party}: customer invoices and receipts differ by INR ${r.outstanding.toFixed(2)}`,partyContext('customer',r,r.received,r.outstanding),{entity:entity??registration,fy:year});
  }
 }
 const loans=p.loans.filter(l=>p.accounts.some(a=>a.id===l.accountId));
 for(const r of loanRecon(loans,p.docs.filter(d=>d.docType==='loan_statement').map(d=>({loanId:d.loanId??null,date:d.docDate,outstanding:d.amount})),(id,date)=>{const a=p.accounts.find(a=>a.id===id);return a?accountBalance(a,p.entries.filter(e=>e.date<=date)):0;})) if(Math.abs(r.difference)>1) {
  const loan=loans.find(l=>l.id===r.loanId),account=p.accounts.find(a=>a.id===loan?.accountId);
  if(!account)continue;
  const originals=p.docs.filter(d=>d.docType==='loan_statement'&&d.loanId===r.loanId&&d.docDate===r.statementDate);
  compared(`loan:${r.loanId}:${r.statementDate}`,`${r.name}: lender and ledger differ by INR ${r.difference.toFixed(2)}`,{family:'loan',recordId:r.loanId,from:r.statementDate,to:r.statementDate,left:{label:'Printed lender outstanding',amount:r.lender,inputs:originals.map(documentInput)},right:{label:'Loan ledger outstanding',amount:r.ledger,inputs:[{kind:'opening',id:account.id,label:`${account.name} · opening balance`,date:null,amount:account.openingBalance,documentIds:[],sourceRefs:[]},...p.entries.filter(e=>e.date<=r.statementDate&&!e.transferCounterpartOf&&(e.accountId===account.id||e.toAccountId===account.id)).map(entryInput)]},difference:r.difference,unresolved:originals.some(d=>d.currency!=='INR')?['Lender denomination is not INR; compare an explicitly converted outstanding']:originals.some(d=>d.amount!==r.lender)?['Same-date lender originals conflict; difference cannot be certified']:[]},{account:account.name,fy:fyOf(r.statementDate)});
 }
 for(const h of p.holdings)for(const r of investmentRecon([h])) compared(`investment:${r.isin}`,`${r.name}: holding difference ${r.difference}${r.unresolved.length?`; ${r.unresolved.length} action quantities need checking`:''}`,{family:'investment',recordId:r.isin,from:h.asOf??'',to:h.asOf??'',left:{label:'Printed holding quantity',amount:r.statement,inputs:[{kind:'holding',id:r.isin,label:h.name,date:h.asOf,amount:h.quantity,documentIds:p.docs.filter(d=>h.sources.includes(d.id)||h.sources.includes(d.filePath)).map(d=>d.id),sourceRefs:h.sources}]},right:{label:'Trade and action quantity',amount:r.fromTransactions,inputs:[...h.lots.filter(l=>!h.asOf||l.date<=h.asOf).map(l=>({kind:'holding' as const,id:l.source,label:`${l.side} · ${h.name}`,date:l.date,amount:l.side==='buy'?l.quantity:-l.quantity,documentIds:p.docs.filter(d=>d.id===l.source||d.filePath===l.source).map(d=>d.id),sourceRefs:[l.source]})),...(h.events??[]).filter(e=>!h.asOf||e.date<=h.asOf).map(e=>({kind:'holding' as const,id:e.source,label:e.kind,date:e.date,amount:['merger','redemption'].includes(e.kind)?-Math.abs(e.quantity??0):['dividend','brokerage'].includes(e.kind)?0:Math.abs(e.quantity??0),documentIds:p.docs.filter(d=>d.id===e.source||d.filePath===e.source).map(d=>d.id),sourceRefs:[e.source]}))]},difference:r.difference,unresolved:[...r.unresolved.map(e=>`${e.kind} ${e.date}: quantity not printed`),...(!h.asOf?['Statement date is unavailable']:[])]});
 for(const r of intercompanyRecon(p.entries,p.books.entityAccounts??{})) if(r.unconfirmed) compared(`inter:${r.a}:${r.b}`,`${r.a} / ${r.b}: ${r.unconfirmed} between-company transfers not confirmed`,{family:'intercompany',recordId:`${r.a}|${r.b}`,from:'',to:p.today,left:{label:`${r.a} → ${r.b}`,amount:r.aToB,inputs:p.entries.filter(e=>r.aToBIds.includes(e.id)).map(entryInput)},right:{label:`${r.b} → ${r.a}`,amount:r.bToA,inputs:p.entries.filter(e=>r.bToAIds.includes(e.id)).map(entryInput)},difference:r.net,unresolved:[`${r.unconfirmed} movements lack both-side confirmation`]},{entity:`${r.a} / ${r.b}`});
 for(const problem of advanceCrossProblems(p.books.gstAdvances??[],p.books.gstInvoices)) add(`gst:${problem}`,`GST invoice allocation: ${problem}`,'/tax','Saved GST advance / invoice register',{type:'GST'});
 return [...new Map([...out,...gstReconciliation(p.books,p.entities,p.entries,p.today,p.docs)].map(i=>[i.key,i])).values()];
}
export function reconciliationDestination(item:AuditItem):string { return item.comparison ? `/audit#${reconciliationAnchor(item.key)}` : item.to; }