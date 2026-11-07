import asyncio, json, re
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright, expect
OUT=Path('/tmp/browser/workstream-1');OUT.mkdir(parents=True,exist_ok=True)
MOCK='''import React from "/node_modules/.vite/deps/react.js?v=a190b5c5";
const listeners=new Set();
const trip={id:'test',name:'Isolated test',destination:'Test',start:'2026-11-01',end:'2026-11-02',budget:100,currencies:['INR'],workspaceBudgets:[{workspace:'personal',amount:100}],travellerBudgets:[{traveller:'Me',amount:40}]};
const transactions=['Alpha North','Alpha South'].map((merchant,i)=>({id:'e'+i,merchant,title:merchant,amount:12.34,originalAmount:12.34,date:'2026-11-01',txnType:'expense',scope:'personal',category:'Meals',currency:'INR',receipts:[],tags:[]}));
const preferences={trips:[trip],merchantAliases:{},tags:[],categories:[{name:'Meals',archived:false}]};
const store={transactions,preferences,members:[],savePreferences:async next=>{store.preferences=next;window.__writes=(window.__writes||0)+1;listeners.forEach(f=>f());}};
export function useStore(){const [,render]=React.useReducer(x=>x+1,0);React.useEffect(()=>{listeners.add(render);return()=>listeners.delete(render)},[]);return store;}
'''
FIXTURE='''import React from 'react';import {createRoot} from 'react-dom/client';import '/src/styles.css';
import {Merchants} from '/src/routes/_authenticated/patterns.tsx';import {EditBudgetDialog,BudgetBreakdown} from '/src/components/trip/TripBudget.tsx';import {ReportDocumentVerification} from '/src/components/ReportDocumentVerification.tsx';import {useStore} from '/src/lib/store.tsx';import {Button} from '/src/components/ui/button.tsx';
function App(){const store=useStore();const [edit,setEdit]=React.useState(false),[verify,setVerify]=React.useState(false);return <main className="mx-auto max-w-3xl p-4 space-y-8"><h1>Isolated workflow acceptance</h1><Merchants/><Button onClick={()=>setEdit(true)}>Edit test budget</Button><EditBudgetDialog trip={store.preferences.trips[0]} open={edit} onOpenChange={setEdit}/><BudgetBreakdown trip={store.preferences.trips[0]}/><Button onClick={()=>setVerify(true)}>Verify test documents</Button>{verify&&<ReportDocumentVerification rows={[{id:'ok',title:'Original PDF',error:null},{id:'missing',title:'Missing bill',error:'File unavailable or empty'}]} required onDecision={proceed=>{window.__decision=proceed;setVerify(false)}}/>}</main>}createRoot(document.getElementById('root')).render(<App/>);'''
HTML='''<!doctype html><html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/workstream-1.fixture.tsx"></script></body></html>'''
async def main():
 global MOCK
 module=urllib.request.urlopen("http://localhost:8080/scripts/browser/workstream-1.fixture.tsx").read().decode()
 react=re.search(r'(/node_modules/\.vite/deps/react\.js\?v=[^"\s]+)',module)
 if not react:raise RuntimeError("React module identity unavailable")
 MOCK=re.sub(r'/node_modules/\.vite/deps/react\.js\?v=[^"\s]+',react.group(1),MOCK)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,height in [(1280,1800),(1180,820),(402,725)]:
   context=await browser.new_context(viewport={'width':width,'height':height});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   async def intercept(route):
    path=route.request.url.split('localhost:8080')[-1].split('?')[0]
    if not route.request.url.startswith('http://localhost:8080'):await route.abort();return
    if path=='/':await route.fulfill(body=HTML,content_type='text/html')
    elif path=='/scripts/browser/workstream-1.fixture.tsx':
     # Let Vite transform JSX via its transform endpoint is unavailable, so use
     # a temporary existing-project module served by the dev server below.
     await route.continue_()
    elif path=='/src/lib/store.tsx':await route.fulfill(body=MOCK,content_type='application/javascript')
    elif path=='/src/components/AppShell.tsx':await route.fulfill(body='export const PageTitle=()=>null;',content_type='application/javascript')
    elif path=='/src/components/ExpenseDialog.tsx':await route.fulfill(body='export const ExpenseDialog=()=>null;',content_type='application/javascript')
    else:await route.continue_()
   await page.route('**/*',intercept)
   await page.goto('http://localhost:8080',wait_until='networkidle')
   await page.get_by_role('button',name='Merge',exact=True).click();await expect(page.get_by_role('dialog')).to_contain_text('2 entries');assert await page.evaluate('window.__writes||0')==0
   await page.get_by_role('button',name='Cancel',exact=True).click();assert await page.evaluate('window.__writes||0')==0
   await page.get_by_role('button',name='Merge',exact=True).click();await page.get_by_role('button',name='Confirm grouping').click();await expect(page.get_by_role('button',name='Unmerge Alpha South')).to_be_visible()
   await page.get_by_role('button',name='Unmerge Alpha South').click();await page.get_by_role('button',name='Confirm grouping').click();await expect(page.get_by_role('button',name='Merge',exact=True)).to_be_visible()
   await page.get_by_role('button',name='Edit test budget').click();await expect(page.get_by_label('Total budget',exact=True)).to_have_value('100');await page.get_by_role('dialog').evaluate('(el) => Promise.all(el.getAnimations().map(a => a.finished))');await page.screenshot(path=str(OUT/f'{width}-budget.png'));await page.get_by_role('button',name='Close',exact=True).click()
   await page.get_by_label('Complete allocation').check();await page.get_by_role('tab',name='Traveller',exact=True).click();await page.get_by_label('Complete allocation').click();assert await page.evaluate('window.__writes')==3
   await page.get_by_role('button',name='Verify test documents').click();await expect(page.get_by_role('button',name='Confirm documents & generate')).to_be_disabled();await page.get_by_role('dialog').evaluate('(el) => Promise.all(el.getAnimations().map(a => a.finished))');await page.screenshot(path=str(OUT/f'{width}-documents.png'));await page.get_by_role('button',name='Cancel',exact=True).click();assert await page.evaluate('window.__decision')==False
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),f'overflow {width}'
   assert not errors,errors
   print(json.dumps({'viewport':[width,height],'merge_cancel_confirm_unmerge':'PASS','budget_initial_values_and_complete_control':'PASS','required_document_gate_cancel':'PASS','horizontal_overflow':False,'runtime_errors':errors,'storage':'isolated browser adapter; no Cloud writes'}))
   await context.close()
  await browser.close()
asyncio.run(main())
