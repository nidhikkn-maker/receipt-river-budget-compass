import type { FinancePreferences } from './preferences';
const top=['assets','entities','paymentInstruments','reimbursementProfiles'] as const;
const books=['policy','rules','fieldMappings','entityAccounts','fyRecords','properties','leases','propertyCosts','assetEvents','holdings','priceOverrides','goldRate','taxProfiles','entityTaxProfiles','taxCredits','taxDeductions','salaryEvidence','gstInvoices','gstAdvances','gstFilings','loanBalances'] as const;
const canonical=(v:unknown):string=>JSON.stringify(v==null?null:Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,JSON.parse(canonical(x))])):v);
export function preferenceReviewSections(previous:FinancePreferences,next:FinancePreferences):string[]{
 const out:string[]=[];
 for(const k of top) if(canonical(previous[k as keyof FinancePreferences])!==canonical(next[k as keyof FinancePreferences]))out.push(k);
 for(const k of books)if(canonical(previous.books?.[k])!==canonical(next.books?.[k]))out.push(`books.${k}`);
 return out.sort();
}
export const reviewSectionLabel=(key:string)=>key.replace(/^books\./,'').replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());