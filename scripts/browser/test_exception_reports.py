import asyncio,json,re,urllib.request
from pathlib import Path
from playwright.async_api import async_playwright,expect
OUT=Path('/tmp/browser/exception-reports')
HTML='<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/exception-reports.fixture.tsx"></script></body></html>'
STORE='''import {defaultPreferences} from '/src/lib/preferences.ts';import {emptyBooks} from '/src/lib/books/types.ts';
const base={id:'a',title:'Alpha bill',merchant:'Acme Traders',category:'Other',scope:'business',memberId:null,splits:[],receipts:[],amount:200.25,originalAmount:200.25,currency:'INR',fxRate:1,date:'2026-11-01',description:'',paymentMethod:'cash',accountId:'bank-a',reconciledAt:null,statementRef:null};
const fixed=sessionStorage.getItem('fixed')==='yes';const p=defaultPreferences();p.entities=[{id:'A',name:'Alpha',kind:'company',pan:'',gstins:['GA'],booksFrom:'2026-27'}];p.books={...emptyBooks(),entityAccounts:{A:['bank-a']},gstInvoices:[{id:'i',gstin:'GA',kind:'purchase',number:'I1',date:'2026-11-01',party:'Acme Traders',partyGstin:'',taxable:250.25,igst:0,cgst:0,sgst:0,cess:0,docId:'doc-a'}]};
const transactions=[base,...(fixed?[{...base,id:'p',amount:50,originalAmount:50,receipts:[{name:'bill',path:'owner/p',type:'image/png'}]}]:[])];
export function useStore(){return {userId:'isolated-report-owner',name:'Isolated owner',transactions,expenses:transactions,accounts:[{id:'bank-a',name:'Alpha bank',kind:'savings',openingBalance:1000,archived:false},{id:'bank-b',name:'Excluded Beta',kind:'savings',openingBalance:10000,archived:false}],preferences:p,documents:fixed?[{id:'doc-a',transactionId:'a',title:'Alpha original',docType:'invoice',docDate:'2026-11-01',createdAt:'2026-11-01',fields:[],text:'Printed invoice 250.25'}]:[],loans:[],commitments:[],valuations:[],budgets:{},pendingCount:0,departmentBudgets:{},memberName:()=>'',members:[],refresh:async()=>{},savePreferences:async()=>{}}}'''
CLIENT='''export const supabase={storage:{from:()=>({download:async path=>{const x=sessionStorage.getItem('pdf:'+path);return x?{data:new Blob([new Uint8Array(JSON.parse(x))],{type:'application/pdf'}),error:null}:{data:null,error:{message:'404 not found'}}},upload:async(path,blob)=>{sessionStorage.setItem('pdf:'+path,JSON.stringify(Array.from(new Uint8Array(await blob.arrayBuffer()))));sessionStorage.setItem('uploads',String(Number(sessionStorage.getItem('uploads')||0)+1));return {error:null}},remove:async()=>{throw Error('No deletion permitted')}})},from:table=>{let filters={},payload=null;const q={};for(const m of ['select','order','limit','range','contains','in'])q[m]=()=>q;q.eq=(k,v)=>{filters[k]=v;return q};q.insert=async row=>{if(table==='report_jobs')return {error:null};const rows=JSON.parse(sessionStorage.getItem('history')||'[]');rows.push({...row,created_at:'2026-11-08',status:'ready'});sessionStorage.setItem('history',JSON.stringify(rows));sessionStorage.setItem('inserts',String(Number(sessionStorage.getItem('inserts')||0)+1));sessionStorage.setItem('loseRead','yes');throw Error('Isolated lost committed reply')};q.maybeSingle=async()=>{if(sessionStorage.getItem('loseRead')==='yes'){sessionStorage.removeItem('loseRead');return {data:null,error:{message:'Interrupted readback'}}}return {data:JSON.parse(sessionStorage.getItem('history')||'[]').find(r=>Object.entries(filters).every(([k,v])=>r[k]===v))||null,error:null}};q.then=(ok,bad)=>Promise.resolve({data:table==='report_history'?JSON.parse(sessionStorage.getItem('history')||'[]'):[],error:null}).then(ok,bad);return q},rpc:async()=>({data:[],error:null})};'''
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True);page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   q=route.request;path=q.url.split('localhost:8080')[-1].split('?')[0]
   if not q.url.startswith('http://localhost:8080'):await route.abort();return
   if q.is_navigation_request():await route.fulfill(body=HTML,content_type='text/html');return
   stubs={'/src/lib/store.tsx':STORE,'/src/integrations/supabase/client.ts':CLIENT,'/src/components/books/useBooks.ts':'import {useStore} from \'/src/lib/store.tsx\';export const useDemat=()=>[];export const useBooks=()=>({books:useStore().preferences.books,save:async()=>{}});','/src/lib/import-repository.ts':'export const listImportRules=async()=>[];export const statementEvidence=async()=>null;export const listImports=async()=>[];export const listImportRows=async()=>[];','/src/components/InboxWork.tsx':'export const InboxWork=()=>null;','/src/components/books/DepreciationInboxCard.tsx':'export const DepreciationInboxCard=()=>null;','/src/components/BackgroundReports.tsx':'export const BackgroundReports=()=>null;'}
   if path in stubs:await route.fulfill(body=stubs[path],content_type='application/javascript');return
   if q.method not in ['GET','HEAD']:raise AssertionError('External writes blocked')
   await route.continue_()
  await c.route('**/*',isolate)
  await page.goto('http://localhost:8080/inbox',wait_until='networkidle')
  await page.locator('summary').filter(has_text='Records checks').click()
  await expect(page.get_by_text(re.compile('supplier invoices and payments differ'))).to_be_visible()
  row=page.locator('li').filter(has_text='supplier invoices and payments differ');await expect(row.get_by_role('link',name='Open')).to_have_attribute('href','/audit')
  await page.screenshot(path=str(OUT/'1-inbox-exceptions.png'))
  await row.get_by_role('link',name='Open').click();await expect(page).to_have_url(re.compile('/audit$'));await expect(page.get_by_text('Checks & history of changes',exact=True)).to_be_visible();await expect(page.get_by_text(re.compile('supplier invoices and payments differ'))).to_be_visible();await page.screenshot(path=str(OUT/'1b-audit-linked.png'))
  await page.goto('http://localhost:8080/inbox',wait_until='networkidle')
  await page.locator('summary').filter(has_text='Business & company profile').click();missing=page.locator('li').filter(has_text='missing bill; tax and audit evidence');await expect(missing).to_have_count(1);await missing.get_by_role('link',name='Open').click();await expect(page).to_have_url(re.compile('/gst-check$'));await expect(page.get_by_text('Suppliers & invoices',exact=True)).to_be_visible()
  await page.evaluate("sessionStorage.setItem('fixed','yes')");await page.reload(wait_until='networkidle')
  await expect(page.get_by_text(re.compile('supplier invoices and payments differ'))).to_have_count(0)
  await expect(page.get_by_text(re.compile('missing bill; tax and audit evidence'))).to_have_count(0)
  await page.goto('http://localhost:8080/report-centre',wait_until='networkidle')
  await page.get_by_text('More filters',exact=True).click();await page.locator('label').filter(has_text=re.compile('^Account')).locator('select').select_option('bank-a')
  await page.get_by_role('button',name='Generate PDF',exact=True).click()
  await expect(page.get_by_role('button',name='Retry saving PDF',exact=True)).to_be_visible(timeout=30000)
  await page.reload(wait_until='networkidle');await expect(page.get_by_role('button',name='Retry saving PDF',exact=True)).to_be_enabled(timeout=30000)
  await page.get_by_role('button',name='Retry saving PDF',exact=True).click()
  await expect(page.get_by_role('button',name='Generate PDF',exact=True)).to_be_enabled()
  await page.screenshot(path=str(OUT/'2-recovered-report.png'))
  async with page.expect_download() as event:await page.get_by_role('button',name='Download',exact=True).first.click()
  file=await event.value;await file.save_as(OUT/'frozen.pdf')
  from pypdf import PdfReader
  text='\n'.join(p.extract_text() or '' for p in PdfReader(OUT/'frozen.pdf').pages);assert '749.75' in text and 'Excluded Beta' not in text
  rows=await page.evaluate("JSON.parse(sessionStorage.getItem('history'))");assert len(rows)==1 and rows[0]['filters']['snapshot']['sourceEntryIds']==['a','p']
  assert await page.evaluate("sessionStorage.getItem('uploads')==='1' && sessionStorage.getItem('inserts')==='1'")
  assert not errors,errors
  print(json.dumps({'actual_inbox_resolution_reload':'PASS','actual_report_centre_encrypted_reload_retry':'PASS','frozen_pdf_ownership':'PASS','one_upload_one_history':'PASS','runtime_errors':errors,'scope':'isolated local adapters, NOT hosted'}))
  await b.close()
asyncio.run(main())
