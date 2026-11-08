"""Real builder and encrypted recovery; only Cloud/external files use isolated adapters."""
import asyncio,re,urllib.request,json
from pathlib import Path
from playwright.async_api import async_playwright,expect
from scripts.browser.test_report_builder import STORE,HTML,original_pdf
OUT=Path('/tmp/browser/claim-recovery')
CLIENT='''const key='isolated-claim-service';const s=JSON.parse(sessionStorage.getItem(key)||'{"preparation":null,"report":null,"attempts":0,"versionReads":0}');const write=()=>sessionStorage.setItem(key,JSON.stringify(s));
export const supabase={rpc:async(name,p)=>{s.preparation={id:p._id,data:p._data,revision:1,mutation_id:p._mutation,updated_at:new Date().toISOString()};write();return {data:{revision:1,updated_at:s.preparation.updated_at},error:null};},storage:{from:()=>({upload:async(path,blob)=>{s.attempts++;write();if(s.attempts===1)return {error:Error('Controlled upload interrupted')};window.__bytes=Array.from(new Uint8Array(await blob.arrayBuffer()));return {error:null};}})},from:table=>{const q={};let version=false;for(const m of ['select','eq','order','range','contains','limit'])q[m]=value=>{if(m==='select'&&value==='version')version=true;return q;};q.then=done=>{if(version){s.versionReads++;write();if(s.versionReads===1)return Promise.resolve({data:null,error:Error('Controlled version lookup interrupted')}).then(done);}return Promise.resolve({data:[],error:null}).then(done);};q.maybeSingle=async()=>({data:table==='claim_preparations'?s.preparation:s.report,error:null});q.insert=async row=>{s.report=row;write();return {error:null};};return q;}};'''
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
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
   if path=='/isolated-broken.pdf':await route.fulfill(body=b'bad pdf',content_type='application/pdf');return
   if path=='/src/lib/store.tsx':await route.fulfill(body=store,content_type='application/javascript');return
   if path=='/src/integrations/supabase/client.ts':await route.fulfill(body=CLIENT,content_type='application/javascript');return
   if path=='/src/components/AppShell.tsx':await route.fulfill(body='export const PageTitle=({title})=>title;',content_type='application/javascript');return
   if route.request.method not in ['GET','HEAD']:raise AssertionError('External write')
   await route.continue_()
  await context.route('**/*',isolate)
  await page.goto('http://localhost:8080/?mode=claim')
  print("startup errors",errors);print((await page.locator("body").inner_text())[:1000])
  await expect(page.get_by_role('button',name='Save preparation')).to_be_visible()
  await page.get_by_role('button',name='Save preparation').click()
  await expect(page.get_by_text('Saved to account',exact=True)).to_be_visible()
  await page.reload();await expect(page.get_by_text('Saved to account',exact=True)).to_be_visible()
  await page.get_by_role('checkbox',name=re.compile('I reviewed this organisation')).check()
  await page.get_by_role('button',name='Generate claim PDF').dblclick()
  await page.get_by_role('button',name='Confirm documents & generate').click()
  await expect(page.get_by_text('Ready on this device; history save not confirmed.',exact=True)).to_be_visible(timeout=30000)
  await page.screenshot(path=str(OUT/'interrupted.png'))
  await page.reload()
  await expect(page.get_by_text('Ready on this device; history save not confirmed.',exact=True)).to_be_visible(timeout=15000)
  await expect(page.get_by_role('button',name='Generate claim PDF')).to_be_disabled()
  state=json.loads(await page.evaluate('sessionStorage.getItem("isolated-claim-service")'))
  assert state['attempts']==0 and state['versionReads']==1
  await page.get_by_role('button',name='Retry saving to history',exact=False).click()
  await expect(page.get_by_text('Ready on this device; history save not confirmed.',exact=True)).to_be_visible()
  await page.reload()
  await expect(page.get_by_text('Ready on this device; history save not confirmed.',exact=True)).to_be_visible(timeout=15000)
  await page.get_by_role('button',name='Retry saving to history',exact=False).click()
  await expect(page.get_by_text('Saved in Reports Centre → Report history.',exact=True)).to_be_visible()
  async with page.expect_download() as pending:await page.get_by_role('button',name='Download',exact=True).click()
  d=await pending.value;await d.save_as(OUT/'claim.pdf')
  state=json.loads(await page.evaluate('sessionStorage.getItem("isolated-claim-service")'))
  assert state['attempts']==2 and state['versionReads']==2 and state['report']['filters']['snapshot']['totals']['claimed']==37.02
  assert (OUT/'claim.pdf').read_bytes()==bytes(await page.evaluate('window.__bytes'))
  await page.screenshot(path=str(OUT/'recovered.png'));assert not errors,errors
  print('PASS real claim builder/preparation encrypted recovery, interrupted upload, reload same frozen PDF/id, one report, byte-identical download; Cloud adapter synthetic.')
  await browser.close()
if __name__=='__main__':asyncio.run(main())