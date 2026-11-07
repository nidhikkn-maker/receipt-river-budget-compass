"""Controlled original-to-reader adapter → real review → interrupted save/reload. No Cloud writes."""
import asyncio, json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect
from PIL import Image, ImageDraw

ROOT = Path('/tmp/browser/asset-document')
HTML = '''<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/asset-document.fixture.tsx"></script></body></html>'''
async def main():
 ROOT.mkdir(parents=True,exist_ok=True)
 img=Image.new('RGB',(800,400),'white'); ImageDraw.Draw(img).text((40,40),'CONTROLLED MAINTENANCE\nSerial GEN-44\nService 8000',(0,0,0)); img.save(ROOT/'service.png')
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   req=route.request; path=urlparse(req.url).path
   if urlparse(req.url).netloc!='localhost:8080': await route.abort(); return
   if path=='/statements': await route.fulfill(status=200,content_type='text/html',body=HTML); return
   exports={'/src/lib/store.tsx':'useStore','/src/lib/document-extract.functions.ts':'extractDocument','/src/lib/books/runs.ts':'documentIdForRun,startRun,updateRun,closeRun'}
   if path in exports: await route.fulfill(status=200,content_type='application/javascript',body=f'export {{ {exports[path]} }} from "/scripts/browser/asset-document-mocks.tsx";'); return
   if path.startswith('/node_modules/.vite/deps/') and 'tanstack_react-start' in path and not path.endswith('.map'): await route.fulfill(status=200,content_type='application/javascript',body='export { useServerFn } from "/scripts/browser/asset-document-mocks.tsx";'); return
   if req.method not in ('GET','HEAD'): raise AssertionError('Unexpected external write')
   await route.continue_()
  await context.route('**/*',isolate)
  await page.goto('http://localhost:8080/statements',wait_until='domcontentloaded')
  await page.get_by_label('Maintenance original').set_input_files(ROOT/'service.png')
  review=page.get_by_role('region',name='Document review service.png')
  await expect(review.get_by_label('Asset for this document')).to_have_value('generator-1')
  await review.get_by_role('button',name='Confirm and save').click()
  await expect(review.get_by_role('button',name='Retry',exact=True)).to_be_visible()
  await review.get_by_role('button',name='Retry',exact=True).click()
  await expect(review.get_by_text('Saved',exact=True)).to_be_visible()
  await review.screenshot(path=str(ROOT/'saved.png'))
  await page.reload(); await page.get_by_role('button',name='Read saved asset').click()
  await expect(page.get_by_label('Saved asset figures')).to_have_text('Assets 1 · Cost 150000 · Book 135000 · Tax 127500 · Documents 1')
  saved=json.loads(await page.evaluate('localStorage.getItem("controlled-asset-document")'))
  assert saved['reads']==1 and saved['commits']==1 and len(saved['documents'])==1
  assert saved['documents'][0]['original'].startswith('data:image/png;base64,')
  assert len(saved['preferences']['books']['assetEvents'])==1
  assert saved['preferences']['books']['assetEvents'][0]['kind']=='maintenance'
  assert not errors,errors
  await page.get_by_label('Saved asset figures').screenshot(path=str(ROOT/'reloaded-figures.png'))
  await page.set_viewport_size({'width':390,'height':844})
  await page.get_by_label('Saved asset figures').screenshot(path=str(ROOT/'mobile-figures.png'))
  print('PASS actual file reader and review, unique serial classification, one interrupted-save replay, original retained, reload figures 150000/135000/127500; external extraction and Cloud storage not certified.')
  await browser.close()
asyncio.run(main())