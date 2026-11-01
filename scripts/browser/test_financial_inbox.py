"""Real Inbox controls with controlled records; blocks every external request/write."""
import unittest
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright,expect
HTML='''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/financial-inbox.fixture.tsx"></script></body></html>'''
class InboxTests(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.p=await async_playwright().start();self.browser=await self.p.chromium.launch(headless=True);self.context=await self.browser.new_context(viewport={'width':1280,'height':1800});self.page=await self.context.new_page();self.errors=[];self.blocked=[];self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.on('console',lambda m:print('CONSOLE',m.type,m.text))
  async def isolate(route):
   r=route.request;u=urlparse(r.url)
   if u.netloc!='localhost:8080' or r.method not in ('GET','HEAD'):self.blocked.append(u.hostname);await route.abort()
   elif u.path=='/inbox':await route.fulfill(content_type='text/html',body=HTML)
   elif u.path in ['/src/lib/store.tsx','/src/lib/import-repository.ts','/src/lib/offline.ts','/src/integrations/supabase/client.ts']:
    exports={'/src/lib/store.tsx':'useStore','/src/lib/import-repository.ts':'listImportRules,listImports,statementEvidence','/src/lib/offline.ts':'readReviewContext,writeReviewContext,localDrafts','/src/integrations/supabase/client.ts':'supabase'}[u.path];await route.fulfill(content_type='application/javascript',body=f'export {{ {exports} }} from "/scripts/browser/financial-inbox-mocks.tsx";')
   else:await route.continue_()
  await self.context.route('**/*',isolate);await self.page.goto('http://localhost:8080/inbox?section=review');print('DIAGNOSTIC',await self.page.locator('body').inner_text(),self.errors);await expect(self.page.get_by_role('heading',name='91 transactions needing attention')).to_be_visible()
 async def asyncTearDown(self):
  Path('/tmp/browser/v512').mkdir(parents=True,exist_ok=True);await self.page.screenshot(path=f'/tmp/browser/v512/{self._testMethodName}.png');self.assertEqual(self.errors,[]);self.assertEqual(self.blocked,[]);await self.browser.close();await self.p.stop()
 async def choose(self,name):
  await self.page.get_by_role('button',name='Select',exact=True).click();await self.page.get_by_role('menuitem',name=name,exact=True).click()
 async def test_matching_scope_and_filter_changes(self):
  await self.choose('Select all visible (40)');await expect(self.page.get_by_role('region',name='Selected transaction summary').get_by_text('40 transactions selected',exact=True)).to_be_visible()
  await self.page.get_by_label('Search financial review').fill('Controlled 90');await expect(self.page.get_by_text('Selection scope: 0 matching the current filters · 40 outside the current filters')).to_be_visible();await self.choose('Select all matching (1)');await expect(self.page.get_by_text('Selection scope: 1 matching the current filters · 0 outside the current filters')).to_be_visible()
 async def test_preview_save_reload_and_undo(self):
  await self.choose('Select all matching (91)');await self.page.get_by_role('button',name='Categorise',exact=True).click();await self.page.get_by_label('Bulk review category').click();await self.page.get_by_role('option',name='Groceries',exact=True).click();await self.page.get_by_role('button',name='Review & Apply',exact=True).click();self.assertEqual(await self.page.evaluate('inboxFixture.saves.length'),0)
  await self.page.evaluate('inboxFixture.failNextSave=true');await self.page.get_by_role('button',name='Confirm & Apply Changes').click();await expect(self.page.get_by_role('button',name='Unable to Save — Retry')).to_be_visible();await self.page.get_by_role('button',name='Unable to Save — Retry').click();await expect(self.page.get_by_role('heading',name='0 transactions needing attention')).to_be_visible();self.assertEqual(await self.page.evaluate('inboxFixture.saves[0].length'),91)
  await self.page.get_by_role('button',name='Undo correction').click();print('DIAGNOSTIC',await self.page.locator('body').inner_text(),self.errors);await expect(self.page.get_by_role('heading',name='91 transactions needing attention')).to_be_visible();self.assertEqual(await self.page.evaluate('inboxFixture.transactions.reduce((s,e)=>s+e.amount,0)'),4186)
  await self.page.reload();print('DIAGNOSTIC',await self.page.locator('body').inner_text(),self.errors);await expect(self.page.get_by_role('heading',name='91 transactions needing attention')).to_be_visible()
 async def test_four_layouts_and_navigation(self):
  for name,w,h in [('iphone',402,874),('ipad-portrait',820,1180),('ipad-landscape',1180,820),('desktop',1280,1800)]:
   await self.page.set_viewport_size({'width':w,'height':h});await self.page.screenshot(path=f'/tmp/browser/v512/{name}.png');self.assertEqual(await self.page.evaluate('Math.max(0,document.documentElement.scrollWidth-innerWidth)'),0)
  await self.page.get_by_role('link',name='Review History',exact=True).first.click();await expect(self.page.get_by_role('heading',name='Review History',exact=True)).to_be_visible();await self.page.get_by_role('link',name='Smart Review',exact=True).click();print('DIAGNOSTIC',await self.page.locator('body').inner_text(),self.errors);await expect(self.page.get_by_role('heading',name='91 transactions needing attention')).to_be_visible()
if __name__=='__main__':unittest.main(verbosity=2)