import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/period-recovery')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); c=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True); page=await c.new_page(); state={'prefs':None,'evidence':[]}; errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  async def rest(route):
   r=route.request
   if '/rest/v1/finance_preferences' in r.url and r.method=='GET':
    if state['prefs'] is None:
     res=await route.fetch(); rows=await res.json(); base=rows[0] if isinstance(rows,list) else rows; base['data']['books']={**base['data'].get('books',{}),'closedPeriods':[],'periodLog':[]}; state['prefs']=base
    await route.fulfill(status=200,content_type='application/json',body=json.dumps([state['prefs']])); return
   if '/rest/v1/imported_period_history' in r.url:
    await route.fulfill(status=200,content_type='application/json',body=json.dumps([{'id':'controlled-import','imported_at':'2026-11-06T05:00:00Z','history':{'savedEvidence':[{'entryCount':99}]}}])); return
   if '/rest/v1/period_close_evidence' in r.url:
    await route.fulfill(status=200,content_type='application/json',body=json.dumps(state['evidence'])); return
   if '/rest/v1/rpc/change_accounting_period' in r.url:
    x=r.post_data_json; books=state['prefs']['data']['books']; assert x['_expected']=={'closedPeriods':books['closedPeriods'],'periodLog':books['periodLog']}
    if x['_action']=='closed':
     books['closedPeriods'].append({'id':x['_period'],'from':x['_from'],'to':x['_to'],'closedOn':'2026-11-06','note':x['_reason']})
     e={'id':x['_id'],'periodId':x['_period'],'from':x['_from'],'to':x['_to'],'at':'2026-11-06T05:00:00Z','entryCount':2,'reconciled':1,'ledgerRevision':'a'*64,'ledger':[{'amount':1250},{'amount':750}]}
    else:
     assert len(x['_reason'].strip())>=5; books['closedPeriods']=[]; e={'reason':x['_reason'],'action':'reopened'}
    books['periodLog'].append({'periodId':x['_period'],'action':x['_action'],'at':'2026-11-06T05:00:00Z','reason':x['_reason']}); state['evidence'].insert(0,{'id':x['_id'],'period_id':x['_period'],'action':x['_action'],'created_at':'2026-11-06T05:00:00Z','evidence':e})
    await route.fulfill(status=200,content_type='application/json',body=json.dumps(e)); return
   if r.method not in ('GET','HEAD','OPTIONS'):
    await route.fulfill(status=403,body='blocked isolated check'); return
   await route.continue_()
  await c.route('**/rest/v1/**',rest)
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: m=json.load(f)
  await page.goto('http://localhost:8080'); await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[m['storage_key'],json.dumps(m['session'])]); await page.goto('http://localhost:8080/audit#periods')
  await page.get_by_role('button',name='Close period',exact=True).wait_for(timeout=60000)
  await page.get_by_label('From',exact=True).fill('2025-04-01'); await page.get_by_label('To',exact=True).fill('2026-03-31'); await page.get_by_placeholder('Note (e.g. FY audited and filed)').fill('Controlled review')
  # Closing and reopening use in-app dialogs (typed period, required reason); any browser pop-up is a failure.
  page.on('dialog',lambda d:(errors.append('browser dialog: '+d.message),asyncio.ensure_future(d.dismiss())))
  await page.get_by_role('button',name='Close period',exact=True).click(); dlg=page.get_by_role('dialog')
  await dlg.get_by_label('Type the period').fill('2025-04-01 to 2026-03-31'); await dlg.get_by_role('button',name='Close period',exact=True).click(); await page.get_by_text('Saved closing evidence (1)',exact=True).wait_for(); await page.get_by_text('Saved closing evidence (1)',exact=True).click(); await page.get_by_text('2 entries · 1 reconciled',exact=False).wait_for()
  async with page.expect_download() as dl: await page.get_by_role('button',name='Download evidence',exact=True).click()
  await (await dl.value).save_as(ROOT/'evidence.json'); data=json.loads((ROOT/'evidence.json').read_text()); assert data['entryCount']==2 and len(data['ledgerRevision'])==64
  await page.get_by_text('Unverified backup copy; not an active closure or authoritative snapshot',exact=True).wait_for()
  async with page.expect_download() as imported: await page.get_by_role('button',name='Download imported history',exact=True).click()
  await (await imported.value).save_as(ROOT/'imported.json'); assert json.loads((ROOT/'imported.json').read_text())['verification']=='Unverified imported backup history'
  await page.locator('#periods').screenshot(path=str(ROOT/'closed.png'))
  await page.reload(); await page.get_by_text('Saved closing evidence (1)',exact=True).wait_for(timeout=60000); await page.locator('#periods').get_by_role('button',name='Reopen',exact=True).click(); await page.get_by_role('dialog').get_by_label('Reason for reopening (kept permanently)').fill('Accountant correction'); await page.get_by_role('dialog').get_by_role('button',name='Reopen period',exact=True).click(); await page.get_by_text('Saved closing evidence (2)',exact=True).wait_for(); assert len(state['evidence'])==2 and state['evidence'][1]['evidence']==data
  await page.locator('#periods').screenshot(path=str(ROOT/'reopened.png')); assert not errors,errors
  print('PASS isolated /audit: close with saved counts; evidence JSON download; reload; reasoned reopen retains old evidence. No real financial writes.'); await b.close()
asyncio.run(main())
