// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
const db=new PGlite();
const original={id:'i1',gstin:'G',kind:'sales',date:'2025-05-01',taxable:100};
const period={id:'fy',from:'2025-04-01',to:'2026-03-31'};
const write=(invoices:object[],periods:object[]=[period])=>db.query('UPDATE finance_preferences SET data=$1::jsonb',[JSON.stringify({books:{closedPeriods:periods,gstInvoices:invoices}})]);
beforeAll(async()=>{
 await db.exec("CREATE TABLE finance_preferences(data jsonb); INSERT INTO finance_preferences VALUES ('{}');");
 await db.exec(readFileSync('.lovable/staged-sql/closed_gst_amendments.sql','utf8'));
},20000);
beforeEach(async()=>{await db.exec("SELECT set_config('ledgerline.erasing','on',false)");await write([original]);await db.exec("SELECT set_config('ledgerline.erasing','off',false)");});
afterAll(()=>db.close());
it('refuses an open-dated replacement of a closed invoice without an auth session',async()=>{
 await expect(write([original,{...original,id:'replacement',date:'2026-05-01',amendsId:'i1',taxable:80}])).rejects.toThrow(/closed-period/);
});
it('refuses same-write removal of the original to evade the closed date',async()=>{
 await expect(write([{...original,id:'replacement',date:'2026-05-01',amendsId:'i1'}])).rejects.toThrow(/closed-period/);
});
it('allows a credit note in an open period and reads back both records',async()=>{
 await write([original,{...original,id:'note',date:'2026-05-01',note:'credit',originalNumber:'i1',taxable:20}]);
 const r=await db.query<{n:number}>("SELECT jsonb_array_length(data->'books'->'gstInvoices') n FROM finance_preferences");expect(r.rows[0]?.n).toBe(2);
});
it('allows amendments once the original period has already been reopened',async()=>{
 await write([original],[]);await write([original,{...original,id:'replacement',date:'2026-05-01',amendsId:'i1'}],[]);
 const r=await db.query<{id:string}>("SELECT data->'books'->'gstInvoices'->1->>'amendsId' id FROM finance_preferences");expect(r.rows[0]?.id).toBe('i1');
});
it('refuses cross-company and nonexistent amendment targets',async()=>{
 await expect(write([original,{...original,id:'new',gstin:'OTHER',amendsId:'i1'}],[])).rejects.toThrow(/same GSTIN/);
 await expect(write([original,{...original,id:'new',amendsId:'missing'}],[])).rejects.toThrow(/existing invoice/);
});