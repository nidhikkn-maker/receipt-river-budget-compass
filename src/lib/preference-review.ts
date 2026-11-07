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
/**
 * A new account's stored settings omit protected sections that the app shows as empty
 * defaults. For each protected section the owner did not change and that is absent from
 * what is stored, leave it out of the save so the database sees no protected change.
 * Stored values are never substituted: if the stored copy is stale, the save fails the
 * database check rather than overwriting anything.
 */
export function alignUnchangedSections(stored:Record<string,unknown>|null|undefined,next:FinancePreferences,changed:readonly string[]):FinancePreferences{
 const raw=(stored??{}) as Record<string,unknown>,out={...next} as Record<string,unknown>;
 for(const k of top) if(!changed.includes(k)&&!(k in raw)) delete out[k];
 if(out.books&&typeof out.books==='object'){
  const rb=(raw.books&&typeof raw.books==='object'?raw.books:{}) as Record<string,unknown>,nb={...(out.books as Record<string,unknown>)};
  for(const k of books) if(!changed.includes(`books.${k}`)&&!(k in rb)) delete nb[k];
  out.books=nb;
 }
 return out as FinancePreferences;
}
