"""Actual shell/entry UI, synthetic local store; no Cloud writes or hosted claims."""
import asyncio
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

OUT = Path('/tmp/browser/journal')
HTML = '''<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/journal.fixture.tsx"></script></body></html>'''
MOCKS = {
 '/src/lib/store.tsx': ['useStore'], '/src/lib/receipt-extract.functions.ts': ['extractReceipt'],
 '/src/lib/fx.functions.ts': ['getFxRate'], '/src/lib/assistant.functions.ts': ['parseSpokenEntry'],
 '/src/lib/receipt-problems.functions.ts': ['reportReceiptProblem'],
 '/src/lib/drafts.ts': ['hasDraftContent','draftStatus','getDraft','completeDraft','upsertDraft','uploadDraftReceipt','draftReceiptFile'],
 '/src/lib/offline.ts': ['fileToLocal','localDrafts','localToFile','putLocalDraft','removeLocalDraft'],
}
STUBS = {'DeviceLock': '({children})=>children', 'OfflineBanner':'()=>null', 'DemoBanner':'()=>null', 'DraftsReminder':'()=>null', 'NavProgress':'()=>null', 'Autopilot':'()=>null', 'PaymentReminders':'()=>null', 'MilestoneBanner':'()=>null', 'NetWorthCard':'()=>null', 'FundPortfolio':'()=>null', 'DematHoldings':'()=>null', 'MarketPanel':'()=>null', 'DepreciationInboxCard':'()=>null', 'InboxWork':'()=>null', 'AccountStatementStatus':'()=>null', 'AccountTools':'()=>null'}

async def main():
 OUT.mkdir(parents=True, exist_ok=True)
 async with async_playwright() as p:
  browser = await p.chromium.launch(headless=True)
  for width,height in [(390,844),(1180,820),(1440,1800)]:
   context = await browser.new_context(viewport={'width':width,'height':height})
   page = await context.new_page()
   errors=[]; blocked=[]
   page.on('pageerror',lambda e: errors.append(str(e)))
   async def isolate(route):
    req=route.request; path=urlparse(req.url).path
    if urlparse(req.url).netloc!='localhost:8080' or req.method not in ('GET','HEAD'):
     blocked.append(path); await route.abort()
    elif req.is_navigation_request(): await route.fulfill(content_type='text/html',body=HTML)
    elif path == '/src/lib/offline.ts': await route.fulfill(content_type='application/javascript',body='export { fileToLocal,localDrafts,localToFile,putLocalDraft,removeLocalDraft } from "/scripts/browser/expense-mocks.tsx";export const readReviewContext=async()=>null;export const writeReviewContext=async()=>{};')
    elif path == '/src/lib/assistant.functions.ts': await route.fulfill(content_type='application/javascript',body='export const askAssistant=async()=>({ok:false,error:"Isolated"});export const parseSpokenEntry=async()=>({ok:false,error:"Isolated"});')
    elif path == '/src/components/books/useBooks.ts': await route.fulfill(content_type='application/javascript',body='export const useNetWorth=()=>({assets:[],liabilities:0,net:0,quality:[]});export const useBooks=()=>({books:{},save:async()=>{}});')
    elif path == '/src/components/books/useAudit.ts': await route.fulfill(content_type='application/javascript',body='export const useAudit=()=>[];export const useAuditAll=()=>({open:[],all:[]});export const auditInboxItems=()=>[];')
    elif path == '/src/lib/import-repository.ts': await route.fulfill(content_type='application/javascript',body='export const listImportRules=async()=>[];export const listImports=async()=>[];export const listImportRows=async()=>[];export const statementEvidence=async()=>[];export const reviseRows=async()=>{};')
    elif path in MOCKS: await route.fulfill(content_type='application/javascript',body=f'export {{ {", ".join(MOCKS[path])} }} from "/scripts/browser/expense-mocks.tsx";')
    elif path.startswith('/src/components/') and path.split('/')[-1].removesuffix('.tsx') in STUBS:
     name=path.split('/')[-1].removesuffix('.tsx'); await route.fulfill(content_type='application/javascript',body=f'export const {name}={STUBS[name]};')
    else: await route.continue_()
   await context.route('**/*',isolate)
   for route_name,heading in [('dashboard','Today, Alex.'),('inbox','Review'),('wealth','Wealth & Plan'),('start','Your money, in plain words')]:
    await page.goto('http://localhost:8080/'+route_name)
    await page.wait_for_timeout(1000); print(route_name,errors,(await page.locator('body').inner_text())[:500])
    await expect(page.get_by_role('heading',name=heading,exact=True)).to_be_visible(timeout=15000)
    plain_checks={'inbox':['Ready to confirm','Already organised','What to do next'],'wealth':['What I own','What I owe','My total financial position','Accounting details'],'start':['What would you like to manage?','Money moved between my accounts','Paying my credit card bill','A bank statement','Buying something that lasts','Getting paid back']}
    for t in plain_checks.get(route_name,[]): await expect(page.get_by_text(t,exact=False).first).to_be_visible()
    if route_name=='start':
     await page.get_by_role('radio',name='Family').click(); await expect(page.get_by_text('Paying my credit card bill')).to_have_count(0); await page.get_by_role('radio',name='Family').click()
    await page.screenshot(path=str(OUT/f'{width}-{route_name}.png'))
    assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width,route_name,'overflow')
   await page.goto('http://localhost:8080/dashboard')
   await expect(page.get_by_role('heading',name='Today, Alex.',exact=True)).to_be_visible()
   await page.get_by_role('button',name='Spaces',exact=True).filter(visible=True).first.click()
   await expect(page.get_by_role('dialog',name='Spaces')).to_be_visible()
   await page.wait_for_timeout(350)
   await page.screenshot(path=str(OUT/f'{width}-spaces.png'))
   await page.keyboard.press('Escape')
   await page.get_by_role('button',name='Smart Add',exact=True).filter(visible=True).first.click()
   await expect(page.get_by_role('dialog',name='Smart Add')).to_be_visible()
   await page.wait_for_timeout(350)
   bounds = await page.get_by_role("dialog",name="Smart Add").bounding_box()
   assert bounds and bounds["x"] >= -1 and bounds["x"] + bounds["width"] <= width + 1, bounds
   await page.screenshot(path=str(OUT/f'{width}-smart.png'))
   from PIL import Image, ImageDraw
   receipt=OUT/'receipt.png'; im=Image.new('RGB',(240,320),'white'); ImageDraw.Draw(im).text((20,20),'CONTROLLED CAFE\nTotal 432.10',fill='black'); im.save(receipt)
   start_url=page.url
   await page.get_by_label('Take a photo',exact=True).set_input_files(receipt)
   sheet=page.get_by_role('dialog',name='Smart Add')
   await expect(sheet.get_by_label('Preview of receipt.png')).to_be_visible()
   await expect(sheet.get_by_label('Preview of receipt.png').locator('img').first).to_be_visible(timeout=10000)
   await page.screenshot(path=str(OUT/f'{width}-smart-preview.png'))
   await expect(sheet.get_by_role('heading',name='Intelligent Canvas')).to_be_visible(timeout=15000)
   await expect(sheet.get_by_label('What I understood')).to_contain_text('I found a receipt')
   assert page.url==start_url, ('navigated',page.url)
   await page.screenshot(path=str(OUT/f'{width}-canvas.png'))
   await sheet.get_by_role('button',name='Hide Smart Add (your work stays here)').click()
   await expect(sheet).to_be_hidden()
   await page.get_by_role('button',name='Smart Add',exact=True).filter(visible=True).first.click()
   await expect(sheet.get_by_role('heading',name='Intelligent Canvas')).to_be_visible()
   await sheet.get_by_role('button',name='Confirm details',exact=True).click()
   await sheet.get_by_role('button',name='Save expense').click()
   await expect(sheet.get_by_text('Saved to your records')).to_be_visible(timeout=15000)
   await page.screenshot(path=str(OUT/f'{width}-smart-saved.png'))
   assert await page.evaluate('expenseBrowserFixture.saves.length')==1
   assert page.url==start_url
   pdf=OUT/'statement.pdf'; im.save(pdf,'PDF')
   await sheet.get_by_role('button',name='Start over').click()
   await page.get_by_label('Choose files',exact=True).set_input_files(pdf)
   await expect(sheet.get_by_role('heading',name='What is this?')).to_be_visible()
   await expect(sheet.get_by_text('1 page',exact=False)).to_be_visible(timeout=10000)
   await page.wait_for_timeout(800)
   await page.screenshot(path=str(OUT/f'{width}-smart-pdf.png'))
   assert page.url==start_url
   assert await page.evaluate('expenseBrowserFixture.saves.length')==1, 'exactly one save'
   assert not errors, errors
   print('blocked',blocked)
   print(f'{width}: Today/Review/Wealth/Start/Spaces/Smart Add/Canvas plain wording, no overflow or posting PASS')
   await context.close()
  await browser.close()
asyncio.run(main())