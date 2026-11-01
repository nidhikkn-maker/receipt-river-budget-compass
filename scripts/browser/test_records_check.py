#!/usr/bin/env python3
"""Real records-check button tests with isolated, controlled browser data.

Run: python3 scripts/browser/test_records_check.py
Requires the existing Vite server at localhost:8080 and Python Playwright.
No sign-in, real records, Cloud requests, or production preference writes.
Evidence is written to /tmp/browser/records-check-tests/.
"""
import json
import unittest
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
EVIDENCE = Path("/tmp/browser/records-check-tests")
HTML = """<!doctype html><html><head><meta charset="utf-8">
<script>window.__oj_refresh_installed__ = true; window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;</script></head>
<body><div id="root"></div><script type="module" src="/scripts/browser/records-check.fixture.tsx"></script></body></html>"""


class RecordsCheckButtons(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.context = await self.browser.new_context(viewport={"width": 1280, "height": 1800})
        self.page = await self.context.new_page()
        self.errors = []
        self.blocked = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

        async def isolate(route):
            request = route.request
            parsed = urlparse(request.url)
            if parsed.netloc != "localhost:8080":
                self.blocked.append(parsed.hostname)
                await route.abort()
            elif parsed.path == "/records-check":
                await route.fulfill(status=200, content_type="text/html", body=HTML)
            elif parsed.path in ("/src/lib/store.tsx", "/src/integrations/supabase/client.ts"):
                name = "useStore" if "store.tsx" in parsed.path else "supabase"
                await route.fulfill(status=200, content_type="application/javascript", body=f'export {{ {name} }} from "/scripts/browser/records-check-mocks.tsx";')
            elif request.method not in ("GET", "HEAD"):
                self.blocked.append("unexpected write")
                await route.abort()
            else:
                await route.continue_()

        await self.context.route("**/*", isolate)
        await self.page.goto(BASE + "/records-check", wait_until="domcontentloaded")
        await expect(self.page.get_by_role("button", name="Open 3", exact=True)).to_be_visible()
        self.original = await self.page.evaluate("JSON.stringify([recordsCheckFixture.accounts, recordsCheckFixture.transactions, recordsCheckFixture.statements])")

    async def asyncTearDown(self):
        try:
            await self.page.screenshot(path=str(EVIDENCE / f"{self._testMethodName}.png"))
            if hasattr(self, "original"):
                self.assertEqual(await self.page.evaluate("JSON.stringify([recordsCheckFixture.accounts, recordsCheckFixture.transactions, recordsCheckFixture.statements])"), self.original)
            self.assertEqual(self.errors, [], "Browser runtime errors")
            self.assertEqual(self.blocked, [], "Unexpected external traffic or write")
        finally:
            await self.browser.close()
            await self.playwright.stop()

    def select(self, reference):
        return self.page.get_by_role("checkbox", name=f"Select {reference}", exact=True)

    async def checked_keys(self):
        return await self.page.evaluate("recordsCheckFixture.checked")

    async def test_multiple_selection_mark_and_undo_preserves_prior_checked(self):
        await self.select("BROWSER-4").check()
        await self.select("BROWSER-3").check()
        await self.page.get_by_role("button", name="Mark as checked", exact=True).click()
        await expect(self.page.get_by_role("button", name="Open 1", exact=True)).to_be_visible()
        await expect(self.select("BROWSER-4")).to_have_count(0)
        await expect(self.select("BROWSER-3")).to_have_count(0)
        await self.page.get_by_role("button", name="Checked 3", exact=True).click()
        for ref in ("BROWSER-1", "BROWSER-3", "BROWSER-4"):
            await expect(self.select(ref)).to_be_visible()
        await self.page.get_by_role("button", name="Undo", exact=True).click()
        await expect(self.page.get_by_role("button", name="Checked 1", exact=True)).to_be_visible()
        self.assertEqual(await self.checked_keys(), ["ml-browser-statement-BROWSER-1-2026-04-01-100"])
        await self.page.get_by_role("button", name="Open 3", exact=True).click()
        for ref in ("BROWSER-2", "BROWSER-3", "BROWSER-4"):
            await expect(self.select(ref)).to_be_visible()
            await expect(self.select(ref)).not_to_be_checked()

    async def test_select_visible_twice_clear_and_bulk_restore(self):
        await self.select("BROWSER-4").check()
        for _ in range(2):
            await self.page.get_by_role("button", name="Select visible", exact=True).click()
        await expect(self.page.get_by_role("checkbox", checked=True)).to_have_count(3)
        await self.page.get_by_role("button", name="Clear", exact=True).click()
        await expect(self.page.get_by_role("checkbox", checked=True)).to_have_count(0)
        await expect(self.page.get_by_role("button", name="Mark as checked", exact=True)).to_have_count(0)
        await self.page.get_by_role("button", name="Select visible", exact=True).click()
        await self.page.get_by_role("button", name="Mark as checked", exact=True).click()
        await expect(self.page.get_by_role("button", name="Open 0", exact=True)).to_be_visible()
        self.assertEqual(len(set(await self.checked_keys())), 4)
        await self.page.get_by_role("button", name="Undo", exact=True).click()
        await expect(self.page.get_by_role("button", name="Open 3", exact=True)).to_be_visible()
        self.assertEqual(len(await self.checked_keys()), 1)

    async def test_single_row_checked_and_undo(self):
        row = self.page.get_by_role("listitem").filter(has=self.select("BROWSER-2"))
        await row.get_by_role("button", name="Checked", exact=True).click()
        await expect(self.page.get_by_role("button", name="Open 2", exact=True)).to_be_visible()
        await expect(self.select("BROWSER-2")).to_have_count(0)
        await self.page.get_by_role("button", name="Undo", exact=True).click()
        await expect(self.page.get_by_role("button", name="Open 3", exact=True)).to_be_visible()
        await expect(self.select("BROWSER-2")).to_be_visible()

    async def test_failed_save_keeps_selection_and_records_open(self):
        await self.select("BROWSER-4").check()
        await self.select("BROWSER-3").check()
        await self.page.evaluate("recordsCheckFixture.failNextSave = true")
        await self.page.get_by_role("button", name="Mark as checked", exact=True).click()
        await expect(self.page.get_by_text("Couldn’t save. Nothing changed — try again.", exact=True)).to_be_visible()
        await expect(self.page.get_by_role("button", name="Open 3", exact=True)).to_be_visible()
        await expect(self.page.get_by_role("checkbox", checked=True)).to_have_count(2)
        self.assertEqual(await self.page.evaluate("recordsCheckFixture.saves"), [])
        await self.page.get_by_role("button", name="Mark as checked", exact=True).click()
        await expect(self.page.get_by_role("button", name="Open 1", exact=True)).to_be_visible()
        await self.page.get_by_role("button", name="Undo", exact=True).click()
        await expect(self.page.get_by_role("button", name="Open 3", exact=True)).to_be_visible()


if __name__ == "__main__":
    unittest.main(verbosity=2)