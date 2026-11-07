import asyncio,json,os,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/asset-check')
ROOT.mkdir(parents=True,exist_ok=True)
subprocess.run(['bun','-e', 'import QRCode from "qrcode"; await QRCode.toFile("/tmp/browser/asset-check/label.png", "LEDGERLINE-ASSET:LAPTOP-001", {width:600});'],check=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={"width":402,"height":725})
  page=await context.new_page()
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  state={'data':None,'writes':0}
  asset={'id':'asset-check-fixture','tag':'LAPTOP-001','name':'Controlled office laptop','kind':'computer','cost':120000,'inUse':'2026-04-01','sharePct':100,'bookMethod':'slm','bookRatePct':20,'location':'Test office','custodian':'Controlled fixture'}
  async def intercept(route):
   req=route.request
   if '/rest/v1/finance_preferences' in req.url:
    if req.method=='GET':
     if state['data'] is not None:
      await route.fulfill(status=200,content_type='application/json',body=json.dumps([state['data']]));return
     response=await route.fetch(); rows=await response.json()
     if state['data'] is None:
      if isinstance(rows,list) and rows: base=rows[0]
      elif isinstance(rows,dict): base=rows
      else: raise Exception('No signed-in preferences available')
      data=base.get('data') or {}; data['assets']=[asset]; data['books']={**(data.get('books') or {}),'assetEvents':[],'journals':[]}
      state['data']={**base,'data':data}
     body=[state['data']] if isinstance(rows,list) else state['data']
     await route.fulfill(status=200,content_type='application/json',body=json.dumps(body));return
    if req.method=='POST':
     body=req.post_data_json
     if isinstance(body,list): body=body[0]
     state['data']={**state['data'],**body};state['writes']+=1
     await route.fulfill(status=201,content_type='application/json',body='');return
   if req.method not in ['GET','HEAD','OPTIONS'] and '/auth/v1/' not in req.url:
    await route.fulfill(status=403,body='External writes blocked by controlled test');return
   await route.continue_()
  await context.route('**/rest/v1/**',intercept)
  storage_key=os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY']; session_json=os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
  cookies=json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
  if cookies: await context.add_cookies([{**c,'url':'http://localhost:8080'} for c in cookies])
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[storage_key,session_json])
  await page.goto('http://localhost:8080/assets')
  await page.get_by_role('button',name='Check asset label').click(timeout=60000)
  baseline=state['writes']
  await page.get_by_label('Asset tag or code').fill('unknown')
  await page.get_by_role('button',name='Find',exact=True).click()
  assert await page.get_by_role('alert').inner_text()=='No asset matches this label in your register'
  await page.set_input_files('input[aria-label="Asset label photo"]',str(ROOT/'label.png'))
  await page.get_by_role('button',name='Confirm physical check').wait_for(timeout=30000)
  assert state['writes']==baseline
  await page.get_by_label('Physical condition').select_option('damaged')
  await page.get_by_label('Physical check note').fill('Controlled inspection')
  await page.get_by_role('dialog').screenshot(path=str(ROOT/'1_review.png'))
  await page.get_by_role('button',name='Confirm physical check').click()
  await page.get_by_role('dialog').wait_for(state='hidden')
  assert state['writes']==baseline+1
  assert state['data']['data']['assets'][0]['condition']=='damaged'
  assert state['data']['data']['assets'][0]['cost']==120000
  assert state['data']['data']['books']['assetEvents'][0]['kind']=='damaged'
  await page.reload()
  await page.get_by_role('button',name='Check asset label').click(timeout=60000)
  await page.get_by_label('Asset tag or code').fill('LAPTOP-001')
  await page.get_by_role('button',name='Find',exact=True).click()
  assert await page.get_by_label('Physical condition').input_value()=='damaged'
  await page.get_by_role('dialog').screenshot(path=str(ROOT/'2_readback.png'))
  assert not errors, errors
  print('PASS: actual QR photo decoded, unknown refused, no save before confirmation, one controlled save, condition read back after reload; no page errors. Cloud financial records unchanged.')
  await context.unroute_all(behavior='wait')
  await browser.close()
asyncio.run(main())
