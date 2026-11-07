import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/brand')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for w,h in [(360,800),(402,725),(1180,820),(1440,1000)]:
   for mode in ['light','dark']:
    c=await b.new_context(viewport={'width':w,'height':h},color_scheme=mode);page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    async def auth(r):
     if '/token' in r.request.url:await r.fulfill(status=400,json={'error':'invalid_grant','error_description':'Invalid login credentials','message':'Invalid login credentials'})
     else:await r.fulfill(status=401,json={'message':'No session'})
    await page.route('**/auth/v1/**',auth)
    await page.goto('http://localhost:8080/auth?next=%2Fstatements');await page.get_by_role('heading',name='Welcome to Ledgerline').wait_for();await page.wait_for_timeout(400)
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    await page.screenshot(path=str(OUT/f'auth-{w}-{mode}.png'))
    await page.get_by_label('Email',exact=True).fill('fixture@example.invalid');await page.get_by_label('Password',exact=True).fill('not-a-real-password');await page.get_by_role('button',name='Sign in',exact=True).click();await page.get_by_role('alert').filter(has_text='Invalid login credentials').wait_for()
    assert 'next=' in page.url
    await page.screenshot(path=str(OUT/f'error-{w}-{mode}.png'))
    await page.get_by_role('button',name='Create an account',exact=True).click();await page.get_by_label('Display name').wait_for();await page.screenshot(path=str(OUT/f'signup-{w}-{mode}.png'))
    await page.goto('http://localhost:8080/reset-password');await page.get_by_role('heading',name='Reset password').wait_for();await page.screenshot(path=str(OUT/f'reset-{w}-{mode}.png'));assert not errors,errors
    print(w,mode,'sign-in/error/signup/expired-reset no overflow PASS');await c.close()
  await b.close()
asyncio.run(main())
