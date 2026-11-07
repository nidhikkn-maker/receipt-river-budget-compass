import asyncio,time,json,base64
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);page=await b.new_page(viewport={'width':1280,'height':1800});state={'signed':False,'logouts':0}
  user={'id':'11111111-1111-4111-8111-111111111111','email':'fixture@example.invalid','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
  enc=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
  token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':user['id'],'exp':int(time.time())+3600,'aud':'authenticated'})+'.fixture-signature'
  async def route(r):
   url=r.request.url
   if '/token' in url:
    state['signed']=True;await r.fulfill(json={'access_token':token,'refresh_token':'local-fixture-only','expires_in':3600,'token_type':'bearer','user':user})
   elif '/logout' in url:state['signed']=False;state['logouts']+=1;await r.fulfill(status=204)
   elif state['signed']:await r.fulfill(json=user)
   else:await r.fulfill(status=401,json={'message':'No session'})
  await page.route('**/auth/v1/**',route)
  await page.goto('http://localhost:8080/auth?next=%2Freset-password');await page.get_by_label('Email',exact=True).fill(user['email']);await page.get_by_label('Password',exact=True).fill('not-a-real-password')
  await page.evaluate("localStorage.setItem('ll-face-offer-11111111-1111-4111-8111-111111111111','later')")
  await page.get_by_role('button',name='Sign in',exact=True).click();await page.wait_for_url('**/reset-password');print('Successful mocked sign-in preserves next destination PASS')
  await page.goto('http://localhost:8080/auth');await page.get_by_role('heading',name='Welcome back').wait_for();await page.screenshot(path='/tmp/browser/brand/returning-fixture.png');await page.get_by_role('button',name='Sign out and use another sign-in method').click();await page.get_by_role('heading',name='Welcome to Ledgerline').wait_for();assert state['logouts']==1;print('Mocked sign-out clears remembered account PASS')
  await page.get_by_label('Email',exact=True).focus();await page.keyboard.press('Tab');assert await page.get_by_label('Password',exact=True).evaluate('(e)=>e===document.activeElement');print('Keyboard email-to-password traversal PASS');await b.close()
asyncio.run(main())
