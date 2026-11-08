/** Only owner-confirmed, exactly named printed totals can support a return comparison. */
import type { VaultDoc } from '../documents';
export function gstReturnFigures(doc:VaultDoc){
 const read=(label:string)=>{const matches=(doc.fields??[]).filter(f=>f.label.trim().toLowerCase()===label&&f.status!=='read');if(matches.length!==1)return undefined;const n=Number(matches[0]?.value.replace(/,/g,'').replace(/^INR\s*/i,''));return Number.isFinite(n)&&n>=0?n:undefined;};
 return {outputTax:read('output tax'),itcClaimed:read('itc claimed'),netPayable:read('net payable')};
}