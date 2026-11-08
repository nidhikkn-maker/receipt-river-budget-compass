import asyncio,re,urllib.request,json,sys
from pathlib import Path
sys.path.insert(0,'/dev-server')
from scripts.browser.test_report_builder import STORE,HTML,original_pdf
from playwright.async_api import async_playwright,expect
OUT=Path('/tmp/browser/expenditure-recovery')
CLIENT='''const key='expenditure-service';const s=JSON.parse(sessionStorage.getItem(key)||'{"report":null,"attempts":0,"inserts":0}');const write=()=>sessionStorage.setItem(key,JSON.stringify(s));export const supabase={storage:{from:()=>({upload:async(path,blob)=>{s.attempts++;write();if(s.attempts===1)return {error:Error('Synthetic outage')};window.__bytes=Array.from(new Uint8Array(await blob.arrayBuffer()));return {error:null};}})},from:()=>{const q={};for(const m of ['select','eq','order','range','contains','limit'])q[m]=()=>q;q.then=done=>Promise.resolve({data:[],error:null}).then(done);q.maybeSingle=async()=>({data:s.report,error:null});q.insert=async row=>{s.report=row;s.inserts++;write();throw Error('Lost committed reply');};return q;}};'''
async def main():
 module=urllib.request.urlopen('http://localhost:8080/scripts/browser/report-builder.fixture.tsx').read().decode();react=re.search(r'(/node_modules/\.vite/deps/react\.js\?v=[^"\s]+)',module)
 if not react:raise RuntimeError('React identity missing')
 store=STORE.replace('REACT_URL',react.group(1))
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1280,'height':1800},accept_downloads=True);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   url=route.request.url;path=url.split('localhost:8080')[-1].split('?')[0]
   if not url.startswith('http://localhost:8080'):await route.abort();return
   if path=='/':await route.fulfill(body=HTML,content_type='text/html');return
   if path=='/isolated-original.pdf':await route.fulfill(body=original_pdf(),content_type='application/pdf');return
   if path=='/src/lib/store.tsx':await route.fulfill(body=store,content_type='application/javascript');return
   if path=='/src/integrations/supabase/client.ts':await route.fulfill(body=CLIENT,content_type='application/javascript');return
   if path=='/src/components/AppShell.tsx':await route.fulfill(body='export const PageTitle=({title})=>title;',content_type='application/javascript');return
   if route.request.method not in ['GET','HEAD']:raise AssertionError('Unexpected external write')
   await route.continue_()
  await context.route('**/*',isolate);await page.goto('http://localhost:8080/?mode=statement')
  await page.get_by_role('button',name='Generate statement PDF').click();await page.get_by_role('button',name='Confirm documents & generate').click()
  await expect(page.get_by_text('Ready on this device; history save not confirmed.',exact=True)).to_be_visible(timeout=30000)
  async with page.expect_download() as event:await page.get_by_role('button',name='Download',exact=True).click()
  await (await event.value).save_as(OUT/'before.pdf');await page.screenshot(path=str(OUT/'interrupted.png'))
  await page.reload();await expect(page.get_by_text('Ready on this device; history save not confirmed.',exact=True)).to_be_visible(timeout=15000)
  await expect(page.get_by_role('button',name='Generate statement PDF')).to_be_disabled()
  await page.get_by_role('button',name='Retry saving to history').dblclick()
  await expect(page.get_by_text('Saved in Reports Centre → Report history.',exact=True)).to_be_visible()
  async with page.expect_download() as event:await page.get_by_role('button',name='Download',exact=True).click()
  await (await event.value).save_as(OUT/'after.pdf');assert (OUT/'before.pdf').read_bytes()==(OUT/'after.pdf').read_bytes()==bytes(await page.evaluate('window.__bytes'))
  state=json.loads(await page.evaluate('sessionStorage.getItem("expenditure-service")'));assert state['attempts']==2 and state['inserts']==1 and state['report']['filters']['snapshot']['summary']['total']==12.34
  from pypdf import PdfReader
  assert any('ISOLATED ORIGINAL BILL 12.34' in (p.extract_text() or '') for p in PdfReader(OUT/'after.pdf').pages)
  await page.screenshot(path=str(OUT/'recovered.png'));assert not errors,errors
  print('PASS actual expenditure review/original annexure/PDF -> interrupted upload -> encrypted reload -> single saved history -> byte-identical download, total12.34; local adapters only')
  await browser.close()
asyncio.run(main())
