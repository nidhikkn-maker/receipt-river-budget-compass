import asyncio,importlib.util,json,re
from pathlib import Path
from playwright.async_api import async_playwright,expect
fixture=type('Fixture',(),{})();exec(Path('/dev-server/scripts/browser/test_exception_reports.py').read_text().split('async def main():')[0],fixture.__dict__)
OUT=Path('/tmp/browser/comparison-completion');OUT.mkdir(parents=True,exist_ok=True)
STORE=fixture.STORE.replace("date:'2026-11-01'","date:'2025-11-01'").replace("docDate:'2026-11-01'","docDate:'2025-11-01'").replace("userId:'isolated-report-owner'","userId:'isolated-report-owner',downloadFile:async(path,name)=>{sessionStorage.setItem('downloaded-original',path)}")
STORE=STORE.replace("documents:fixed?[", "documents:[").replace("text:'Printed invoice 250.25'}]:[]","filePath:'isolated-original/invoice.pdf',fileName:'original.pdf',text:'Printed invoice 250.25'}]")
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True);page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   q=route.request;path=q.url.split('localhost:8080')[-1].split('?')[0]
   if not q.url.startswith('http://localhost:8080'):await route.abort();return
   if q.is_navigation_request():await route.fulfill(body=fixture.HTML,content_type='text/html');return
   stubs={'/src/lib/store.tsx':STORE,'/src/integrations/supabase/client.ts':fixture.CLIENT,'/src/components/books/useBooks.ts':"import {useStore} from '/src/lib/store.tsx';export const useDemat=()=>[];export const useBooks=()=>({books:useStore().preferences.books,save:async()=>{}});",'/src/lib/import-repository.ts':'export const listImportRules=async()=>[];export const statementEvidence=async()=>null;export const listImports=async()=>[];export const listImportRows=async()=>[];','/src/components/InboxWork.tsx':'export const InboxWork=()=>null;','/src/components/books/DepreciationInboxCard.tsx':'export const DepreciationInboxCard=()=>null;','/src/components/BackgroundReports.tsx':'export const BackgroundReports=()=>null;'}
   if path in stubs:await route.fulfill(body=stubs[path],content_type='application/javascript');return
   if q.method not in ['GET','HEAD']:raise AssertionError('All writes blocked')
   await route.continue_()
  await c.route('**/*',isolate)
  await page.goto('http://localhost:8080/inbox',wait_until='networkidle')
  await page.locator('summary').filter(has_text='Records checks').click()
  row=page.locator('li').filter(has_text='supplier invoices and payments differ');await expect(row).to_have_count(1)
  link=row.get_by_role('link',name='Open');await expect(link).to_have_attribute('href',re.compile('/audit#comparison-'))
  await link.click();details=page.locator('details[id^="comparison-"]');await expect(details).to_have_count(1);await expect(details).to_have_attribute('open','')
  await expect(details).to_contain_text('2025-26');await expect(details).to_contain_text('50.00');await expect(details).to_contain_text('250.25');await expect(details).to_contain_text('200.25')
  await expect(details.get_by_role('link',name='Review entry')).to_have_attribute('href','/new?edit=a')
  await page.get_by_label('Comparison financial year').select_option('2025-26');await expect(page.locator('summary').filter(has_text='Supplier invoices vs payments')).to_contain_text('1 differ');await details.get_by_role('button',name='Original: Alpha original').first.click();assert await page.evaluate("sessionStorage.getItem('downloaded-original')")=='isolated-original/invoice.pdf'
  async with page.expect_download() as event:await details.get_by_role('button',name='Full evidence',exact=True).click()
  dl=await event.value;await dl.save_as(OUT/'manifest.json');m=json.loads((OUT/'manifest.json').read_text());assert m['comparisons'][0]['fy']=='2025-26';assert m['comparisons'][0]['comparison']['difference']==50
  await page.screenshot(path=str(OUT/'comparison.png'))
  await page.evaluate("sessionStorage.setItem('fixed','yes')");await page.reload(wait_until='networkidle');await expect(page.locator('details[id^="comparison-"]')).to_have_count(0)
  await page.goto('http://localhost:8080/report-centre',wait_until='networkidle');await page.get_by_text('More filters',exact=True).click();await page.locator('label').filter(has_text=re.compile('^Account')).locator('select').select_option('bank-a')
  await page.get_by_role('button',name='Generate PDF',exact=True).click();await expect(page.get_by_role('button',name='Retry saving PDF',exact=True)).to_be_visible(timeout=30000)
  await page.reload(wait_until='networkidle');await expect(page.get_by_role('button',name='Retry saving PDF',exact=True)).to_be_enabled(timeout=30000);await page.get_by_role('button',name='Retry saving PDF',exact=True).click();await expect(page.get_by_role('button',name='Generate PDF',exact=True)).to_be_enabled()
  async with page.expect_download() as event:await page.get_by_role('button',name='Download figure evidence',exact=True).click()
  dl=await event.value;await dl.save_as(OUT/'report-evidence.json');f=json.loads((OUT/'report-evidence.json').read_text());assert f[0]['id']=='balance:bank-a';assert f[0]['amount']==749.75;assert [i['id'] for i in f[0]['inputs']]==['bank-a','a','p']
  assert await page.evaluate("sessionStorage.getItem('uploads')")=='1';assert await page.evaluate("sessionStorage.getItem('inserts')")=='1'
  await page.screenshot(path=str(OUT/'report.png'));assert not errors,errors;print('PASS old-FY Inbox→exact comparison→original→manifest→saved correction/reload; frozen report evidence→interrupted save→reload/retry; one upload/history; zero page errors; isolated adapters, not hosted')
  await b.close()
asyncio.run(main())
