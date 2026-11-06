import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/intake'); ID='00000000-0000-0000-0000-000000000091'; OP='00000000-0000-0000-0000-000000000092'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); c=await b.new_context(viewport={'width':1280,'height':1800}); page=await c.new_page(); state={'prefs':None,'run':None,'saved':None,'calls':0}; errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  async def rest(route):
   r=route.request
   if '/rest/v1/finance_preferences' in r.url and r.method=='GET':
    if state['prefs'] is None:
     rows=await (await route.fetch()).json(); base=rows[0] if isinstance(rows,list) else rows; base['owner_id']=m['session']['user']['id']; base['revision']=4; state['prefs']=base
     payload={**base['data'],'fixtureRecovered':True}; state['run']={'id':ID,'owner_id':base['owner_id'],'file_name':'controlled-original.pdf','context':'','stage':'Save','status':'failed','error':'Connection interrupted','document_id':ID,'attempts':1,'updated_at':'2026-11-06T04:00:00Z','data':{'stashPath':base['owner_id']+'/runs/controlled.pdf','mimeType':'application/pdf','read':{'docType':'other','title':'Controlled original','fields':[],'text':'Controlled original','date':None,'amount':None,'currency':'INR','merchant':None,'notes':''},'docType':'other','fields':[],'intakeAttempt':{'id':OP,'documentId':ID,'data':payload,'lock':False,'expected':4,'route':'document'}}}
    await route.fulfill(status=200,content_type='application/json',body=json.dumps([state['prefs']])); return
   if '/rest/v1/document_runs' in r.url:
    if r.method=='GET': await route.fulfill(status=200,content_type='application/json',body=json.dumps([state['run']] if state['run']['status']=='failed' else [])); return
    if r.method=='PATCH': state['run'].update(r.post_data_json); await route.fulfill(status=204,body=''); return
   if '/rest/v1/rpc/commit_document_intake_reviewed' in r.url:
    x=r.post_data_json; state['calls']+=1; assert x['_id']==OP and x['_expected']==4 and x['_data']['fixtureRecovered']
    if state['saved'] is None:
     state['saved']=x; state['prefs']['data']=x['_data']; state['prefs']['revision']=5
     await route.fulfill(status=503,body='connection lost after committed'); return
    assert state['saved']==x
    await route.fulfill(status=200,content_type='application/json',body='5'); return
   if r.method not in ('GET','HEAD','OPTIONS'): await route.fulfill(status=403,body='blocked controlled check'); return
   await route.continue_()
  async def storage(route):
   if route.request.method=='GET': await route.fulfill(status=200,content_type='application/pdf',body=b'%PDF-1.4\ncontrolled'); return
   await route.fulfill(status=200,content_type='application/json',body='[]')
  await c.route('**/rest/v1/**',rest); await c.route('**/storage/v1/**',storage)
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f:m=json.load(f)
  await page.goto('http://localhost:8080'); await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[m['storage_key'],json.dumps(m['session'])]); await page.goto('http://localhost:8080/statements')
  await page.get_by_role('button',name='Resume',exact=True).click(timeout=60000); review=page.get_by_role('region',name='Document review controlled-original.pdf'); await review.get_by_role('button',name='Save to DocuRepo',exact=True).click(); await review.get_by_role('button',name='Retry',exact=True).wait_for(); await review.screenshot(path=str(ROOT/'interrupted.png'))
  await page.reload(); await page.get_by_role('button',name='Resume',exact=True).click(timeout=60000); review=page.get_by_role('region',name='Document review controlled-original.pdf'); await review.get_by_role('button',name='Save to DocuRepo',exact=True).click(); await review.get_by_text('Stored in DocuRepo and linked.',exact=False).wait_for(); await review.screenshot(path=str(ROOT/'recovered.png')); assert state['calls']==2 and state['run']['status']=='done'; assert not errors,errors
  print('PASS /statements: resumed durable request, committed-but-lost-response recovered after reload using identical operation/payload/revision; one save, no production writes.'); await b.close()
asyncio.run(main())
