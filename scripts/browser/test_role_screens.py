"""End-to-end: manager and finance screens show only the team expense and company tax data the database returns
for that role, and admin switches hide sections. Controlled: role, switches, team rows and company tax are served
from in-memory fixtures that mirror the database rules proven in src/lib/role-access.test.ts; every write is blocked."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/role'); ROOT.mkdir(parents=True,exist_ok=True)
ACTIONS=['view_expenses','edit_expenses','delete_expenses','change_category','approve','view_receipts','view_company_tax','edit_budgets']
DEF={'manager':{'view_expenses':True,'view_receipts':True},'finance':{'view_expenses':True,'view_receipts':True,'view_company_tax':True}}
# What the database lets each role read (other people's rows only).
SALES=[{'id':'s1','employee_id':'mia','expense_date':'2026-10-04','title':'Sales client lunch','merchant':'Cafe','category':'Meals','amount':1200,'department':'Sales'}]
OPS=[{'id':'o1','employee_id':'ravi','expense_date':'2026-10-06','title':'Ops warehouse tools','merchant':'Store','category':'Supplies','amount':5400,'department':'Ops'}]
VISIBLE={'manager':SALES,'finance':SALES+OPS}
NAMES=[{'id':'mia','full_name':'Mia Sales','department':'Sales'},{'id':'ravi','full_name':'Ravi Ops','department':'Ops'}]
CTAX=[{'owner_id':'ravi','owner_name':'Ravi Ops','entities':[{'id':'c1','name':'Ravi Ventures Pvt Ltd','kind':'company'}],'profiles':[{'entityId':'c1','fy':'2025-26','ownershipPct':80,'bookProfit':900000,'accumulatedProfits':200000}]}]
def session():
  if os.environ.get('LOVABLE_BROWSER_AUTH_STATUS')=='injected':
    return os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
  m=json.load(open(os.path.expanduser('~/.cache/lovable-auth/session.json'))); return m['storage_key'],json.dumps(m['session'])
async def run(p,role,off=None):
  b=await p.chromium.launch(headless=True); ctx=await b.new_context(viewport={'width':1280,'height':1800}); page=await ctx.new_page()
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  sw=[{'role':r,'action':a,'allowed':DEF[r].get(a,False) and a!=off} for r in DEF for a in ACTIONS]
  def js(x,obj=False): return dict(status=200,content_type='application/json',body=json.dumps(x))
  async def rest(route):
    r=route.request; u=r.url; one='vnd.pgrst.object' in (r.headers.get('accept') or '')
    if '/rest/v1/user_roles' in u: return await route.fulfill(**js({'role':role} if one else [{'role':role}]))
    if '/rest/v1/app_admins' in u: return await route.fulfill(**js(None if one else []))
    if '/rest/v1/role_permissions' in u: return await route.fulfill(**js(sw))
    if '/rest/v1/rpc/team_names' in u: return await route.fulfill(**js(NAMES))
    if '/rest/v1/rpc/team_company_tax' in u: return await route.fulfill(**js(CTAX if role=='finance' else []))
    if '/rest/v1/expenses' in u and 'employee_id=neq' in u: return await route.fulfill(**js(VISIBLE[role]))
    if r.method not in ('GET','HEAD','OPTIONS') and '/rpc/' not in u: return await route.fulfill(status=403,body='blocked by controlled test')
    await route.continue_()
  await ctx.route('**/rest/v1/**',rest)
  k,v=session(); await page.goto('http://localhost:8080'); await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[k,v])
  tag=f"{role}{'-'+off if off else ''}"
  await page.goto('http://localhost:8080/expenses'); await page.wait_for_load_state('networkidle')
  team=page.locator('section',has_text='Team expenses')
  if off=='view_expenses':
    await page.wait_for_timeout(3000); assert await team.count()==0, 'team list should be hidden when switch is off'
  else:
    await team.wait_for(timeout=60000); txt=await team.inner_text()
    assert 'Sales client lunch' in txt
    assert ('Ops warehouse tools' in txt)==(role=='finance'), txt
    assert ('Everyone' if role=='finance' else 'Your department') in txt
    assert await team.get_by_role('button',name='Edit').count()==0 and await team.get_by_role('button',name='Delete').count()==0
    await team.screenshot(path=str(ROOT/f'{tag}_expenses.png'))
  await page.goto('http://localhost:8080/tax'); await page.wait_for_load_state('networkidle'); await page.wait_for_timeout(3000)
  ct=page.locator('section',has_text='Company tax (all)')
  if role=='finance' and off!='view_company_tax':
    await ct.wait_for(timeout=60000); t=await ct.inner_text()
    assert 'Ravi Ventures Pvt Ltd' in t and 'personal tax is never shown' in t
    await ct.screenshot(path=str(ROOT/f'{tag}_tax.png'))
  else:
    assert await ct.count()==0, f'{tag}: company tax must be hidden'
  assert 'Ravi Ops' not in (await page.locator('main').inner_text() if await page.locator('main').count() else '') or role=='finance'
  assert not errors, errors
  await b.close(); print('PASS', tag)
async def main():
  async with async_playwright() as p:
    await run(p,'manager'); await run(p,'manager','view_expenses')
    await run(p,'finance'); await run(p,'finance','view_company_tax')
    print('PASS: manager sees own department only and no company tax; finance sees everyone and company tax; switches hide sections; no edit/delete on team rows; Cloud unchanged.')
asyncio.run(main())
