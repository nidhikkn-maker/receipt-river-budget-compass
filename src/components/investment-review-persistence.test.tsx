// @vitest-environment node
// Actual review + production holdings-store against installed SQL in isolated PGlite.
// Original bytes and Data API are local adapters: NOT hosted Storage/AI/browser certification.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect,it,vi } from 'vitest';
vi.hoisted(async()=>{
 const {JSDOM}=await import('jsdom');const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
 for(const key of ['window','document','HTMLElement'] as const)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key]});
});
import { fireEvent,render,waitFor,cleanup } from '@testing-library/react';
import { InvestmentReview } from './InvestmentReview';
import { NetWorthCard } from './books/NetWorthCard';
import { parseInvestmentDoc } from '@/lib/investments/demat';
import { readDocRows } from '@/lib/statement-pipeline/source';
import { emptyBooks } from '@/lib/books/types';
import { createDemat,loadDemat } from '@/lib/investments/holdings-store';
const local=vi.hoisted(()=>({db:null as PGlite|null,store:{} as Record<string,unknown>,owner:'00000000-0000-4000-8000-000000000011',loseAccountResponse:true,failHoldings:true}));
vi.mock('@/lib/store',()=>({useStore:()=>local.store}));
vi.mock('@tanstack/react-router',()=>({Link:({children,...props}:React.PropsWithChildren<{to:string}>)=><a {...props}>{children}</a>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:local.owner}}}})},from:(table:string)=>{
 let mode='select',payload:Record<string,unknown>|Record<string,unknown>[]|undefined;const filters:[string,unknown][]=[];let one=false;
 const run=async()=>{
  const db=local.db;if(!db)throw Error('No isolated database');
  if(table==='market_quotes'||table==='job_state')return {data:one?null:[],error:null};
  try{
   if(mode==='insert'){
    const p=payload as Record<string,unknown>;const rows=await db.query<{id:string}>('INSERT INTO demat_accounts(broker,dp_id,client_id,holder) VALUES($1,$2,$3,$4) RETURNING id',[p['broker'],p['dp_id'],p['client_id'],p['holder']]);
    if(local.loseAccountResponse){local.loseAccountResponse=false;return {data:null,error:{message:'Lost account response'}};}
    return {data:rows.rows[0],error:null};
   }
   if(mode==='upsert'){
    if(local.failHoldings){local.failHoldings=false;return {data:null,error:{message:'Holdings network outage'}};}
    for(const p of payload as Record<string,unknown>[]){await db.query(`INSERT INTO security_holdings(owner_id,demat_id,isin,name,quantity,as_of,statement_value,lots,gains,sources,events) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(owner_id,demat_id,isin) DO UPDATE SET name=excluded.name,quantity=excluded.quantity,as_of=excluded.as_of,statement_value=excluded.statement_value,lots=excluded.lots,gains=excluded.gains,sources=excluded.sources,events=excluded.events`,[p['owner_id'],p['demat_id'],p['isin'],p['name'],p['quantity'],p['as_of'],p['statement_value'],...['lots','gains','sources','events'].map(k=>JSON.stringify(p[k]))]);}
    return {data:null,error:null};
   }
   if(!['demat_accounts','security_holdings'].includes(table))throw Error('Unexpected table');
   const where=filters.map(([key],i)=>`${key}=$${i+1}`).join(' AND ');
   const r=await db.query(`SELECT * FROM ${table}${where?' WHERE '+where:''}`,filters.map(f=>f[1]));return {data:one?r.rows[0]??null:r.rows,error:null};
  }catch(error){return {data:null,error:{message:error instanceof Error?error.message:'SQL failure'}};}
 };
 const q:Record<string,unknown>={then:(done:(r:unknown)=>unknown)=>run().then(done)};
 for(const method of ['select','order','in','limit'])q[method]=()=>q;
 q['eq']=(key:string,value:unknown)=>{filters.push([key,value]);return q;};q['maybeSingle']=q['single']=()=>{one=true;return q;};
 q['insert']=(data:Record<string,unknown>)=>{mode='insert';payload=data;return q;};q['upsert']=(data:Record<string,unknown>[])=>{mode='upsert';payload=data;return q;};return q;
}}}));

it('real CSV files → review → source save → failed holdings retry → owner SQL readback → Home; repeat trades/actions never duplicate',async()=>{
 const db=new PGlite();local.db=db;local.loseAccountResponse=true;local.failHoldings=true;
 try{
  await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
   CREATE TABLE original_bytes(id uuid PRIMARY KEY,bytes bytea);`);
  await db.exec(readFileSync('drizzle/migrations/0056_investment_holdings.sql','utf8'));
  await db.exec(readFileSync('drizzle/migrations/0064_retain_investment_statement_events.sql','utf8'));
  await db.query("SELECT set_config('test.uid',$1,false)",[local.owner]);await db.exec('SET ROLE authenticated');
  local.store={userId:local.owner,accounts:[],transactions:[],valuations:[],loans:[],documents:[],preferences:{books:emptyBooks(),assets:[]},addDocument:async(file:File,meta:{id:string})=>{
   await db.exec('RESET ROLE');try{await db.query('INSERT INTO original_bytes VALUES($1,$2) ON CONFLICT DO NOTHING',[meta.id,new Uint8Array(await file.arrayBuffer())]);}finally{await db.exec('SET ROLE authenticated');}return meta.id;
  }};
  const source=new File(['Demat holding statement\nDP ID: IN303028 Client ID: 12345678\nHolding as on 04-10-2026\nINE002A01018 RELIANCE 8 640'],'demat.csv');
  const parsed=parseInvestmentDoc(await readDocRows(source));if(!parsed)throw Error('Not read as demat');
  let view=render(<InvestmentReview file={source} doc={parsed} onClose={()=>{}} onUploadMore={()=>{}}/>);
  await waitFor(()=>expect(view.getByRole('button',{name:'Save to Investments'})).toBeEnabled());
  fireEvent.click(view.getByRole('button',{name:'Save to Investments'}));
  await waitFor(()=>expect(local.failHoldings).toBe(false));
  await waitFor(()=>expect(view.getByRole('button',{name:'Save to Investments'})).toBeEnabled());
  fireEvent.click(view.getByRole('button',{name:'Save to Investments'}));
  await waitFor(()=>expect(view.getByRole('button',{name:'Undo'})).toBeVisible());view.unmount();
  const trade=new File(['Transaction statement\nDP ID: IN303028 Client ID: 12345678\n02-10-2026 INE002A01018 RELIANCE BUY 6 100 600\n03-10-2026 INE002A01018 RELIANCE BONUS 2\n04-10-2026 INE002A01018 RELIANCE DIVIDEND 20'],'trades.csv');
  const trades=parseInvestmentDoc(await readDocRows(trade));if(!trades)throw Error('No transaction rows');
  for(let retry=0;retry<2;retry++){
   view=render(<InvestmentReview file={trade} doc={trades} onClose={()=>{}} onUploadMore={()=>{}}/>);
   await waitFor(()=>expect(view.getByRole('button',{name:'Save to Investments'})).toBeEnabled());fireEvent.click(view.getByRole('button',{name:'Save to Investments'}));
   await waitFor(()=>expect(view.getByRole('button',{name:'Undo'})).toBeVisible());view.unmount();
  }
  const persisted=await loadDemat();expect(persisted).toHaveLength(1);expect(persisted[0]?.holdings).toHaveLength(1);
  const holding=persisted[0]?.holdings[0];expect(holding).toMatchObject({quantity:8,statementValue:640});expect(holding?.lots).toHaveLength(1);expect(holding?.events).toHaveLength(2);
  await db.exec('RESET ROLE');const originals=(await db.query<{id:string;bytes:Uint8Array}>('SELECT * FROM original_bytes')).rows;
  expect(originals).toHaveLength(2);expect(holding?.sources.every(id=>originals.some(o=>o.id===id))).toBe(true);
  expect(holding?.events?.every(e=>originals.some(o=>o.id===e.source))).toBe(true);
  expect(new TextDecoder().decode(originals.find(o=>holding?.lots[0]?.source===o.id)?.bytes)).toContain('RELIANCE BUY 6 100 600');
  await db.exec('SET ROLE authenticated');view=render(<NetWorthCard/>);
  await waitFor(()=>expect(view.container.textContent).toContain('₹640.00'));view.unmount();
  await db.query("SELECT set_config('test.uid',$1,false)",['00000000-0000-4000-8000-000000000012']);expect(await loadDemat()).toEqual([]);
  // Cannot create a second account through a repeated lost-response-compatible identity.
  await db.query("SELECT set_config('test.uid',$1,false)",[local.owner]);expect(await createDemat(parsed)).toBe(persisted[0]?.id);
 }finally{cleanup();await db.close();local.db=null;}
},30000);