import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright,expect
ns={};exec(Path('/dev-server/scripts/browser/test_exception_reports.py').read_text().split('async def main():')[0],ns)
read=json.loads(Path('/tmp/browser/accounting-document/extracted.json').read_text())['result']['audited']
STORE=ns['STORE'].replace("p.books={", "p.books={").replace("gstInvoices:[", "fyRecords:["+json.dumps({'id':'fy-real-read','entityId':'A','fy':read['fy'],'audited':{r['head']:r['amount'] for r in read['lines']},'docIds':['doc-a'],'schedules':read['schedules'],'details':[{**d,'docId':'doc-a'} for d in read['details']],'qualifications':[],'filedReturns':[],'lossesCarriedForward':[]})+"],gstInvoices:[")
STORE=STORE.replace("const transactions=[base,", "const transactions=[...JSON.parse(sessionStorage.getItem('journals')||'[]'),{...base,id:'bank-rent',title:'Bank rent payment',entityId:'A',entitySource:'manual',category:'rent',amount:500,originalAmount:500,date:'2026-11-02',txnType:'expense'},base,")
STORE=STORE.replace("openingBalance:1000,","openingBalance:0,").replace("{id:'bank-b',", "{id:'loan-a',name:'Loan',kind:'loan',openingBalance:0,archived:false},{id:'bank-b',")
STORE=STORE.replace("entityAccounts:{A:['bank-a']}","entityAccounts:{A:['bank-a','loan-a']}")
STORE=STORE.replace('documents:fixed?[','documents:[').replace("text:'Printed invoice 250.25'}]:[]", "entityId:'A',filePath:'owner/original.pdf',text:'Printed invoice 250.25'}]")
STORE=STORE.replace("const fixed=sessionStorage","const fixed=sessionStorage")
STORE=STORE.replace("p.books={","p.books={")
STORE=STORE.replace('departmentBudgets:{}',"""preferencesRevision:0,accountingAvailable:async()=>true,accountantData:async()=>({grants:JSON.parse(sessionStorage.getItem('grants')||'[]'),evidence:JSON.parse(sessionStorage.getItem('journals')||'[]').map(e=>({id:e.receiptDetails.accounting.journal.id,owner_id:'isolated-report-owner',entity_id:'A',journal:e.receiptDetails.accounting.journal})),reviews:JSON.parse(sessionStorage.getItem('notes')||'[]')}),setAccountantGrant:async(entity,accountant,revoke)=>{sessionStorage.setItem('grants',JSON.stringify([{entity_id:entity,owner_id:'isolated-report-owner',accountant_id:accountant,revoked_at:revoke?'2026-11-08':null}]))},reviewAccounting:async p=>{const rows=JSON.parse(sessionStorage.getItem('notes')||'[]');if(!rows.some(r=>r.id===p.id))rows.push({...p,journal_id:p.journal,actor_id:'isolated-accountant',created_at:'2026-11-08'});sessionStorage.setItem('notes',JSON.stringify(rows));if(sessionStorage.getItem('noteLost')!=='yes'){sessionStorage.setItem('noteLost','yes');throw Error('Interrupted committed note')}},postAccounting:async attempt=>{const rows=JSON.parse(sessionStorage.getItem('journals')||'[]');if(!rows.some(r=>r.id===attempt.journal.id)){const linked=attempt.journal.legs.filter(l=>l.accountId);for(const [n,l] of (linked.length?linked:[null]).entries())rows.push({...base,id:attempt.journal.id+(n?':'+n:''),accountId:l?.accountId||null,amount:l?Math.abs(l.debit-l.credit):100,adjustmentSign:l?((l.role==='liability'?l.credit-l.debit:l.debit-l.credit)>0?1:-1):1,txnType:'adjustment',entityId:'A',entitySource:'manual',date:attempt.journal.date,receiptDetails:{accounting:{journal:attempt.journal,primary:n===0,requestId:attempt.requestId}}});sessionStorage.setItem('journals',JSON.stringify(rows));if(attempt.journal.kind==='adjustment')throw Error('Interrupted committed settlement');}},departmentBudgets:{}""")

STORE=STORE.replace('return {userId:', "const intake=JSON.parse(sessionStorage.getItem('intake')||'null');if(intake)p.books={...p.books,...intake.books,fyRecords:intake.books.fyRecords};return {userId:")
STORE=STORE.replace('documents:[',"documents:[...JSON.parse(sessionStorage.getItem('uploadedDocs')||'[]'),")
STORE=STORE.replace('fyRecords:[','fyRecords:[')
STORE=STORE.replace('preferencesRevision:0,',"""preferencesRevision:0,addDocument:async(file,meta)=>{const docs=JSON.parse(sessionStorage.getItem('uploadedDocs')||'[]');if(!docs.some(d=>d.id===meta.id))docs.push({...meta,filePath:'synthetic/'+meta.id+'/'+file.name,fileName:file.name,size:file.size,mimeType:file.type,createdAt:'2026-11-08',fields:meta.fields||[]});sessionStorage.setItem('uploadedDocs',JSON.stringify(docs));return meta.id},updateDocument:async()=>{},commitDocumentRecords:async(id,data)=>{sessionStorage.setItem('intake',JSON.stringify(data));if(!sessionStorage.getItem('intakeLost')){sessionStorage.setItem('intakeLost','yes');throw Error('Interrupted committed intake')}},""")

async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True);page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   q=route.request;path=q.url.split('localhost:8080')[-1].split('?')[0]
   if not q.url.startswith('http://localhost:8080'):await route.abort();return
   if q.is_navigation_request():await route.fulfill(body=ns['HTML'].replace('exception-reports.fixture.tsx','accounting-journey.fixture.tsx'),content_type='text/html');return
   stubs={'/src/lib/store.tsx':STORE,'/src/lib/books/runs.ts':"export const documentIdForRun=id=>id;export const startRun=async()=>({data:{}});export const updateRun=async()=>{};export const closeRun=async()=>{};",'/src/lib/document-extract.functions.ts':'export const extractDocument=()=>{};','/src/integrations/supabase/client.ts':ns['CLIENT'],'/src/components/BackgroundReports.tsx':'export const BackgroundReports=()=>null;'}
   if 'tanstack_react-start' in path or 'tanstack/react-start/dist/esm/index.js' in path:
    await route.fulfill(body='export const createMiddleware=()=>{const m={middleware:()=>m,server:()=>m,client:()=>m};return m};export const createServerFn=()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:()=>()=>({})};return b};export const useServerFn=()=>async()=>('+json.dumps(json.loads(Path('/tmp/browser/accounting-document/extracted.json').read_text()))+');',content_type='application/javascript');return
   if path in stubs:await route.fulfill(body=stubs[path],content_type='application/javascript');return
   if q.method not in ['GET','HEAD']:raise AssertionError('External writes blocked')
   await route.continue_()
  await c.route('**/*',isolate)
  async def open_company():
   await page.goto('http://localhost:8080/report-centre',wait_until='networkidle');await page.screenshot(path='/tmp/browser/accounting-milestone/report-error.png');await page.get_by_role('combobox').first.select_option('company-profit-loss');await page.get_by_label('Accounting company').select_option('A');await page.get_by_text('Opening balances & adjusting entries',exact=True).click()
  await page.goto('http://localhost:8080/statements',wait_until='networkidle');await page.get_by_label('Company financial original').set_input_files('/tmp/browser/accounting-document/invoice.png')
  await page.get_by_text('Tick to confirm it belongs to this company.',exact=False).locator('..').get_by_role('checkbox').check()
  await page.get_by_role('button',name='Confirm and save',exact=True).click();await page.screenshot(path='/tmp/browser/accounting-milestone/intake.png');await expect(page.get_by_text('Reconcile: Interrupted committed intake.',exact=False)).to_be_visible();await page.get_by_role('button',name='Retry',exact=True).click();await expect(page.get_by_text('Saved',exact=True)).to_be_visible()
  intake=await page.evaluate("JSON.parse(sessionStorage.getItem('intake'))");assert all(d.get('docId') for d in intake['books']['fyRecords'][-1]['details'])
  await open_company();await page.get_by_text('Detailed opening schedules · 2025-26',exact=True).click();await page.locator('summary').filter(has_text='trialBalance').click()
  labels=read['details'][0]['lines'];assert len(labels)>=6
  heads=['bank','fixedAssets','receivables','loans','payables','capitalReserves']
  for i,head in enumerate(heads):
   await page.get_by_label(f'Opening head 0-{i}',exact=True).select_option(head);await page.get_by_label(f'Opening code 0-{i}',exact=True).fill('opening:'+head)
   await page.get_by_label(f'Opening role 0-{i}',exact=True).select_option('equity' if i==5 else 'liability' if i>=3 else 'asset')
   await page.get_by_label(f'Opening side 0-{i}',exact=True).select_option('credit' if i>=3 else 'debit')
   if head in ['bank','loans']:await page.get_by_label(f'Opening account 0-{i}',exact=True).select_option('bank-a' if head=='bank' else 'loan-a')
  await page.get_by_role('button',name='Prepare detailed opening',exact=True).click();await expect(page.get_by_label('Debit 1',exact=True)).to_have_value('100000');await page.get_by_role('button',name='Confirm balanced journal').click();await expect(page.get_by_role('dialog')).not_to_be_visible()
  await page.reload(wait_until='networkidle');await page.screenshot(path='/tmp/browser/accounting-milestone/report-error.png');await page.get_by_role('combobox').first.select_option('company-profit-loss');await page.get_by_label('Accounting company').select_option('A');await page.get_by_text('Opening balances & adjusting entries',exact=True).click();await page.get_by_role('button',name='Prepare journal',exact=True).click()
  await page.get_by_label('Journal date',exact=True).fill('2026-11-01');await page.get_by_label('Journal explanation').fill('Unpaid November rent');await page.get_by_label('Journal original').select_option('doc-a')
  for i,code,label,role,field in [(1,'expense:rent','Rent','expense','Debit'),(2,'payable:rent','Rent payable','liability','Credit')]:
   await page.get_by_label(f'Account code {i}',exact=True).fill(code);await page.get_by_label(f'Account label {i}',exact=True).fill(label);await page.get_by_label(f'Account role {i}',exact=True).select_option(role);await page.get_by_label(f'{field} {i}',exact=True).fill('1200')
  await page.get_by_role('button',name='Confirm balanced journal').click();await expect(page.get_by_role('dialog')).not_to_be_visible();await open_company()
  await page.get_by_text('Settle · Unpaid November rent',exact=True).click();await page.locator('select[aria-label^="Bank settlement"]').select_option('bank-rent');await expect(page.get_by_label('Debit 1',exact=True)).to_have_value('500');await page.get_by_role('button',name='Confirm balanced journal').click();await expect(page.get_by_text('Interrupted committed settlement',exact=True).first).to_be_visible()
  await open_company();await page.get_by_role('button',name='Resume journal').click();await page.get_by_role('button',name='Confirm balanced journal').click();await expect(page.get_by_role('dialog')).not_to_be_visible();await open_company();await page.get_by_text('Settle · Unpaid November rent',exact=True).click();await expect(page.get_by_text('Rent payable · outstanding 700.00',exact=True)).to_be_visible()
  await page.locator('details').filter(has=page.get_by_label('Accountant email or account ID')).last.evaluate('(e)=>e.open=true');await page.get_by_label('Accountant email or account ID').fill('00000000-0000-0000-0000-000000000003');await page.get_by_role('button',name='Grant review access').click();await expect(page.get_by_role('button',name='Revoke access')).to_be_visible();await page.get_by_role('button',name='Revoke access').click();await expect(page.get_by_role('button',name='Restore access')).to_be_visible()
  await open_company();await page.locator('details').filter(has=page.get_by_label('Accountant email or account ID')).last.evaluate('(e)=>e.open=true')
  evidence=page.locator('details').filter(has=page.locator('input[aria-label^="Review note"]')).last
  await page.locator('details').evaluate_all('(rows)=>rows.forEach(e=>e.open=true)')
  note=page.locator('input[aria-label^="Review note"]').last;await note.fill('Retained original and accounting classification inspected')
  await page.wait_for_timeout(400);await open_company();await page.locator('details').filter(has=page.get_by_label('Accountant email or account ID')).last.evaluate('(e)=>e.open=true')
  evidence=page.locator('details').filter(has=page.locator('input[aria-label^="Review note"]')).last;await page.locator('details').evaluate_all('(rows)=>rows.forEach(e=>e.open=true)')
  await expect(page.locator('input[aria-label^="Review note"]').last).to_have_value('Retained original and accounting classification inspected')
  await page.get_by_role('button',name='Save review note',exact=True).last.click()
  await expect(page.get_by_text('Interrupted committed note',exact=True).first).to_be_visible()
  await open_company();await page.locator('details').filter(has=page.get_by_label('Accountant email or account ID')).last.evaluate('(e)=>e.open=true')
  evidence=page.locator('details').filter(has=page.locator('input[aria-label^="Review note"]')).last;await page.locator('details').evaluate_all('(rows)=>rows.forEach(e=>e.open=true)')
  await expect(page.locator('input[aria-label^="Review note"]').last).to_be_disabled();await page.get_by_role('button',name='Retry same review').click()
  assert await page.evaluate("JSON.parse(sessionStorage.getItem('notes')).length") == 1
  await page.screenshot(path='/tmp/browser/accounting-milestone/review.png');assert not errors,errors
  journals=await page.evaluate("JSON.parse(sessionStorage.getItem('journals'))");assert len({e['receiptDetails']['accounting']['journal']['id'] for e in journals})==3
  print('PASS: actual detailed opening with six mapped retained source lines and encrypted interrupted review notes; actual non-mocked extraction output → opening review/save/reload → accrual → partial bank settlement → interrupted reply/encrypted retry → 700 outstanding → accountant grant/revoke. Local adapters only; no hosted writes.')
  await b.close()
asyncio.run(main())
