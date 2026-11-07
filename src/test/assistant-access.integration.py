"""Signed-in regression: role privacy, department budget reads and assistant guide."""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
        if cookies:
            await context.add_cookies([{**c, "url": "http://localhost:8080"} for c in cookies])
        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"], os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]])
        await page.goto("http://localhost:8080/assistants")
        await page.get_by_role("heading", name="Connect ChatGPT", exact=True).wait_for()
        result = await page.evaluate('''async () => {
          const {supabase:s} = await import('/src/integrations/supabase/client.ts');
          const u = await s.auth.getUser();
          if(u.error || !u.data.user) throw Error('A signed-in user is required');
          const uid = u.data.user.id;
          const roles = await s.from('user_roles').select('user_id,role');
          const profile = await s.from('profiles').select('department').eq('id',uid).single();
          const budgets = await s.from('department_budgets').select('department,amount');
          if(roles.error || profile.error || budgets.error) throw Error('Permission read failed');
          const finance = roles.data.some(r=>r.role==='finance');
          const foreignRoles = await s.from('user_roles').select('user_id').neq('user_id',uid);
          if(foreignRoles.error) throw Error('Foreign-role query failed');
          return {
            selfRolesOnly: roles.data.every(r=>r.user_id===uid),
            foreignRolesHidden: foreignRoles.data.length===0,
            budgetsScoped: budgets.data.every(r=>finance || r.department===profile.data.department)
          };
        }''')
        assert result["selfRolesOnly"], "Other users' roles were exposed"
        assert result["foreignRolesHidden"], "Foreign-role query exposed records"
        assert result["budgetsScoped"], "Unrelated departments' budgets were exposed"
        await context.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:8080")
        await page.get_by_role("button", name="Copy MCP endpoint").click()
        copied = await page.evaluate("navigator.clipboard.readText()")
        assert copied == "https://ledgerline.biz/mcp"
        out = Path("/tmp/browser/assistant-setup")
        out.mkdir(parents=True, exist_ok=True)
        await page.locator('section[aria-labelledby="chatgpt-setup"]').screenshot(path=str(out / "guide.png"))
        print("PASS: self-only roles, scoped budgets, signed-in guide and endpoint copying")
        await browser.close()


asyncio.run(main())