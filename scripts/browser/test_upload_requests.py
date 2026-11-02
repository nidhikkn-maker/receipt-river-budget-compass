#!/usr/bin/env python3
"""Real statement-upload-request page tests with isolated, controlled browser data.

Run: python3 scripts/browser/test_upload_requests.py
Requires the existing Vite server at localhost:8080 and Python Playwright.
No sign-in, real records, Cloud requests, or production writes.
Evidence is written to /tmp/browser/upload-requests-tests/.
"""
import unittest
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
EVIDENCE = Path("/tmp/browser/upload-requests-tests")
HTML = """<!doctype html><html><head><meta charset="utf-8">
<script>window.__oj_refresh_installed__ = true; window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;</script></head>
<body><div id="root"></div><script type="module" src="/scripts/browser/upload-requests.fixture.tsx"></script></body></html>"""
MOCKS = {
    "/src/lib/accountant.functions.ts": ["getUploadRequests"],
    "/src/components/AppShell.tsx": ["PageTitle"],
}


class UploadRequestsPage(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.context = await self.browser.new_context(viewport={"width": 1280, "height": 1800})
        self.page = await self.context.new_page()
        self.errors, self.blocked = [], []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

        async def isolate(route):
            request = route.request
            parsed = urlparse(request.url)
            if parsed.netloc != "localhost:8080" or request.method not in ("GET", "HEAD"):
                self.blocked.append("unexpected external traffic/write")
                await route.abort()
            elif request.is_navigation_request() and parsed.path == "/upload-requests":
                await route.fulfill(status=200, content_type="text/html", body=HTML)
            elif parsed.path in MOCKS:
                await route.fulfill(status=200, content_type="application/javascript",
                                    body=f'export {{ {", ".join(MOCKS[parsed.path])} }} from "/scripts/browser/upload-requests-mocks.tsx";')
            else:
                await route.continue_()

        await self.context.route("**/*", isolate)
        await self.page.goto(BASE + "/upload-requests", wait_until="domcontentloaded")
        try:
            await expect(self.page.get_by_text("7 requests · 2 open · 1 file waiting in Statement Desk")).to_be_visible(timeout=15000)
        except Exception:
            print("Setup errors:", self.errors, "blocked:", self.blocked)
            await self.browser.close()
            await self.playwright.stop()
            raise

    async def asyncTearDown(self):
        try:
            await self.page.screenshot(path=str(EVIDENCE / f"{self._testMethodName}.png"))
            self.assertEqual(self.errors, [], "Browser runtime errors")
            self.assertEqual(self.blocked, [], "Unexpected external traffic or write")
        finally:
            await self.browser.close()
            await self.playwright.stop()

    async def test_used_request_shows_email_opens_files_and_confirmation(self):
        card = self.page.get_by_text("November 2026", exact=True).locator("xpath=ancestor::li[1]")
        await expect(card).to_contain_text("Open")
        await expect(card).to_contain_text("Link emailed 1 Nov 2026 to durai@example.com")
        await expect(card).to_contain_text("Files 2 of 50 — AMEX-Nov.pdf, HDFC-Nov.pdf · 1 waiting")
        await expect(card).to_contain_text("No reminder needed — files arrived")
        await expect(card).to_contain_text("nidhi.kkn@gmail.com")

    async def test_reminder_owed_and_reminder_sent_are_kept_apart(self):
        cards = self.page.get_by_role("listitem")
        await expect(cards.filter(has_text="November 2026").filter(has_text="Reminder owed")).to_have_count(1)
        await expect(cards.filter(has_text="October 2026")).to_contain_text("Reminder sent")
        await expect(cards.filter(has_text="October 2026")).to_contain_text("Expired")
        await expect(cards.filter(has_text="October 2026")).to_contain_text("Nothing to confirm yet")

    async def test_turned_off_request_shows_no_further_action(self):
        card = self.page.get_by_role("listitem").filter(has_text="September 2026")
        await expect(card).to_contain_text("Turned off")
        await expect(card).to_contain_text("No reminder")
        await expect(card).to_contain_text("no longer usable")

    async def test_long_history_is_folded_then_opened(self):
        await expect(self.page.get_by_text("June 2026", exact=True)).to_have_count(0)
        await self.page.get_by_role("button", name="Show all 7").click()
        await expect(self.page.get_by_text("June 2026", exact=True)).to_be_visible()
        await self.page.get_by_role("button", name="Show fewer").click()
        await expect(self.page.get_by_text("June 2026", exact=True)).to_have_count(0)


if __name__ == "__main__":
    unittest.main()
