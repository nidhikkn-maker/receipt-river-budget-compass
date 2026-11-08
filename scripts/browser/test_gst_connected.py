import asyncio,json,re,sys
from pathlib import Path
sys.path.insert(0,'/dev-server/scripts/browser')
import ast
module=ast.parse(Path('/dev-server/scripts/browser/test_exception_reports.py').read_text())
for item in module.body:
 if isinstance(item,ast.Assign) and isinstance(item.targets[0],ast.Name) and item.targets[0].id in ['HTML','STORE','CLIENT']:
  globals()[item.targets[0].id]=ast.literal_eval(item.value)
from playwright.async_api import async_playwright,expect
OUT=Path('/tmp/browser/gst-connected')
STORE=STORE.replace("const fixed=sessionStorage.getItem('fixed')==='yes';", "const fixed=true;")
STORE=STORE.replace("p.books={...emptyBooks()", "p.books={...emptyBooks()")
STORE=STORE.replace("const transactions=[base", "p.entities[0].gstins=['33AAAAA0000A1Z1'];p.books.gstInvoices=[{id:'gst-invoice',gstin:'33AAAAA0000A1Z1',kind:'sales',number:'SALE1',date:'2026-10-01',party:'Customer',partyGstin:'',taxable:1000,igst:0,cgst:100,sgst:100,cess:0,docId:'original-sale'}];p.books.taxProfiles=[{entityId:'A',regime:'new',gstScheme:'regular',auditRequired:false,obligations:[]}];p.books.savedDrafts=JSON.parse(sessionStorage.getItem('workings')||'null')||[{id:'old-three',form:'GSTR-3B',ref:'33AAAAA0000A1Z1',period:'2026-10',createdAt:'2026-10-02',data:{outputTax:180,itcClaimed:0,netPayable:180}}];const transactions=[{...base,id:'gst-payment',title:'GST 33AAAAA0000A1Z1',amount:200,originalAmount:200,date:'2026-10-20'},base")
FIXTURE='''import {createRoot} from 'react-dom/client';import {createRootRoute,createRoute,createRouter,Outlet,RouterProvider} from '@tanstack/react-router';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {Route as Inbox} from '/src/routes/_authenticated/inbox.tsx';import {GstReturns} from '/src/components/books/TaxCentre.tsx';import {Toaster} from '/src/components/ui/sonner.tsx';import '/src/styles.css';const q=new QueryClient();const root=createRootRoute({component:()=> <QueryClientProvider client={q}><Outlet/><Toaster/></QueryClientProvider>});const auth=createRoute({getParentRoute:()=>root,id:'_authenticated',component:Outlet});const tax=createRoute({getParentRoute:()=>auth,path:'/tax',component:()=> <GstReturns fy="2026-27"/>});const router=createRouter({routeTree:root.addChildren([auth.addChildren([Inbox.update({id:'/inbox',path:'/inbox',getParentRoute:()=>auth}),tax])])});createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);'''
BOOKS="""import React from '/node_modules/.vite/deps/react.js?v=0751a763';const {useState}=React;import {useStore} from '/src/lib/store.tsx';export const useDemat=()=>[];export function useBooks(){const store=useStore();const [books,set]=useState(store.preferences.books);return {books,preferences:store.preferences,save:async patch=>{const next={...books,...patch};sessionStorage.setItem('workings',JSON.stringify(next.savedDrafts));set(next);}}} """
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);c=await b.new_context(viewport={'width':1280,'height':1800});page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def isolate(route):
   q=route.request;path=q.url.split('localhost:8080')[-1].split('?')[0]
   if not q.url.startswith('http://localhost:8080'):await route.abort();return
   if q.is_navigation_request():await route.fulfill(body=HTML.replace("exception-reports.fixture","gst-connected.fixture"),content_type='text/html');return
   stubs={'/src/lib/store.tsx':STORE,'/src/integrations/supabase/client.ts':CLIENT,'/src/components/books/useBooks.ts':BOOKS,'/src/lib/import-repository.ts':'export const listImportRules=async()=>[];export const statementEvidence=async()=>null;export const listImports=async()=>[];export const listImportRows=async()=>[];','/src/components/InboxWork.tsx':'export const InboxWork=()=>null;','/src/components/books/DepreciationInboxCard.tsx':'export const DepreciationInboxCard=()=>null;'}
   if path in stubs:await route.fulfill(body=stubs[path],content_type='application/javascript');return
   assert q.method in ['GET','HEAD'],'No external writes permitted'
   await route.continue_()
  await c.route('**/*',isolate)
  await page.goto('http://localhost:8080/inbox',wait_until='networkidle');await page.locator('summary').filter(has_text='Business & company profile').click()
  row=page.locator('li').filter(has_text='GSTR-3B frozen working differs');await expect(row).to_have_count(1);await page.screenshot(path=str(OUT/'1-inbox-gst.png'));await row.get_by_role('link',name='Open').click();await expect(page).to_have_url(re.compile('/tax$'))
  await page.locator('summary').filter(has_text='GST returns (drafts)').click();await page.get_by_label('Month',exact=True).select_option('2026-10')
  await expect(page.get_by_text(re.compile('GSTR-3B frozen working differs'))).to_be_visible();await page.get_by_role('button',name='Save drafts for review',exact=True).dblclick()
  await expect(page.get_by_text(re.compile('GSTR-3B frozen working differs'))).to_have_count(0);await page.reload(wait_until='networkidle');await page.locator('summary').filter(has_text='GST returns (drafts)').click();await expect(page.get_by_text(re.compile('GSTR-3B frozen working differs'))).to_have_count(0)
  saved=await page.evaluate("JSON.parse(sessionStorage.getItem('workings'))");assert len(saved)==3 and next(x for x in saved if x['form']=='GSTR-3B')['id']=='old-three'
  await page.screenshot(path=str(OUT/'2-saved-reload.png'));assert not errors,errors
  print(json.dumps({'Inbox_to_tax_saved_working_reload':'PASS','three_unique_drafts_identity_preserved':'PASS','runtime_errors':errors,'scope':'synthetic local adapters; NOT hosted'}));await b.close()
asyncio.run(main())
