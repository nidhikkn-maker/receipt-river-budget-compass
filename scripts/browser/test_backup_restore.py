"""Real Settings/Drafts routes, isolated records/storage, all external writes blocked.
Exercises owner-only backup, restored photos, cancellation, retry and atomic failure cleanup.
Does not certify production Cloud persistence or alter real financial records.
"""
import asyncio, base64, copy, io, json, os, zipfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from playwright.async_api import async_playwright

ROOT = Path('/tmp/browser/backup-restore')
ROOT.mkdir(parents=True, exist_ok=True)
TABLES = ['finance_preferences', 'family_members', 'accounts', 'category_budgets', 'expenses', 'expense_drafts', 'commitments', 'loans', 'goals', 'asset_valuations', 'documents']
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')

async def main():
    if os.environ.get('LOVABLE_BROWSER_AUTH_STATUS') == 'injected':
        key = os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY']
        value = os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
    else:
        minted = json.load(open(os.path.expanduser('~/.cache/lovable-auth/session.json')))
        key, value = minted['storage_key'], json.dumps(minted['session'])
    owner = json.loads(value)['user']['id']
    account, draft = '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
    path = f'{owner}/drafts/{draft}/photo.png'
    now = '2026-11-06T01:00:00Z'
    rows = {t: [] for t in TABLES}
    rows['finance_preferences'] = [{'owner_id': owner, 'data': {}, 'updated_at': now}]
    rows['accounts'] = [{'id': account, 'owner_id': owner, 'name': 'Recovery fixture bank', 'kind': 'bank', 'currency': 'INR', 'opening_balance': 0, 'opening_date': '2026-11-01', 'created_at': now, 'details': {}}]
    rows['expense_drafts'] = [{'id': draft, 'owner_id': owner, 'status': 'ready', 'transaction_id': None, 'data': {'merchant': 'Recovery fixture receipt', 'amount': '120', 'currency': 'INR', 'category': 'Food', 'accountId': account}, 'receipts': [{'path': path, 'name': 'photo.png', 'type': 'image/png'}], 'created_at': now, 'updated_at': now}]
    team = {'id': '33333333-3333-4333-8333-333333333333', 'employee_id': '44444444-4444-4444-8444-444444444444', 'title': 'Foreign team expense', 'receipts': []}
    files = {path: PNG}
    state = {'commits': 0, 'fail': False, 'staged': [], 'cleaned': [], 'blocked': []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 1800}, accept_downloads=True)
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        async def guard(route):
            r = route.request
            if urlparse(r.url).hostname not in ('localhost', '127.0.0.1') and r.method not in ('GET', 'HEAD', 'OPTIONS'):
                state['blocked'].append(urlparse(r.url).path)
                return await route.fulfill(status=403, body='Isolated test: external writes blocked')
            await route.continue_()
        async def rest(route):
            r = route.request
            u = urlparse(r.url); query = parse_qs(u.query)
            table = u.path.split('/rest/v1/')[1]
            obj = 'vnd.pgrst.object' in r.headers.get('accept', '')
            def response(data, status=200):
                return dict(status=status, content_type='application/json', body=json.dumps(data))
            if table == 'rpc/restore_finance_backup':
                state['commits'] += 1
                if state['fail']:
                    return await route.fulfill(**response({'message': 'Controlled atomic restore failure', 'code': 'P0001'}, 400))
                payload = r.post_data_json['payload']
                for t in TABLES: rows[t] = copy.deepcopy(payload.get(t, []))
                return await route.fulfill(**response({'counts': {t: len(rows[t]) for t in TABLES}}))
            if r.method not in ('GET', 'HEAD', 'OPTIONS'):
                if table.startswith('rpc/'):
                    return await route.fulfill(**response([]))
                return await route.fulfill(status=403, body='Isolated test: unexpected record write')
            data = copy.deepcopy(rows.get(table, []))
            if table == 'expenses' and query.get('employee_id') != [f'eq.{owner}']: data.append(team)
            if table == 'profiles': data = [{'id': owner, 'full_name': 'Recovery test'}]
            if table == 'user_roles': data = [{'role': 'employee'}]
            return await route.fulfill(**response((data[0] if data else None) if obj else data))
        async def storage(route):
            r = route.request; u = urlparse(r.url)
            if '/object/sign/receipts/' in u.path:
                target = unquote(u.path.split('/object/sign/receipts/')[1])
                return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'signedURL': '/object/receipts/'+target}))
            if '/object/receipts/' in u.path:
                target = unquote(u.path.split('/object/receipts/')[1])
                if r.method == 'GET':
                    return await route.fulfill(status=200 if target in files else 404, content_type='image/png', body=files.get(target, b''))
                if r.method in ('POST', 'PUT'):
                    assert target.startswith(owner+'/restored/') and target not in files
                    files[target] = r.post_data_buffer
                    state['staged'].append(target)
                    return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'Key': 'receipts/'+target}))
            if r.method == 'DELETE':
                for target in r.post_data_json['prefixes']:
                    state['cleaned'].append(target); files.pop(target, None)
                return await route.fulfill(status=200, content_type='application/json', body='[]')
            return await route.fulfill(status=403, body='Isolated test: unexpected storage request')
        await ctx.route('**/*', guard)
        await ctx.route('**/rest/v1/**', rest)
        await ctx.route('**/storage/v1/**', storage)
        await page.goto('http://localhost:8080')
        await page.evaluate('([k,v])=>localStorage.setItem(k,v)', [key, value])
        await page.goto('http://localhost:8080/settings#data')
        button = page.get_by_role('button', name='Download backup', exact=True)
        await button.wait_for(timeout=60000)
        async with page.expect_download() as download: await button.click()
        archive = ROOT/'backup.zip'
        await (await download.value).save_as(archive)
        with zipfile.ZipFile(archive) as z:
            saved = json.loads(z.read('backup.json'))
            assert saved['data']['expenses'] == [], 'Backup leaked a team expense instead of exporting only owner rows'
            assert saved['data']['expense_drafts'][0]['data']['amount'] == '120'
            assert z.read('files/'+path) == PNG
        await page.locator('#data').screenshot(path=str(ROOT/'1_download.png'))
        async def choose(confirm=True):
            await page.get_by_label('Backup file', exact=True).set_input_files(archive)
            dialog = page.get_by_role('alertdialog')
            await dialog.wait_for()
            await dialog.get_by_role('button', name='Continue' if confirm else 'Cancel', exact=True).click()
        await choose(False)
        await page.wait_for_timeout(300)
        assert state['commits'] == 0 and not state['staged'], 'Cancel must not stage files or commit'
        rows['expense_drafts'] = []
        await choose()
        await page.get_by_text('Restored 3 records', exact=True).wait_for(timeout=60000)
        restored = rows['expense_drafts'][0]
        new_path = restored['receipts'][0]['path']
        assert restored['id'] == draft and restored['data']['accountId'] == account
        assert new_path != path and files[new_path] == PNG and files[path] == PNG
        await page.goto('http://localhost:8080/drafts')
        await page.get_by_text('Recovery fixture receipt', exact=True).wait_for(timeout=60000)
        await page.reload()
        await page.get_by_text('Recovery fixture receipt', exact=True).wait_for(timeout=60000)
        await page.locator('li', has_text='Recovery fixture receipt').screenshot(path=str(ROOT/'2_recovered_draft.png'))
        assert await page.locator('li', has_text='Recovery fixture receipt').count() == 1
        before = copy.deepcopy(rows)
        state['fail'] = True
        await page.goto('http://localhost:8080/settings#data')
        await button.wait_for(timeout=60000)
        await choose()
        await page.get_by_text('Restore stopped; your existing records are unchanged. Check the backup and try again.', exact=True).wait_for()
        await page.wait_for_function('()=>!document.querySelector("#data button")?.disabled')
        assert rows == before and state['cleaned'] == [state['staged'][-1]]
        assert files[path] == PNG and files[new_path] == PNG
        state['fail'] = False
        await choose()
        await page.get_by_text('Restored 3 records', exact=True).wait_for()
        assert len(rows['expense_drafts']) == 1 and rows['expense_drafts'][0]['id'] == draft
        assert not errors, errors
        assert not state['blocked'], 'Unexpected external writes attempted'
        print('PASS: owner-only ZIP includes draft/photo; cancel writes nothing; restored draft survives reload; atomic failure cleans only staged photo; retry keeps one draft. Controlled records only, Cloud unchanged.')
        await browser.close()

asyncio.run(main())