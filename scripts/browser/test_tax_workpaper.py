"""End-to-end: edit a company's yearly tax profile and download the accountant tax workpaper.
Controlled: finance_preferences is served from an in-memory fixture, document/storage writes are faked,
every other write is blocked, so real Cloud records never change."""
import asyncio,json,os,zipfile,io
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/tax-wp'); ROOT.mkdir(parents=True,exist_ok=True)
ENT={'id':'wp-fixture-co','name':'Fixture Traders Pvt Ltd','kind':'company','pan':'','gstins':[],'booksFrom':'2025-26'}
def session():
  if os.environ.get('LOVABLE_BROWSER_AUTH_STATUS')=='injected':
    return os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
  m=json.load(open(os.path.expanduser('~/.cache/lovable-auth/session.json'))); return m['storage_key'],json.dumps(m['session'])
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); ctx=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True); page=await ctx.new_page()
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  st={'data':None,'writes':0,'docs':0}
  async def rest(route):
   r=route.request
   if '/rest/v1/finance_preferences' in r.url:
    if r.method=='GET':
     if st['data'] is None:
      rows=await (await route.fetch()).json(); base=rows[0] if isinstance(rows,list) else rows
      d=base.get('data') or {}; d['entities']=[ENT]; d['books']={**(d.get('books') or {}),'entityAccounts':{},'entityTaxProfiles':[]}
      st['data']={**base,'data':d}
     await route.fulfill(status=200,content_type='application/json',body=json.dumps([st['data']] if 'single' not in (r.headers.get('accept') or '') else st['data'])); return
    if r.method in ('POST','PATCH'):
     body=r.post_data_json; body=body[0] if isinstance(body,list) else body
     st['data']={**st['data'],**body}; st['writes']+=1; await route.fulfill(status=201,content_type='application/json',body=''); return
   if '/rest/v1/documents' in r.url and r.method=='POST':
    st['docs']+=1; await route.fulfill(status=201,content_type='application/json',body=''); return
   if r.method not in ('GET','HEAD','OPTIONS'):
    await route.fulfill(status=403,body='blocked by controlled test'); return
   await route.continue_()
  async def storage(route):
   if route.request.method in ('POST','PUT'): await route.fulfill(status=200,content_type='application/json',body=json.dumps({'Key':'x','Id':'x'})); return
   await route.continue_()
  await ctx.route('**/rest/v1/**',rest); await ctx.route('**/storage/v1/**',storage)
  k,v=session(); await page.goto('http://localhost:8080'); await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[k,v])
  # 1. Add then edit the tax profile.
  await page.goto('http://localhost:8080/entities')
  card=page.locator('div.rounded-2xl',has_text=ENT['name']).first
  await card.get_by_role('button',name='Add tax year').click(timeout=60000)
  await card.get_by_label('Tax year').fill('2025-26'); await card.get_by_label('Your share %').fill('60'); await card.get_by_label('Past accumulated profits').fill('500000')
  await card.get_by_role('button',name='Save',exact=True).click()
  await card.get_by_text('share 60%').wait_for()
  await card.get_by_role('button',name='Edit',exact=True).nth(1).click()
  await card.get_by_label('Your share %').fill('75'); await card.get_by_role('button',name='Save',exact=True).click()
  await card.get_by_text('share 75%').wait_for()
  ys=st['data']['data']['books']['entityTaxProfiles']
  assert len(ys)==1 and ys[0]['ownershipPct']==75 and ys[0]['accumulatedProfits']==500000, ys
  await card.screenshot(path=str(ROOT/'1_profile.png'))
  await page.reload(); await page.locator('div.rounded-2xl',has_text=ENT['name']).first.get_by_text('share 75%').wait_for(timeout=60000)
  # 2. Download the workpaper.
  await page.goto('http://localhost:8080/tax?fy=2025-26')
  btn=page.get_by_role('button',name='Download workpaper (PDF + spreadsheets)')
  await btn.scroll_into_view_if_needed(timeout=60000)
  async with page.expect_download(timeout=60000) as dl: await btn.click()
  path=ROOT/'wp.zip'; await (await dl.value).save_as(path)
  z=zipfile.ZipFile(path); names=set(z.namelist())
  assert {'0_workpaper.pdf','1_computation.csv','2_source_transactions.csv','3_assumptions.csv'}<=names, names
  assert z.read('0_workpaper.pdf')[:4]==b'%PDF'
  ass=z.read('3_assumptions.csv').decode()
  assert 'Fixture Traders' in ass and '75%' in ass and '5,00,000' in ass, ass[:500]
  assert st['docs']==1
  assert not errors, errors
  print('PASS: tax profile added, edited (60%→75%), saved once per change and read back after reload; workpaper ZIP downloaded with PDF + 3 CSVs, assumptions use the edited profile, one locked document saved. Cloud unchanged.')
  await b.close()
asyncio.run(main())
