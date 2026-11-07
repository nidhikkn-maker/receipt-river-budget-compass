"""Actual builder/PDF/browser download, controlled local storage adapter; never hosted certification."""
import asyncio, hashlib, json, re, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright, expect
OUT = Path('/tmp/browser/report-builder')
OUT.mkdir(parents=True, exist_ok=True)
HTML = '<html><head><script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head><body><div id="root"></div><script type="module" src="/scripts/browser/report-builder.fixture.tsx"></script></body></html>'
STORE = '''import React from "REACT_URL";import {defaultPreferences} from '/src/lib/preferences.ts';
const entry={id:'e',title:'Isolated hotel',merchant:'Test hotel',category:'Hotels',scope:'business',amount:12.34,originalAmount:12.34,currency:'INR',fxRate:1,date:'2026-11-01',description:'',paymentMethod:'bank_transfer',accountId:'bank',receipts:[{name:'original.pdf',path:'isolated/original.pdf',type:'application/pdf'}],tags:[],splits:[],memberId:null,reconciledAt:null,statementRef:null};
const store={userId:'isolated',name:'Test owner',loading:false,preferences:defaultPreferences(),transactions:[entry],expenses:[entry],accounts:[{id:'bank',name:'Test bank',kind:'savings',openingBalance:100,archived:false}],memberName:()=> 'Test owner',signedUrl:async()=>'/isolated-original.pdf'};
export function useStore(){return store;}'''
CLIENT = '''let row=null;
export const supabase={storage:{from:()=>({upload:async(path,blob)=>{window.__uploaded=Array.from(new Uint8Array(await blob.arrayBuffer()));window.__path=path;return {error:null}}})},from:()=>{const q={};for(const m of ['select','eq','order','range','contains','limit'])q[m]=()=>q;q.then=done=>Promise.resolve({data:[],error:null}).then(done);q.maybeSingle=async()=>({data:row,error:null});q.insert=async r=>{row=r;window.__history=r;return {error:{message:'Isolated lost insert response'}}};return q}};'''

def original_pdf():
    from reportlab.pdfgen import canvas
    import io
    b = io.BytesIO(); c = canvas.Canvas(b, pagesize=(321,456)); c.drawString(20,200,'ISOLATED ORIGINAL BILL 12.34'); c.save(); return b.getvalue()

async def main():
    module = urllib.request.urlopen('http://localhost:8080/scripts/browser/report-builder.fixture.tsx').read().decode()
    react = re.search(r'(/node_modules/\.vite/deps/react\.js\?v=[^"\s]+)', module)
    if not react: raise RuntimeError('React identity unavailable')
    store = STORE.replace('REACT_URL', react.group(1)); original = original_pdf()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width,height in [(1280,1800),(1180,820),(402,725)]:
            context = await browser.new_context(viewport={'width':width,'height':height},accept_downloads=True)
            page = await context.new_page(); errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            async def intercept(route):
                url=route.request.url
                if not url.startswith('http://localhost:8080'): await route.abort(); return
                path=url.split('localhost:8080')[-1].split('?')[0]
                if path=='/': await route.fulfill(body=HTML,content_type='text/html')
                elif path=='/isolated-original.pdf': await route.fulfill(body=original,content_type='application/pdf')
                elif path=='/src/lib/store.tsx': await route.fulfill(body=store,content_type='application/javascript')
                elif path=='/src/integrations/supabase/client.ts': await route.fulfill(body=CLIENT,content_type='application/javascript')
                elif path=='/src/components/AppShell.tsx': await route.fulfill(body='export const PageTitle=({title})=>title;',content_type='application/javascript')
                elif path=='/src/components/useClaimPreparation.ts': await route.fulfill(body='export const useClaimPreparation=()=>({status:"",saveNow:()=>{}});',content_type='application/javascript')
                elif path=='/src/components/ExpenditureReportBuilder.tsx':
                    response=await route.fetch(); body=await response.text()
                    # Navigation is unused; avoid requiring an app Router for this isolated fixture.
                    body=re.sub(r'const navigate = useNavigate\(\);','const navigate = () => {};',body)
                    await route.fulfill(response=response,body=body)
                else: await route.continue_()
            await page.route('**/*',intercept)
            await page.goto('http://localhost:8080',wait_until='networkidle')
            await page.get_by_role('button',name='Generate statement PDF').click()
            await expect(page.get_by_role('dialog')).to_contain_text('1 readable')
            assert await page.evaluate('window.__history||null') is None
            await page.get_by_role('button',name='Confirm documents & generate').click()
            await expect(page.get_by_text('Saved in Reports Centre → Report history.',exact=True)).to_be_visible(timeout=30000)
            async with page.expect_download() as event:
                await page.get_by_role('button',name='Download',exact=True).click()
            download=await event.value; path=OUT/f'{width}.pdf';await download.save_as(path)
            uploaded=bytes(await page.evaluate('window.__uploaded'))
            actual=path.read_bytes(); assert actual==uploaded and actual.startswith(b'%PDF')
            from pypdf import PdfReader
            pdf=PdfReader(path);assert any(float(p.mediabox.width)==321 and float(p.mediabox.height)==456 for p in pdf.pages)
            history=await page.evaluate('window.__history');assert history['file_size']==len(actual) and history['filters']['snapshot']['summary']['total']==12.34
            assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
            assert not errors,errors
            await page.get_by_role('button',name='Download',exact=True).screenshot(path=str(OUT/f'{width}-download.png'))
            print(json.dumps({'viewport':[width,height],'actual_builder_original_pdf_history_download':'PASS','sha256':hashlib.sha256(actual).hexdigest(),'bytes':len(actual),'original_page_preserved':True,'lost_response_readback':'PASS','runtime_errors':errors,'storage':'local mocked adapter; NOT hosted'}))
            await context.close()
        await browser.close()
asyncio.run(main())