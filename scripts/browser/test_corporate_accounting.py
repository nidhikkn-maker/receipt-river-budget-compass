import asyncio,json,re,importlib.util
from pathlib import Path
from playwright.async_api import async_playwright,expect
ns={};exec(Path('/dev-server/scripts/browser/test_exception_reports.py').read_text().split('async def main():')[0],ns)
STORE=ns['STORE'].replace("documents:fixed?[", "documents:[").replace("text:'Printed invoice 250.25'}]:[]", "filePath:'owner/original.pdf',text:'Printed invoice 250.25'}]")
STORE=STORE.replace("const fixed=sessionStorage.getItem('fixed')==='yes'", "const fixed=sessionStorage.getItem('fixed')==='yes'")
STORE=STORE.replace("departmentBudgets:{}","signedUrl:async(path)=>'http://localhost:8080/isolated-original.pdf',departmentBudgets:{}")
OUT=Path('/tmp/browser/corporate')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True);page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   q=route.request;path=q.url.split('localhost:8080')[-1].split('?')[0]
   if not q.url.startswith('http://localhost:8080'):await route.abort();return
   if path=='/isolated-original.pdf':await route.fulfill(body=b'%PDF- synthetic original bytes',content_type='application/pdf');return
   if q.is_navigation_request():await route.fulfill(body=ns['HTML'],content_type='text/html');return
   stubs={'/src/lib/store.tsx':STORE,'/src/integrations/supabase/client.ts':ns['CLIENT'],'/src/components/BackgroundReports.tsx':'export const BackgroundReports=()=>null;'}
   if path in stubs:await route.fulfill(body=stubs[path],content_type='application/javascript');return
   if q.method not in ['GET','HEAD']:raise AssertionError('External writes blocked')
   await route.continue_()
  await c.route('**/*',isolate);await page.goto('http://localhost:8080/report-centre',wait_until='networkidle')
  print('errors before controls',errors);print((await page.locator('body').inner_text())[:2500]);await page.screenshot(path=str(OUT/'start.png'))
  await page.get_by_role('combobox').first.select_option('company-trial-balance');await page.get_by_label('Accounting company').select_option('A')
  await page.get_by_role('button',name='Generate PDF',exact=True).click();await expect(page.get_by_role('button',name='Retry saving PDF',exact=True)).to_be_visible(timeout=30000)
  await page.reload(wait_until='networkidle');await page.get_by_role('button',name='Retry saving PDF',exact=True).click();await expect(page.get_by_role('button',name='Generate PDF',exact=True)).to_be_enabled(timeout=30000)
  async with page.expect_download() as event:await page.get_by_role('button',name='Accounting evidence',exact=True).first.click()
  dl=await event.value;await dl.save_as(OUT/'evidence.json');w=json.loads((OUT/'evidence.json').read_text());assert w['profit']==-200.25 and w['trialDifference']==0 and w['balanceDifference']==0;assert 'Excluded Beta' not in json.dumps(w);assert 'owner/original.pdf' in json.dumps(w)
  await page.evaluate("sessionStorage.setItem('fixed','yes')");await page.reload(wait_until='networkidle')
  async with page.expect_download() as event:await page.get_by_role('button',name='Saved CSV',exact=True).click()
  dl=await event.value;await dl.save_as(OUT/'frozen.csv');assert '799.75' in (OUT/'frozen.csv').read_text()
  async with page.expect_download() as event:await page.get_by_role('button',name='Saved Excel',exact=True).click()
  dl=await event.value;await dl.save_as(OUT/'frozen.xlsx');assert (OUT/'frozen.xlsx').stat().st_size>1000
  async with page.expect_download() as event:await page.get_by_role('button',name='Download',exact=True).first.click()
  dl=await event.value;await dl.save_as(OUT/'frozen.pdf')
  from pypdf import PdfReader
  text='\n'.join(p.extract_text() or '' for p in PdfReader(OUT/'frozen.pdf').pages);assert '799.75' in text and 'Excluded Beta' not in text
  async with page.expect_download() as event:await page.get_by_role('button',name='Audit pack',exact=True).click()
  dl=await event.value;await dl.save_as(OUT/'audit.zip')
  import zipfile
  with zipfile.ZipFile(OUT/'audit.zip') as z:
   assert len(z.namelist())==20;assert 'statutory-roll-forwards.csv' in z.namelist();assert '799.75' in z.read('company-trial-balance.csv').decode();assert z.read('originals/0001-original.pdf')==b'%PDF- synthetic original bytes'
  assert await page.evaluate("sessionStorage.getItem('uploads')==='1' && sessionStorage.getItem('inserts')==='1'")
  await page.screenshot(path=str(OUT/'corporate.png'));assert not errors,errors
  print('PASS actual company report → PDF → interrupted history → encrypted reload → retry → frozen original/CSV/XLSX/PDF after source changes; one upload/history; zero page errors; isolated adapters NOT hosted')
  await b.close()
asyncio.run(main())
