"""Replay the actual existing AI reader output through review and real saved routes.
Reader must be run separately on the same synthetic bytes. Local persistence is not hosted evidence.
"""
import asyncio,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright,expect
ROOT=Path('/tmp/browser/invoice-acceptance')
def html(fixture):return f'<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{{}};window.$RefreshSig$=()=>t=>t;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/{fixture}.fixture.tsx"></script></body></html>'
async def main():
 reading=json.loads((ROOT/'extracted.json').read_text());assert reading['ok'] and reading['result']['asset']['cost']==150000
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1280,'height':1800});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   req=route.request;path=urlparse(req.url).path
   if urlparse(req.url).netloc!='localhost:8080':await route.abort();return
   if req.is_navigation_request():await route.fulfill(body=html('asset-document' if path=='/statements' else 'invoice-records'),content_type='text/html');return
   exports={'/src/lib/store.tsx':'useStore','/src/lib/document-extract.functions.ts':'extractDocument','/src/lib/books/runs.ts':'documentIdForRun,startRun,updateRun,closeRun'}
   if path in exports:await route.fulfill(body=f'export {{ {exports[path]} }} from "/scripts/browser/asset-document-mocks.tsx";',content_type='application/javascript');return
   if 'tanstack_react-start' in path or 'tanstack/react-start/dist/esm/index.js' in path:
    await route.fulfill(body='export {useServerFn} from "/scripts/browser/asset-document-mocks.tsx";',content_type='application/javascript');return
   stubs={'/src/components/books/PropertyPanel.tsx':'export const PropertyPanel=()=>null;', '/src/components/books/AssetBooks.tsx':'export const AssetLifecycle=()=>null;export const DepreciationBooks=()=>null;', '/src/components/books/AssetCheck.tsx':'export const AssetCheck=()=>null;', '/src/components/books/VaultBooks.tsx':'export const VaultBooks=()=>null;', '/src/components/ContractObligations.tsx':'export const ContractObligations=()=>null;export const NoticeDeadlines=()=>null;', '/src/components/AppShell.tsx':'export const PageTitle=({title,sub})=>React.createElement("header",null,React.createElement("h1",null,title),sub);import React from "react";'}
   if path in stubs:await route.fulfill(body=stubs[path],content_type='application/javascript');return
   if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write')
   await route.continue_()
  await context.route('**/*',isolate)
  await page.goto('http://localhost:8080/statements?invoice=1')
  await page.evaluate('r=>{localStorage.setItem("actual-synthetic-invoice-reading",JSON.stringify(r));localStorage.removeItem("controlled-asset-document");}',reading)
  await page.evaluate('''()=>{const s={preferences:{books:{},entities:[],assets:[],contractObligations:[]},documents:[],runs:{},reads:0,commits:0,failNext:true};localStorage.setItem('controlled-asset-document',JSON.stringify(s));}''')
  # Let the existing adapter provide its canonical emptyBooks shape, removing only the seeded asset.
  await page.evaluate('()=>localStorage.removeItem("controlled-asset-document")');await page.reload()
  await page.evaluate('''()=>{const s={...JSON.parse(localStorage.getItem('controlled-asset-document')||'null')};}''')
  await page.get_by_label('Maintenance original').set_input_files(ROOT/'invoice.png')
  review=page.get_by_role('region',name='Document review invoice.png')
  await expect(review.get_by_label('Asset name',exact=True)).to_have_value('Industrial Generator')
  await expect(review.get_by_label('Cost',exact=True)).to_have_value('150000')
  await review.screenshot(path=str(ROOT/'actual-invoice-review.png'))
  await review.get_by_role('button',name='Confirm and save').click()
  await expect(review.get_by_role('button',name='Retry',exact=True)).to_be_visible();await review.get_by_role('button',name='Retry',exact=True).click()
  await expect(review.get_by_text('Saved',exact=True)).to_be_visible()
  saved=json.loads(await page.evaluate('localStorage.getItem("controlled-asset-document")'))
  matched=[a for a in saved['preferences']['assets'] if a['name']=='Industrial Generator'];assert len(matched)==1 and matched[0]['cost']==150000
  assert len(saved['documents'])==1 and matched[0]['docId']==saved['documents'][0]['id'] and saved['commits']==1 and saved['reads']==1
  await page.goto('http://localhost:8080/assets');await page.reload();await expect(page.get_by_text('Industrial Generator',exact=True)).to_be_visible();await page.screenshot(path=str(ROOT/'actual-assets-reloaded.png'))
  await page.goto('http://localhost:8080/vault');await page.reload();await expect(page.get_by_text(reading['result']['title'],exact=True)).to_be_visible();await expect(page.get_by_text('invoice.png',exact=True)).to_be_visible();await page.screenshot(path=str(ROOT/'actual-vault-reloaded.png'))
  assert not errors,errors
  print('PASS actual non-mocked AI output → uploaded matching synthetic invoice → real review → lost response/retry → source-linked asset → actual Assets/DocuRepo reload; local adapters only, not hosted auth/storage.')
  await browser.close()
asyncio.run(main())