import asyncio
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright,expect
OUT=Path('/tmp/browser/document-search')
HTML='''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/document-search.fixture.tsx"></script></body></html>'''
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page();errors=[];writes=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   r=route.request;u=urlparse(r.url)
   if u.netloc!='localhost:8080' or r.method not in ['GET','HEAD']:writes.append(r.url);await route.abort();return
   if u.path in ['/vault','/historical-import']:await route.fulfill(content_type='text/html',body=HTML)
   elif u.path in ['/src/lib/store.tsx','/src/components/books/useBooks.ts','/src/integrations/supabase/client.ts','/src/lib/import-repository.ts']:
    name={'/src/lib/store.tsx':'useStore','/src/components/books/useBooks.ts':'useBooks','/src/integrations/supabase/client.ts':'supabase','/src/lib/import-repository.ts':'listImports'}[u.path];await route.fulfill(content_type='application/javascript',body=f'export {{ {name} }} from "/scripts/browser/document-tools-mocks.tsx";')
   elif u.path=='/src/components/ContractObligations.tsx':await route.fulfill(content_type='application/javascript',body='export const ContractObligations=()=>null;export const NoticeDeadlines=()=>null;')
   elif u.path=='/src/components/ExpenseDialog.tsx':await route.fulfill(content_type='application/javascript',body='export const ExpenseDialog=()=>null;')
   elif u.path=='/src/components/AppShell.tsx':await route.fulfill(content_type='application/javascript',body='import React from "/node_modules/.vite/deps/react.js";export const PageTitle=({title})=>React.createElement("h1",null,title);')
   else:await route.continue_()
  await c.route('**/*',isolate);await page.goto('http://localhost:8080/vault');await page.get_by_role('heading',name='DocuRepo').wait_for()
  await page.evaluate("documentTools.documents[0].merchant='Alpha';documentTools.documents[0].text='OCR_ONLY_TOKEN';documentTools.documents[1].merchant='Beta';documentTools.documents[1].docDate='2026-09-01';documentTools.documents[1].amount=250;documentTools.documents[1].docType='insurance';documentTools.documents[2].amount=null;documentTools.documents[2].text='';documentTools.documents[2].docDate=null")
  q=page.get_by_label('Search documents')
  for query,count in [('Alpha',1),('2026-09-01',1),('1050',1),('OCR_ONLY_TOKEN',1),('missing token',0)]:
   await q.fill(query);await expect(page.get_by_text(f'{count} documents',exact=True)).to_be_visible()
  await q.fill('');await page.get_by_label('Document type filter').click();await page.get_by_role('option',name='Insurance',exact=True).click();await expect(page.get_by_text('1 documents',exact=True)).to_be_visible()
  await q.fill('Beta');await page.get_by_label('Documents from').fill('2026-10-01');await expect(page.get_by_text('0 documents',exact=True)).to_be_visible();await page.get_by_label('Documents from').fill('2026-09-01');await expect(page.get_by_text('1 documents',exact=True)).to_be_visible()
  await page.screenshot(path=str(OUT/'combined-search.png'))
  await q.fill('');await page.get_by_label('Documents from').fill('');await page.get_by_label('Document type filter').click();await page.get_by_role('option',name='All document types',exact=True).click();await expect(page.get_by_text('3 documents',exact=True)).to_be_visible()
  await page.goto('http://localhost:8080/historical-import');await page.get_by_role('heading',name='Past imports',exact=True).wait_for()
  for status in ['review','failed','paused','queued']:await expect(page.get_by_text(status+'.pdf',exact=True)).to_be_visible()
  assert await page.get_by_role('button').count()==0
  await page.screenshot(path=str(OUT/'read-only-history.png'));await page.get_by_role('link',name='Go to Statement Desk').click();await page.get_by_role('heading',name='Statement Desk destination').wait_for()
  assert not errors,errors;assert not writes,writes;print('PASS actual Vault search merchant/date/amount/type/OCR, intersections/clear/no-match; actual Past imports four statuses read-only, no mutations and Statement Desk link navigates.')
  await b.close()
asyncio.run(main())