// Opt-in service acceptance: synthetic image ONLY, existing reader and real Gateway.
// Usage: NODE_PATH=$PWD/node_modules bun scripts/check-actual-invoice-extraction.ts /tmp/browser/invoice-acceptance
// Only auth/privacy/database boundaries are disposable adapters; inference is not mocked.
import { mock } from 'bun:test';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir=process.argv[2];if(!dir)throw Error('Supply a folder containing only synthetic invoice.png');
mock.module('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(h:unknown)=>h};return b;}}));
mock.module(resolve('src/lib/real-account-middleware.ts'),()=>({requireRealAccount:{}}));
const {extractDocument}=await import('../src/lib/document-extract.functions');
const {defaultPreferences}=await import('../src/lib/preferences');
const prefs=defaultPreferences();prefs.aiEnabled=true;prefs.aiReadsDocuments=true;
const context={userId:'synthetic-owner',supabase:{from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{data:prefs},error:null})};return q;}}};
const bytes=readFileSync(`${dir}/invoice.png`);
const result=await (extractDocument as unknown as (a:unknown)=>Promise<unknown>)({data:{dataUrl:`data:image/png;base64,${bytes.toString('base64')}`,mimeType:'image/png'},context});
writeFileSync(`${dir}/extracted.json`,JSON.stringify(result,null,2));
console.log('Real existing reader result retained. Synthetic adapters only; no hosted auth/persistence acceptance.');