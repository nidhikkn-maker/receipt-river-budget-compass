#!/usr/bin/env python3
"""Statement Desk upload → review → apply → undo tests with isolated, controlled browser data.

Run: python3 scripts/browser/test_records_check.py
Requires the existing Vite server at localhost:8080 and Python Playwright.
No sign-in, real records, Cloud requests, or production preference writes.
Evidence is written to /tmp/browser/statement-desk-tests/.
"""
import json
import unittest
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
EVIDENCE = Path("/tmp/browser/statement-desk-tests")
HTML = """<!doctype html><html><head><meta charset="utf-8">
<script>window.__oj_refresh_installed__ = true; window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;</script></head>
<body><div id="root"></div><script type="module" src="/scripts/browser/statement-desk.fixture.tsx"></script></body></html>"""


class StatementDeskFlow(unittest.IsolatedAsyncioTestCase):
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
            elif parsed.path == "/statements":
                await route.fulfill(status=200, content_type="text/html", body=HTML)
            elif parsed.path in ("/src/lib/store.tsx", "/src/integrations/supabase/client.ts"):
                name = "useStore" if "store.tsx" in parsed.path else "supabase"
                await route.fulfill(status=200, content_type="application/javascript", body=f'export {{ {name} }} from "/scripts/browser/statement-desk-mocks.tsx";')
            elif request.method not in ("GET", "HEAD"):
                self.blocked.append("unexpected write")
                await route.abort()
            else:
                await route.continue_()

        await self.context.route("**/*", isolate)
        await self.page.goto(BASE + "/statements", wait_until="domcontentloaded")
        await expect(self.page.get_by_role("heading", name="Statement Desk")).to_be_visible()

    async def asyncTearDown(self):
        try:
            await self.page.screenshot(path=str(EVIDENCE / f"{self._testMethodName}.png"))
            self.assertEqual(self.errors, [], "Browser runtime errors")
            self.assertEqual(self.blocked, [], "Unexpected external traffic or write")
        finally:
            await self.browser.close()
            await self.playwright.stop()

    async def test_upload_review_apply_and_undo(self):
        csv = "Date,Description,Debit,Credit\n2026-10-02,SWIGGY ORDER,250.00,\n2026-10-03,AMAZON PURCHASE,480.00,\n"
        await self.page.get_by_label("Statement files").set_input_files(files=[{"name": "controlled.csv", "mimeType": "text/csv", "buffer": csv.encode()}])
        acct = self.page.locator("select").first
        await acct.select_option("desk-account")
        accept = self.page.get_by_role("button", name="Accept all 2 asking items")
        await expect(accept).to_be_visible()
        await accept.click()
        await self.page.get_by_role("button", name="Apply everything (2 to save)").click()
        await expect(self.page.get_by_role("button", name="Undo this upload (2 posted)")).to_be_visible()
        self.assertEqual(len(await self.page.evaluate("deskFixture.saves")), 2)
        self.assertEqual(len(await self.page.evaluate("deskFixture.uploads")), 1)
        await self.page.get_by_label("Recent uploads").get_by_role("button", name="Undo").click()
        await expect(self.page.get_by_label("Recent uploads")).to_have_count(0)
        self.assertEqual(await self.page.evaluate("deskFixture.transactions.length"), 0)
        self.assertEqual(len(await self.page.evaluate("deskFixture.removes")), 2)


if __name__ == "__main__":
    unittest.main()
