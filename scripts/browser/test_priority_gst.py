import asyncio,json,os,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/priority-check')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={'width':1280,'height':1800});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  m=json.load(open(os.path.expanduser('~/.cache/lovable-auth/session.json')))
  G='33AAAAA0000A1Z5';state={'data':None,'writes':0,'revision':1}
  async def rest(route):
   req=route.request
   if '/rest/v1/finance_preferences' in req.url and req.method=='GET':
    if state['data'] is None:
     rows=await (await route.fetch()).json();base=rows[0] if isinstance(rows,list) else rows;data=base.get('data') or {};data['entities']=[{'id':'fixture','name':'Controlled GST company','kind':'company','pan':'','gstins':[G],'booksFrom':'2026-27'}];data['books']={**(data.get('books') or {}),'closedPeriods':[],'periodLog':[],'entityAccounts':{},'gstInvoices':[],'gstAdvances':[],'taxProfiles':[{'entityId':'fixture','regime':'new','gstScheme':'regular','auditRequired':False,'obligations':[]} ]};state['data']=data
    body={'owner_id':m['session']['user']['id'],'data':state['data'],'revision':state['revision']};await route.fulfill(status=200,content_type='application/json',body=json.dumps(body if 'vnd.pgrst.object' in req.headers.get('accept','') else [body]));return
   if '/rest/v1/rpc/save_reviewed_preferences' in req.url:
    body=req.post_data_json;assert body['_approved'];state['data']=body['_data'];state['writes']+=1;state['revision']+=1;await route.fulfill(status=200,content_type='application/json',body=str(state['revision']));return
   if req.method not in ('GET','HEAD','OPTIONS'):await route.fulfill(status=403,body='Blocked controlled test');return
   await route.continue_()
  await ctx.route('**/rest/v1/**',rest)
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[m['storage_key'],json.dumps(m['session'])]);await page.goto('http://localhost:8080/tax');await page.get_by_text('GST returns (drafts)',exact=True).click(timeout=60000)
  await page.get_by_label('Month',exact=True).select_option('2026-10');await page.get_by_text(re.compile('Invoice register ·')).click();await page.get_by_role('button',name='Add invoice',exact=True).click();await page.get_by_label('Invoice number',exact=True).fill('TEST1');await page.get_by_label('Invoice date',exact=True).fill('2026-10-05');await page.get_by_label('Party',exact=True).fill('Controlled customer');await page.get_by_label('TAXABLE',exact=True).fill('1000');await page.get_by_role('button',name='Save invoice',exact=True).click();await page.get_by_role('dialog').wait_for();await page.get_by_role('dialog').screenshot(path=str(ROOT/'1_approval.png'));assert state['writes']==0;await page.get_by_role('button',name='Approve & save',exact=True).click();await page.get_by_text(re.compile('Sale TEST1')).wait_for();assert state['writes']==1
  await page.get_by_role('button',name='Amend',exact=True).click();await page.get_by_label('TAXABLE',exact=True).fill('1100');await page.get_by_role('button',name='Save invoice',exact=True).click();await page.get_by_role('button',name='Approve & save',exact=True).click();assert state['writes']==2;await page.get_by_label('Invoice number',exact=True).wait_for(state='detached');await page.get_by_text(re.compile('Invoice register · 1 in')).wait_for();assert len([i for i in state['data']['books']['gstInvoices'] if not any(x.get('amendsId')==i['id'] for x in state['data']['books']['gstInvoices'])])==1
  await page.get_by_text(re.compile('Advance receipts ·')).click();await page.get_by_role('button',name='Add advance',exact=True).click();await page.get_by_label('Advance number').fill('ADV1');await page.get_by_label('Advance taxable',exact=True).fill('500');await page.get_by_label('Advance igst',exact=True).fill('90');await page.get_by_role('button',name='Save advance',exact=True).click();await page.get_by_role('button',name='Approve & save',exact=True).click();assert len(state['data']['books']['gstAdvances'])==1
  await page.get_by_role('dialog').wait_for(state='hidden');await page.screenshot(path=str(ROOT/'2_saved.png'));await page.reload();await page.get_by_text('GST returns (drafts)',exact=True).click();await page.get_by_label('Month',exact=True).select_option('2026-10');await page.get_by_text(re.compile('Invoice register ·')).click();assert len([i for i in state['data']['books']['gstInvoices'] if not any(x.get('amendsId')==i['id'] for x in state['data']['books']['gstInvoices'])])==1;assert not errors,errors
  print('PASS: controlled GST invoice approval saves once; amendment shows one current invoice; service advance saved; reload retains current invoice. All real writes blocked.');await b.close()
asyncio.run(main())
