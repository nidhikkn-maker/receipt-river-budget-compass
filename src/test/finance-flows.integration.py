"""Authenticated browser/database regression checks. Run with python3.

Uses the managed requesting-user session, creates isolated records, and removes
only those records in finally. No credentials or user records are printed.
"""
import asyncio
import json
import os
from urllib.parse import urlencode
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
            raise RuntimeError("An authenticated managed browser session is required")
        cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
        if cookies:
            await context.add_cookies([{**cookie, "url": "http://localhost:8080"} for cookie in cookies])
        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v]) => localStorage.setItem(k,v)", [
            os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"],
            os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"],
        ])
        await page.goto("http://localhost:8080/strategy")
        await page.get_by_role("tab", name="Simulator", exact=True).wait_for()
        title = "Finance regression " + os.urandom(8).hex()
        fixture = None
        try:
            await page.goto("http://localhost:8080/new?" + urlencode({"title": title, "amount": 123.45, "currency": "INR", "date": "2026-10-31"}))
            await page.get_by_role("button", name="Save expense", exact=True).click()
            await page.wait_for_url("**/expenses", timeout=30000)
            fixture = await page.evaluate("""async(title) => {
              const {supabase:s} = await import('/src/integrations/supabase/client.ts');
              const {data:e,error} = await s.from('expenses').select('id').eq('title',title).single();
              if(error) throw Error(error.message);
              const {data:a,error:ae} = await s.from('accounts').insert({owner_id:(await s.auth.getUser()).data.user.id,name:title,kind:'cash',opening_balance:0}).select('id').single();
              if(ae) throw Error(ae.message);
              return {expense:e.id,account:a.id};
            }""", title)
            result = await page.evaluate("""async(f) => {
              const {supabase:s} = await import('/src/integrations/supabase/client.ts');
              const update=await s.from('expenses').update({reimbursement_status:'pending',reimbursement:{stage:'submitted',reimbursable:100}}).eq('id',f.expense);
              if(update.error) throw Error(update.error.message);
              const payload={id:f.expense,amount:40,date:'2026-10-31',accountId:f.account,operationId:crypto.randomUUID()};
              const first=await s.rpc('finance_operation',{action:'claim_receipt',payload});
              if(first.error) throw Error(first.error.message);
              const replay=await s.rpc('finance_operation',{action:'claim_receipt',payload});
              const race=await Promise.all([1,2].map(()=>s.rpc('finance_operation',{action:'claim_receipt',payload:{...payload,amount:40,operationId:crypto.randomUUID()}})));
              const before=(await s.from('expenses').select('reimbursement').eq('id',f.expense).single()).data;
              const invalidBatch=await s.rpc('finance_operation',{action:'reimbursement',payload:{ids:[f.expense,crypto.randomUUID()],accountId:f.account,date:'2026-10-31',operationId:crypto.randomUUID()}});
              const after=(await s.from('expenses').select('reimbursement').eq('id',f.expense).single()).data;
              const badSplit=await s.from('expenses').update({allocations:[{category:'Groceries',amount:100},{category:'Shopping',amount:1}]}).eq('id',f.expense);
              const goodSplit=await s.from('expenses').update({allocations:[{category:'Groceries',amount:100},{category:'Shopping',amount:23.45}]}).eq('id',f.expense);
              const receiptCount=after.reimbursement.receipts.length;
              const full=await s.rpc('finance_operation',{action:'reimbursement',payload:{ids:[f.expense],accountId:f.account,date:'2026-10-31',operationId:crypto.randomUUID()}});
              if(full.error) throw Error(full.error.message);
              const done=(await s.from('expenses').select('reimbursement,reimbursement_status,allocations').eq('id',f.expense).single()).data;
              const ledger=(await s.from('expenses').select('amount').eq('account_id',f.account)).data;
              return {replay:replay.data?.replayed,raceAccepted:race.filter(r=>!r.error).length,receiptCount,rollback:!!invalidBatch.error&&JSON.stringify(before)===JSON.stringify(after),badSplitRejected:!!badSplit.error,goodSplitAccepted:!goodSplit.error,status:done.reimbursement_status,total:ledger.reduce((sum,e)=>sum+Number(e.amount),0)};
            }""", fixture)
            assert result == {"replay": True, "raceAccepted": 1, "receiptCount": 2, "rollback": True, "badSplitRejected": True, "goodSplitAccepted": True, "status": "received", "total": 100}, result
            await page.reload()
            await page.get_by_text(title, exact=True).click()
            await page.get_by_text("Reimbursement claim details", exact=True).click()
            await page.get_by_text("Fully received", exact=True).wait_for()
            assert "₹100.00" in await page.get_by_role("dialog").inner_text()
            print("PASS: receipt replay, concurrent receipts, batch rollback, split totals, exact remaining settlement, and UI readback")
        finally:
            await page.evaluate("""async({f,title})=>{
              const {supabase:s}=await import('/src/integrations/supabase/client.ts');
              if(f){const r=await s.from('expenses').delete().eq('account_id',f.account);if(r.error)throw Error(r.error.message);}
              const r=await s.from('expenses').delete().eq('title',title);if(r.error)throw Error(r.error.message);
              if(f){const a=await s.from('accounts').delete().eq('id',f.account);if(a.error)throw Error(a.error.message);}
            }""", {"f": fixture, "title": title})
            await browser.close()


asyncio.run(main())