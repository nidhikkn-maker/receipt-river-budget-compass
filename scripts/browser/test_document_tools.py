"""Real document export and unfinished-run controls; isolated data, all external writes blocked."""
import asyncio,json,zipfile,io
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright,expect
OUT=Path('/tmp/browser/document-tools')
HTML='''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/document-tools.fixture.tsx"></script></body></html>'''
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page();errors=[];downloads=[];mode={'file':'ok'}
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('download',lambda d:downloads.append(d))
  async def isolate(route):
   r=route.request;u=urlparse(r.url)
   if u.netloc!='localhost:8080' or r.method not in ['GET','HEAD']:await route.abort();return
   if u.path=='/vault':await route.fulfill(content_type='text/html',body=HTML)
   elif u.path in ['/src/lib/store.tsx','/src/components/books/useBooks.ts','/src/integrations/supabase/client.ts']:
    name={'/src/lib/store.tsx':'useStore','/src/components/books/useBooks.ts':'useBooks','/src/integrations/supabase/client.ts':'supabase'}[u.path];await route.fulfill(content_type='application/javascript',body=f'export {{ {name} }} from "/scripts/browser/document-tools-mocks.tsx";')
   elif u.path.startswith('/__original/'):
    await route.fulfill(status=503 if mode['file']=='failed' else 200,body=b'original invoice' if mode['file']=='ok' else b'',content_type='application/pdf')
   else:await route.continue_()
  await c.route('**/*',isolate);await page.goto('http://localhost:8080/vault#organise');await page.get_by_text('Controlled invoice a',exact=True).wait_for();await page.get_by_text('Personal / unassigned',exact=False).first.click()
  await page.get_by_label('Controlled invoice a',exact=False).check();await page.get_by_label('Controlled invoice b',exact=False).check()
  async with page.expect_download() as dl:await page.get_by_role('button',name='Export 2 as ZIP').click()
  d=await dl.value;path=OUT/'selected.zip';await d.save_as(path)
  with zipfile.ZipFile(path) as z:
   assert sorted(z.namelist())==['a-invoice.pdf','b-invoice.pdf','manifest.json'];m=json.loads(z.read('manifest.json'));assert m['count']==2 and m['documents'][0]['fields'][0]['originalValue']=='1000' and m['documents'][0]['fields'][0]['section']=='Clause 8'
  await page.evaluate("documentTools.denied='owner/b'");await page.get_by_role('button',name='Export 2 as ZIP').click();await page.get_by_text('Access to invoice.pdf has ended',exact=True).wait_for();assert len(downloads)==1
  await page.evaluate("documentTools.denied=''");mode['file']='failed';await page.get_by_role('button',name='Export 2 as ZIP').click();await page.get_by_text('Download failed (503)',exact=True).wait_for();assert len(downloads)==1
  mode['file']='ok';await page.get_by_role('button',name='Export 2 as ZIP').click();await page.wait_for_timeout(300);assert len(downloads)==2
  await page.set_viewport_size({'width':402,'height':874});await page.screenshot(path=str(OUT/'export-phone.png'))
  run={'id':'cleanup','file_name':'saved.pdf','context':'','stage':'Audit','status':'waiting','error':None,'document_id':'saved','attempts':1,'updated_at':'2026-11-07','data':{'stashPath':'owner/runs/saved','cleanupPending':'done'}}
  await page.evaluate('(r)=>sessionStorage.setItem("cleanup-runs",JSON.stringify([r]))',run);await page.reload();panel=page.get_by_label('Unfinished documents');await expect(panel).to_contain_text('Records saved · original cleanup pending')
  await panel.get_by_role('button',name='Retry original cleanup').click();await page.get_by_text('The parked original could not be removed. Retry cleanup; your saved document is unchanged.',exact=True).wait_for();await page.reload();await expect(panel).to_contain_text('original cleanup pending')
  await page.evaluate('documentTools.failCleanup=false;documentTools.failFinal=true');await panel.get_by_role('button',name='Retry original cleanup').click();await page.get_by_text('Final status interrupted',exact=True).wait_for();await page.reload();await expect(panel).to_contain_text('original cleanup pending');await panel.screenshot(path=str(OUT/'cleanup-reloaded.png'))
  await page.evaluate('documentTools.failCleanup=false');await panel.get_by_role('button',name='Retry original cleanup').click();await expect(panel).to_have_count(0);assert await page.evaluate('documentTools.downloads')==0
  await page.reload();await expect(panel).to_have_count(0);assert not errors,errors
  print('PASS selected ZIP/provenance, denied and failed download no ZIP, retry; durable failed cleanup/lost status/reload/retry without financial review or bytes download; external writes blocked.')
  await b.close()
asyncio.run(main())