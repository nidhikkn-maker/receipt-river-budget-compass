// @vitest-environment node
import { it,expect } from 'vitest';
import { unzipSync,strFromU8 } from 'fflate';
import { corporateAuditPack } from './corporate-audit-pack';
import { corporateStatements } from './corporate-statements';
import { emptyBooks } from './types';
import type { Expense } from '../expenses';
const working=()=>corporateStatements({entityId:'A',entities:[{id:'A',name:'Synthetic Ltd',kind:'company',pan:'',gstins:[],booksFrom:'2026-27'}],accounts:[{id:'bank',name:'Bank',kind:'current',openingBalance:0,archived:false}],books:{...emptyBooks(),entityAccounts:{A:['bank']}},documents:[],entries:[{id:'bill',title:'Original bill',category:'Office',merchant:null,scope:'business',memberId:null,splits:[],receipts:[{path:'owner/original.pdf',name:'original.pdf',type:'application/pdf'}],amount:100,originalAmount:100,currency:'INR',fxRate:1,date:'2026-04-01',description:'',paymentMethod:'cash',accountId:'bank',reconciledAt:null,statementRef:null} satisfies Expense],from:'2026-04-01',to:'2027-03-31'});
it('audit pack contains five matching CSV/Excel/PDF statements and hash-bound actual originals without extra ledger writes',async()=>{
 const w=working();let signs=0;const original=new TextEncoder().encode('%PDF- synthetic original bytes');
 const blob=await corporateAuditPack(w,[],async()=>{signs++;return 'https://isolated.example/original'},async()=>new Response(original) as never);
 const zip=unzipSync(new Uint8Array(await blob.arrayBuffer()));expect(signs).toBe(1);expect(Object.keys(zip)).toHaveLength(20);
 expect(strFromU8(zip['company-profit-loss.csv']??new Uint8Array())).toContain('-100.00');
 const manifest=JSON.parse(strFromU8(zip['accounting-evidence.json']??new Uint8Array()));expect(manifest.working.profit).toBe(-100);expect(manifest.originals[0].sha256).toHaveLength(64);
 expect(zip[manifest.originals[0].zipPath]).toEqual(original);expect(w.lines).toHaveLength(2);
});
it('revoked or empty originals refuse the entire audit pack, never an incomplete successful ZIP',async()=>{
 await expect(corporateAuditPack(working(),[],async()=>null)).rejects.toThrow('access has ended');
 await expect(corporateAuditPack(working(),[],async()=>'https://isolated.example',async()=>new Response(new Uint8Array()) as never)).rejects.toThrow('empty');
});