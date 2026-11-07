"""Actual shell/entry UI, synthetic local store; no Cloud writes or hosted claims."""
import asyncio
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

OUT = Path('/tmp/browser/smart-add')
HTML = '''<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/smart-add.fixture.tsx"></script></body></html>'''
MOCKS = {
 '/src/lib/store.tsx': ['useStore'], '/src/lib/receipt-extract.functions.ts': ['extractReceipt'],
 '/src/lib/fx.functions.ts': ['getFxRate'], '/src/lib/assistant.functions.ts': ['parseSpokenEntry'],
 '/src/lib/receipt-problems.functions.ts': ['reportReceiptProblem'],
 '/src/lib/drafts.ts': ['hasDraftContent','draftStatus','getDraft','completeDraft','upsertDraft','uploadDraftReceipt','draftReceiptFile'],
 '/src/lib/offline.ts': ['fileToLocal','localDrafts','localToFile','putLocalDraft','removeLocalDraft'],
}
STUBS = {'DeviceLock': '({children})=>children', 'OfflineBanner':'()=>null', 'DemoBanner':'()=>null', 'DraftsReminder':'()=>null', 'NavProgress':'()=>null'}

async def main():
 OUT.mkdir(parents=True, exist_ok=True)
 async with async_playwright() as p:
  browser = await p.chromium.launch(headless=True)
  for width,height in [(390,844),(834,1194),(1280,1800)]:
   context = await browser.new_context(viewport={'width':width,'height':height})
   page = await context.new_page()
   errors=[]; blocked=[]
   page.on('pageerror',lambda e: errors.append(str(e)))
   async def isolate(route):
    req=route.request; path=urlparse(req.url).path
    if urlparse(req.url).netloc!='localhost:8080' or req.method not in ('GET','HEAD'):
     blocked.append(path); await route.abort()
    elif req.is_navigation_request(): await route.fulfill(content_type='text/html',body=HTML)
    elif path in MOCKS: await route.fulfill(content_type='application/javascript',body=f'export {{ {", ".join(MOCKS[path])} }} from "/scripts/browser/expense-mocks.tsx";')
    elif path.startswith('/src/components/') and path.split('/')[-1].removesuffix('.tsx') in STUBS:
     name=path.split('/')[-1].removesuffix('.tsx'); await route.fulfill(content_type='application/javascript',body=f'export const {name}={STUBS[name]};')
    else: await route.continue_()
   await context.route('**/*',isolate)
   await page.goto('http://localhost:8080/dashboard')
   plus=page.get_by_role('button',name='Smart Add',exact=True).filter(visible=True).first
   await expect(page.get_by_role('heading',name='Controlled Today')).to_be_visible()
   await expect(plus).to_be_visible()
   await plus.click()
   dialog=page.get_by_role('dialog',name='Smart Add')
   await expect(dialog).to_be_visible()
   await dialog.screenshot(path=str(OUT/f'{width}-chooser.png'))
   await page.keyboard.press('Escape')
   await expect(dialog).not_to_be_visible()
   # Smart Add works in place: typed modes open the existing entry form inside the sheet, never a page jump.
   for label,mode in [('Voice Entry','voice'),('Quick Entry','quick'),('From Message','message')]:
    await page.goto('http://localhost:8080/dashboard')
    start_url=page.url
    await page.get_by_role('button',name='Smart Add',exact=True).filter(visible=True).first.click()
    await page.get_by_role('button',name=label,exact=True).click()
    await expect(dialog.get_by_role('button',name='Save expense',exact=True)).to_be_visible(timeout=15000)
    assert page.url==start_url, page.url
    assert await page.evaluate('expenseBrowserFixture.saves.length')==0
    if mode in ('voice','message'): await expect(dialog.get_by_label('Say or type an entry')).to_be_visible()
    assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'
   await page.screenshot(path=str(OUT/f'{width}-message.png'))
   await page.goto('http://localhost:8080/dashboard')
   await page.get_by_role('button',name='Smart Add',exact=True).filter(visible=True).first.click()
   for label,accept in [('Scan or Photo','image/*'),('Upload File',None)]:
    async with page.expect_file_chooser() as fc: await page.get_by_role('button',name=label,exact=True).click()
    chooser=await fc.value
    if accept: assert await chooser.element.get_attribute('accept')==accept
   assert page.url.endswith('/dashboard'), page.url
   assert not errors, errors
   assert not blocked, blocked
   print(f'{width}: plus, Escape, three typed modes in place, photo/file pickers, no page jump/auto save/overflow PASS')
   await context.close()
  await browser.close()
asyncio.run(main())