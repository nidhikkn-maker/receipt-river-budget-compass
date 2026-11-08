"""Real Smart Add/Statement Desk context routing; local empty records, no server calls."""
import asyncio
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright,expect
OUT=Path('/tmp/browser/capture-context')
HTML='<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/capture-context.fixture.tsx"></script></body></html>'
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1280,'height':1800});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   path=urlparse(route.request.url).path
   if urlparse(route.request.url).netloc!='localhost:8080':await route.abort();return
   if route.request.is_navigation_request():await route.fulfill(body=HTML,content_type='text/html');return
   if path in ['/src/lib/store.tsx','/src/integrations/supabase/client.ts']:
    name='useStore' if path.endswith('store.tsx') else 'supabase';await route.fulfill(body=f'export {{ {name} }} from "/scripts/browser/statement-desk-mocks.tsx";',content_type='application/javascript');return
   if path=='/src/lib/statement-pipeline/atomic-undo.functions.ts':await route.fulfill(body='export {undoStatement} from "/scripts/browser/statement-desk-mocks.tsx";',content_type='application/javascript');return
   if path=='/src/components/DocumentIntake.tsx':await route.fulfill(body='export const DocumentIntake=({context,file})=>{window.__capture={context,name:file.name};return context;};',content_type='application/javascript');return
   if route.request.method not in ['GET','HEAD']:
    print('BLOCKED',path,flush=True);await route.abort();return
   await route.continue_()
  await context.route('**/*',isolate)
  for module in ['assets','entity','fy','property','tax','gst','documents']:
   await page.goto('http://localhost:8080/capture')
   await page.get_by_role('button',name=module,exact=True).click()
   await page.get_by_label('Choose files',exact=True).set_input_files(files=[{'name':'original.png','mimeType':'image/png','buffer':b'synthetic original'}])
   await expect(page.get_by_role('dialog',name='Smart Add')).to_be_visible()
   await page.screenshot(path=str(OUT/(module+'-debug.png')));print(module,errors,await page.locator('body').inner_text(),flush=True)
   await page.wait_for_function('window.__capture!==undefined')
   assert await page.evaluate('window.__capture')=={'context':module,'name':'original.png'}
   assert page.url=='http://localhost:8080/capture'
   await page.screenshot(path=str(OUT/f'{module}.png'))
  assert not errors,errors
  print('PASS seven contexts: real event -> Smart Add -> Statement Desk -> document review boundary; same page, no writes. Reader stub not extraction acceptance.')
  await browser.close()
if __name__=='__main__':asyncio.run(main())