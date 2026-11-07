"""Owner-authenticated category undo, splits, idempotency and conflict regression."""
import asyncio, json, os
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width":1280,"height":1800})
        page = await context.new_page()
        cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
        if cookies: await context.add_cookies([{**c,"url":"http://localhost:8080"} for c in cookies])
        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"],os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]])
        await page.goto("http://localhost:8080/expenses")
        await page.get_by_role("button",name="Select entries",exact=True).wait_for()
        result = await page.evaluate('''async()=>{
          const {supabase:s}=await import('/src/integrations/supabase/client.ts');
          const uid=(await s.auth.getUser()).data.user.id;
          const cats=(await s.from('finance_preferences').select('data').eq('owner_id',uid).single()).data.data.categories.filter(c=>!c.archived).map(c=>c.name);
          const id=crypto.randomUUID(), batch=crypto.randomUUID(), conflict=crypto.randomUUID();
          const allocations=[{category:cats[0],amount:60},{category:cats[1],amount:40}];
          try {
            const ins=await s.from('expenses').insert({id,employee_id:uid,department:'',title:'Bulk regression',category:cats[0],amount:100,original_amount:100,currency:'INR',expense_date:'2026-10-31',status:'pending_manager',scope:'personal',payment_method:'upi',allocations});
            if(ins.error)throw Error(ins.error.message);
            const read=async()=>{const r=await s.from('expenses').select('*').eq('id',id).single();if(r.error)throw Error(r.error.message);return r.data;};
            let row=await read();
            const args={batch_id:batch,items:[{id,revision:row.category_revision}],target:cats[1]};
            const first=await s.rpc('bulk_category_change',args); if(first.error)throw Error(first.error.message);
            const replay=await s.rpc('bulk_category_change',args);row=await read();
            const changed=row.category===cats[1]&&row.allocations.length===0;
            const undo=await s.rpc('undo_category_change',{batch_id:batch});if(undo.error)throw Error(undo.error.message);
            const undoReplay=await s.rpc('undo_category_change',{batch_id:batch});row=await read();
            const restored=row.category===cats[0]&&row.allocations.length===2&&row.allocations.every((a,i)=>a.category===allocations[i].category&&a.amount===allocations[i].amount);
            const next=await s.rpc('bulk_category_change',{batch_id:conflict,items:[{id,revision:row.category_revision}],target:cats[1]});if(next.error)throw Error(next.error.message);
            await s.from('expenses').update({category:cats[0]}).eq('id',id);
            await s.from('expenses').update({category:cats[1]}).eq('id',id);
            const blocked=await s.rpc('undo_category_change',{batch_id:conflict});
            const stale=await s.rpc('bulk_category_change',{batch_id:crypto.randomUUID(),items:[{id,revision:0}],target:cats[0]});
            const history=await s.from('category_batches').select('*').in('id',[batch,conflict]);
            return {changed,restored,replay:!replay.error,undoReplay:!undoReplay.error,conflict:!!blocked.error,stale:!!stale.error,history:history.data.length===2};
          } finally {await s.from('expenses').delete().eq('id',id);}
        }''')
        assert all(result.values()), result
        print("PASS: atomic bulk change, split restoration, retries, later-edit conflicts and persistent owner history")
        await browser.close()

asyncio.run(main())