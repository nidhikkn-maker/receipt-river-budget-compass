import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/loan-balances')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page(); state={'prefs':None};errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def rest(route):
   r=route.request;u=r.url;one='vnd.pgrst.object' in r.headers.get('accept','')
   if '/rest/v1/finance_preferences' in u:
    if r.method=='GET':
     if state['prefs'] is None:
      res=await route.fetch();rows=await res.json();state['prefs']=rows[0] if isinstance(rows,list) else rows;state['prefs']['data'].setdefault('books',{})['loanBalances']=[]
     return await route.fulfill(status=200,content_type='application/json',body=json.dumps(state['prefs'] if one else [state['prefs']]))
    x=r.post_data_json;x=x[0] if isinstance(x,list) else x;state['prefs']['data']=x['data'];state['prefs']['revision']=state['prefs'].get('revision',0)+1
    return await route.fulfill(status=200,content_type='application/json',body=json.dumps({'revision':state['prefs']['revision']}))
   if '/rest/v1/loans' in u:
    rows=[{'id':'controlled-loan','owner_id':'fixture','name':'Controlled lender loan','principal_outstanding':900000,'original_principal':1000000,'annual_rate':8,'emi':20000,'next_due':'2026-12-05','provider':'Controlled lender','loan_type':'personal','start_date':None,'prepayment_terms':'','foreclosure_pct':0,'account_id':None,'source_transaction_id':None,'payments':[],'status':'active'}]
    return await route.fulfill(status=200,content_type='application/json',body=json.dumps(rows))
   if '/rest/v1/documents' in u:
    rows=[{'id':'controlled-statement','owner_id':'fixture','title':'Controlled lender statement','doc_type':'loan_statement','file_path':'fixture/source.pdf','file_name':'source.pdf','mime_type':'application/pdf','size_bytes':100,'doc_date':'2026-10-05','amount':800000,'currency':'INR','merchant':'Controlled lender','notes':'','extracted_text':'Principal outstanding 800000','transaction_id':None,'account_id':None,'loan_id':'controlled-loan','expires_on':None,'created_at':'2026-11-06','fields':[],'replaces_id':None,'evidence_locked':True}]
    return await route.fulfill(status=200,content_type='application/json',body=json.dumps(rows))
   if r.method not in ('GET','HEAD','OPTIONS'):return await route.fulfill(status=403,body='isolated writes blocked')
   await route.continue_()
  await c.route('**/rest/v1/**',rest)
  m=json.load(open(os.path.expanduser('~/.cache/lovable-auth/session.json')))
  await page.goto('http://localhost:8080/auth',wait_until='domcontentloaded');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[m['storage_key'],json.dumps(m['session'])]);await page.goto('http://localhost:8080/wealth',wait_until='domcontentloaded')
  summary=page.get_by_text('Lender balance · Needs dated statement evidence',exact=True);await summary.wait_for(timeout=60000);await summary.click()
  await page.get_by_text('Not included in net worth until a dated lender balance is confirmed.',exact=True).wait_for()
  await page.get_by_label('Lender statement for Controlled lender loan').select_option('controlled-statement')
  await page.get_by_label('Lender outstanding for Controlled lender loan').fill('800000');await page.get_by_label('Lender balance date for Controlled lender loan').fill('2026-10-05');await page.get_by_label('Balance source for Controlled lender loan').fill('Page 1: Principal outstanding 800000')
  button=page.get_by_role('button',name='Confirm lender balance',exact=True);assert await button.is_disabled()
  await page.get_by_role('checkbox',name='I checked this outstanding balance and date against the lender statement.').check();await button.click()
  await page.get_by_text('Lender balance · ₹8,00,000.00 as of 2026-10-05',exact=True).wait_for(timeout=30000)
  assert len(state['prefs']['data']['books']['loanBalances'])==1
  await page.locator('details',has=page.get_by_text('Lender balance · ₹8,00,000.00 as of 2026-10-05',exact=True)).screenshot(path=str(ROOT/'saved.png'))
  await page.reload();await page.get_by_text('Lender balance · ₹8,00,000.00 as of 2026-10-05',exact=True).wait_for(timeout=60000)
  await page.set_viewport_size({'width':390,'height':844});assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  await page.get_by_text('Lender balance · ₹8,00,000.00 as of 2026-10-05',exact=True).click();await page.locator('details',has=page.get_by_text('Lender balance · ₹8,00,000.00 as of 2026-10-05',exact=True)).screenshot(path=str(ROOT/'mobile.png'))
  assert not errors,errors;print('PASS controlled Wealth: missing evidence flagged, confirmation required, dated source saved, reload retained, mobile no horizontal overflow; no hosted financial writes');await b.close()
asyncio.run(main())
