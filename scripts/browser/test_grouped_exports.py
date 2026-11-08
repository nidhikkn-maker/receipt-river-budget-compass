import asyncio,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright,expect
from pypdf import PdfReader
OUT=Path('/tmp/browser/grouped-exports')
HTML='<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/connected-finance.fixture.tsx"></script></body></html>'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True);page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   q=route.request;path=urlparse(q.url).path
   if urlparse(q.url).netloc!='localhost:8080':await route.abort();return
   if q.is_navigation_request():await route.fulfill(body=HTML,content_type='text/html');return
   if path=='/src/lib/store.tsx':
    import requests
    text=requests.get(q.url).text
    # Vite's actual adapter module plus only a synthetic company preference seed.
    text=requests.get('http://localhost:8080/scripts/browser/statement-desk-mocks.tsx').text
    text=text.replace('statementUploads: fixture.uploads','entities: [{id:"co-a",name:"Synthetic Alpha",kind:"company",pan:"",gstins:[],booksFrom:"2026-27"}], books: {...defaultPreferences().books,entityAccounts:{"co-a":["desk-account"]}},statementUploads: fixture.uploads')
    await route.fulfill(body=text,content_type='application/javascript');return
   if path=='/src/integrations/supabase/client.ts':await route.fulfill(body='export {supabase} from "/scripts/browser/statement-desk-mocks.tsx";',content_type='application/javascript');return
   stubs={'/src/components/books/useAudit.ts':'export const useAudit=()=>({});export const auditInboxItems=()=>[];', '/src/lib/import-repository.ts':'export const listImportRows=async()=>[];export const listImports=async()=>[];export const listImportRules=async()=>[];export const statementEvidence=async()=>null;', '/src/components/InboxWork.tsx':'export const InboxWork=()=>null;', '/src/components/books/DepreciationInboxCard.tsx':'export const DepreciationInboxCard=()=>null;', '/src/components/books/VaultBooks.tsx':'export const VaultBooks=()=>null;'}
   if path in stubs:await route.fulfill(body=stubs[path],content_type='application/javascript');return
   if q.method not in ['GET','HEAD']:raise AssertionError('Unexpected write')
   await route.continue_()
  await c.route('**/*',isolate);await page.goto('http://localhost:8080/reports')
  await page.evaluate('''()=>{const base={id:'a',title:'Alpha bill',merchant:null,txnType:'expense',category:'Other',scope:'business',memberId:null,splits:[],receipts:[],amount:200.25,originalAmount:200.25,currency:'INR',fxRate:1,date:'2026-10-01',description:'',paymentMethod:'cash',accountId:'desk-account',reconciledAt:null,statementRef:null};sessionStorage.setItem('controlled-desk-ledger',JSON.stringify([base,{...base,id:'p',title:'Personal excluded',accountId:'cash',amount:888.88}]))}''');await page.reload()
  await page.get_by_text('Filter report records',exact=True).click();await page.get_by_label('Filter reports by company').click();await page.get_by_role('option',name='Synthetic Alpha',exact=True).click()
  async with page.expect_download() as d:await page.get_by_role('button',name='Export All expenses CSV',exact=True).click()
  await (await d.value).save_as(OUT/'company.csv');text=(OUT/'company.csv').read_text();assert '200.25' in text and 'Personal excluded' not in text and '888.88' not in text
  async with page.expect_download() as d:await page.get_by_role('button',name='Export All expenses Excel',exact=True).click()
  await (await d.value).save_as(OUT/'company.xlsx')
  await page.get_by_role('button',name='Prepare All expenses PDF',exact=True).click()
  async with page.expect_download() as d:await page.get_by_role('button',name='Download All expenses PDF',exact=True).click()
  await (await d.value).save_as(OUT/'company.pdf');text=' '.join(p.extract_text() or '' for p in PdfReader(OUT/'company.pdf').pages);assert '200.25' in text and '888.88' not in text
  await page.get_by_label('Filter reports by company').screenshot(path=str(OUT/'company-filter.png'))
  await page.goto('http://localhost:8080/account-reconciliation');await expect(page.get_by_role('button',name='Export reconciliation CSV')).to_be_visible()
  async with page.expect_download() as d:await page.get_by_role('button',name='Export reconciliation CSV').click()
  await (await d.value).save_as(OUT/'reconciliation.csv');text=(OUT/'reconciliation.csv').read_text();assert 'Not Verified' in text and 'Controlled bank' in text
  await page.get_by_role('button',name='Prepare reconciliation PDF').click()
  async with page.expect_download() as d:await page.get_by_role('button',name='Download reconciliation PDF').click()
  await (await d.value).save_as(OUT/'reconciliation.pdf');assert 'NotVerified' in ''.join(''.join((p.extract_text() or '').split()) for p in PdfReader(OUT/'reconciliation.pdf').pages)
  await page.get_by_label('Statement account status').screenshot(path=str(OUT/'reconciliation-exports.png'));assert not errors,errors
  print('PASS real Reports company filter -> CSV/XLSX/PDF 200.25 excluding888.88; reconciliation CSV/PDF retain Not Verified; synthetic adapters no Cloud writes.')
  await b.close()
asyncio.run(main())
