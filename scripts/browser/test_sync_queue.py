#!/usr/bin/env python3
"""Exercise the real Waiting to sync page buttons with an isolated store.
Run python3 scripts/browser/test_sync_queue.py with Vite at localhost:8080.
No Cloud access; controlled browser-only state is not Cloud acceptance.
"""
import unittest
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
OUTPUT = Path("/tmp/browser/sync-queue-tests")
HTML = """<!doctype html><html><head><meta charset="utf-8">
<script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head>
<body><div id="root"></div><script type="module" src="/scripts/browser/sync-queue.fixture.tsx"></script></body></html>"""
MOCKS = {
    "/src/lib/store.tsx": ["useStore"],
    "/src/components/AppShell.tsx": ["PageTitle"],
}


class SyncQueueDiscardWarning(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        OUTPUT.mkdir(parents=True, exist_ok=True)
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.context = await self.browser.new_context(viewport={"width": 402, "height": 874})
        self.page = await self.context.new_page()
        self.errors, self.blocked = [], []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

        async def isolate(route):
            req = route.request
            parsed = urlparse(req.url)
            if parsed.netloc != "localhost:8080" or req.method not in ("GET", "HEAD"):
                self.blocked.append("unexpected external traffic/write")
                await route.abort()
            elif req.is_navigation_request() and parsed.path == "/sync-queue":
                await route.fulfill(status=200, content_type="text/html", body=HTML)
            elif parsed.path in MOCKS:
                await route.fulfill(status=200, content_type="application/javascript", body=f'export {{ {", ".join(MOCKS[parsed.path])} }} from "/scripts/browser/sync-queue-mocks.tsx";')
            else:
                await route.continue_()
        await self.context.route("**/*", isolate)
        await self.page.goto(BASE + "/sync-queue", wait_until="domcontentloaded")
        try:
            await expect(self.page.get_by_text("Controlled cafe")).to_be_visible(timeout=15000)
        except Exception:
            print("Setup errors:", self.errors, "blocked:", self.blocked)
            await self.browser.close()
            await self.playwright.stop()
            raise
        self.dialog = self.page.get_by_role("alertdialog")

    async def asyncTearDown(self):
        try:
            await self.page.screenshot(path=str(OUTPUT / f"{self._testMethodName}.png"))
        finally:
            await self.browser.close()
            await self.playwright.stop()

    async def open_remove_dialog(self, payee: str):
        await self.page.get_by_role("button", name=f"Actions for {payee}").click()
        await self.page.get_by_role("menuitem", name="Remove from this device").click()
        await expect(self.dialog).to_be_visible()

    async def test_warning_explains_device_only_removal_and_blocks_until_acknowledged(self):
        await self.open_remove_dialog("Controlled cafe")
        await expect(self.dialog.get_by_text("This entry has never reached your account", exact=False)).to_be_visible()
        await expect(self.dialog.get_by_text("cannot be recovered", exact=False)).to_be_visible()
        await expect(self.dialog.get_by_text("Controlled cafe · 2026-11-01", exact=False)).to_be_visible()
        remove = self.dialog.get_by_role("button", name="Remove from this device")
        await expect(remove).to_be_disabled()
        await remove.click(force=True)
        await expect(self.page.get_by_text("Controlled cafe")).to_be_visible()
        self.assertEqual(await self.page.evaluate("syncQueueBrowserFixture.removed"), [])
        await self.page.screenshot(path=str(OUTPUT / "warning-before-ack.png"))
        await self.dialog.get_by_role("checkbox").click()
        await expect(remove).to_be_enabled()
        await remove.click()
        await expect(self.dialog).not_to_be_visible()
        await expect(self.page.get_by_text("Controlled cafe")).not_to_be_visible()
        self.assertEqual(await self.page.evaluate("syncQueueBrowserFixture.removed"), ["queued-failed"])
        self.assertEqual(await self.page.evaluate("syncQueueBrowserFixture.items.map(i=>i.id)"), ["queued-waiting"])

    async def test_keep_it_leaves_the_entry_on_this_device(self):
        await self.open_remove_dialog("Controlled print shop")
        await expect(self.dialog.get_by_text("If you still need this expense", exact=False)).to_be_visible()
        await self.dialog.get_by_role("button", name="Keep it").click()
        await expect(self.dialog).not_to_be_visible()
        await expect(self.page.get_by_text("Controlled print shop")).to_be_visible()
        self.assertEqual(await self.page.evaluate("syncQueueBrowserFixture.removed"), [])

    async def test_acknowledgement_does_not_carry_over_to_another_entry(self):
        await self.open_remove_dialog("Controlled cafe")
        await self.dialog.get_by_role("checkbox").click()
        await self.dialog.get_by_role("button", name="Keep it").click()
        await self.open_remove_dialog("Controlled print shop")
        await expect(self.dialog.get_by_role("checkbox")).not_to_be_checked()
        await expect(self.dialog.get_by_role("button", name="Remove from this device")).to_be_disabled()

    async def test_page_reports_each_entry_status(self):
        await expect(self.page.get_by_text("Couldn't save")).to_be_visible()
        await expect(self.page.get_by_text("Waiting", exact=True)).to_be_visible()
        await self.page.get_by_role("button", name="Retry all").click()
        self.assertEqual(await self.page.evaluate("syncQueueBrowserFixture.retried"), ["all"])


if __name__ == "__main__":
    unittest.main()
