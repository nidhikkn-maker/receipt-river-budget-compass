"""Same saved dataset through real routes; local adapters, never hosted certification."""
import asyncio
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect
OUT=Path('/tmp/browser/connected-finance')
HTML='<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/connected-finance.fixture.tsx"></script></body></html>'
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800},accept_downloads=True)
  page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   req=route.request;path=urlparse(req.url).path
   if urlparse(req.url).netloc!='localhost:8080':await route.abort();return
   if req.is_navigation_request():await route.fulfill(body=HTML,content_type='text/html');return
   if path in ['/src/lib/store.tsx','/src/integrations/supabase/client.ts']:
    name='useStore' if 'store.tsx' in path else 'supabase';await route.fulfill(body=f'export {{ {name} }} from "/scripts/browser/statement-desk-mocks.tsx";',content_type='application/javascript');return
   stubs={'/src/components/books/useAudit.ts':'export const useAudit=()=>({});export const auditInboxItems=()=>[];', '/src/lib/import-repository.ts':'export const listImportRows=async()=>[];export const reviseRows=async()=>{throw Error("No staging writes");};export const listImports=async()=>[];export const listImportRules=async()=>[];export const statementEvidence=async()=>null;', '/src/components/InboxWork.tsx':'export const InboxWork=()=>null;', '/src/components/books/DepreciationInboxCard.tsx':'export const DepreciationInboxCard=()=>null;', '/src/components/books/VaultBooks.tsx':'export const VaultBooks=()=>null;', '/src/lib/statement-pipeline/atomic-undo.functions.ts':'export {undoStatement} from "/scripts/browser/statement-desk-mocks.tsx";'}
   if path in stubs:await route.fulfill(body=stubs[path],content_type='application/javascript');return
   if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write')
   await route.continue_()
  await context.route('**/*',isolate)
  await page.goto('http://localhost:8080/statements')
  csv=b'Date,Description,Debit,Credit\n2026-10-02,SWIGGY ORDER,250.00,\n2026-10-03,AMAZON PURCHASE,480.00,\n'
  await page.get_by_label('Statement files').set_input_files(files=[{'name':'connected.csv','mimeType':'text/csv','buffer':csv}])
  await page.locator('select').first.select_option('desk-account')
  await page.get_by_role('button',name='Accept all 2 asking items').click()
  await page.get_by_role('button',name='Apply everything (2 to save)').click()
  await expect(page.get_by_role('button',name='Undo this upload (2 saved)')).to_be_visible()
  await page.locator('nav').get_by_role('link',name='Inbox',exact=True).click()
  await page.wait_for_timeout(1000)
  print('inbox observed',page.url,(await page.locator('body').inner_text())[:900])
  await expect(page.get_by_role('heading',name='Review',exact=True)).to_be_visible()
  await page.screenshot(path=str(OUT/'inbox.png'))
  await page.locator('nav').get_by_role('link',name='Reconciliation',exact=True).click()
  await expect(page.get_by_role('heading',name='Check my balances',exact=True)).to_be_visible()
  await expect(page.get_by_label('Statement account status')).to_be_visible()
  await page.get_by_role('button',name='View details for Controlled bank').click()
  await expect(page.get_by_role('dialog')).to_contain_text('Controlled bank')
  await page.screenshot(path=str(OUT/'reconciliation.png'));await page.keyboard.press('Escape')
  await page.locator('nav').get_by_role('link',name='DocuRepo',exact=True).click()
  await expect(page.get_by_label('Search documents')).to_be_visible()
  await page.reload()
  async with page.expect_download() as pending:await page.get_by_role('button',name='Download',exact=False).filter(visible=True).first.click()
  original=await pending.value;await original.save_as(OUT/'original.csv');assert (OUT/'original.csv').read_bytes()==csv
  await page.screenshot(path=str(OUT/'vault.png'))
  await page.locator('nav').get_by_role('link',name='Reports',exact=True).click()
  async with page.expect_download() as pending:await page.get_by_role('button',name='Export All expenses CSV').click()
  report=await pending.value;await report.save_as(OUT/'report.csv');text=(OUT/'report.csv').read_text();assert '250.00' in text and '480.00' in text
  await page.screenshot(path=str(OUT/'reports.png'))
  assert not errors,errors
  print('PASS actual Statement Desk → Inbox → Account Reconciliation → DocuRepo reload/original bytes → Reports; synthetic local adapters, audit/historical fetches stubbed; hosted/entity isolation not certified.')
  await browser.close()
asyncio.run(main())