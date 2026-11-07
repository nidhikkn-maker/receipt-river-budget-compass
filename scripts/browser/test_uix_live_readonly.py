import asyncio,json,os,sys
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/uix-migration/matrix');OUT.mkdir(exist_ok=True)
ROUTES=['dashboard','inbox','wealth','statements','vault','trips','reports','settings','expenses','plan','entities','assets','report-centre','family','account-reconciliation','travel-inbox']
SIZES=[(360,800),(430,932),(834,1194),(1180,820),(1440,1800)]
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for width,height in SIZES[int(sys.argv[1]) if len(sys.argv)>1 else 0:int(sys.argv[2]) if len(sys.argv)>2 else len(SIZES)]:
   c=await b.new_context(viewport={'width':width,'height':height});page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   cookies=json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
   if cookies:await c.add_cookies([{**x,'url':'http://localhost:8080'} for x in cookies])
   await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
   for r in ROUTES:
    await page.goto('http://localhost:8080/'+r);await page.locator('h1').first.wait_for(timeout=30000);await page.wait_for_timeout(400)
    for theme in ['light','dark']:
     await page.evaluate('(dark)=>{document.documentElement.dataset.theme="signature";document.documentElement.classList.toggle("dark",dark)}',theme=='dark')
     await page.wait_for_timeout(350)
     await page.screenshot(path=str(OUT/f'{width}-{theme}-{r}.png'))
     overflow=await page.evaluate('document.documentElement.scrollWidth>innerWidth')
     if overflow:print('OVERFLOW',width,theme,r)
    if r=='dashboard':
     for label,slug in [('Spaces','spaces'),('Smart Add','smart')]:
      await page.get_by_role('button',name=label,exact=True).filter(visible=True).first.click();dialog=page.get_by_role('dialog');await dialog.wait_for();await page.wait_for_timeout(220);box=await dialog.bounding_box();assert box and box['x']>=-1 and box['x']+box['width']<=width+1,(width,slug,box)
      await page.screenshot(path=str(OUT/f'{width}-dark-{slug}.png'));await page.keyboard.press('Escape')
    print('RENDER',width,r,flush=True)
   print('ERRORS',width,errors,flush=True);await c.close()
  await b.close()
asyncio.run(main())
