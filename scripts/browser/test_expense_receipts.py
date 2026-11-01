#!/usr/bin/env python3
"""Exercise real expense form/list/dialog buttons with isolated store, OCR and files.
Run python3 scripts/browser/test_expense_receipts.py with Vite at localhost:8080.
No Cloud access; controlled browser-only persistence is not Cloud acceptance.
"""
import unittest
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
OUTPUT = Path("/tmp/browser/expense-receipt-tests")
HTML = """<!doctype html><html><head><meta charset="utf-8">
<script>window.__oj_refresh_installed__=true;window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;</script></head>
<body><div id="root"></div><script type="module" src="/scripts/browser/expense.fixture.tsx"></script></body></html>"""
MOCKS = {
    "/src/lib/store.tsx": ["useStore"],
    "/src/lib/receipt-extract.functions.ts": ["extractReceipt"],
    "/src/lib/fx.functions.ts": ["getFxRate"],
    "/src/lib/assistant.functions.ts": ["parseSpokenEntry"],
    "/src/lib/drafts.ts": ["hasDraftContent", "draftStatus", "getDraft", "completeDraft", "upsertDraft", "uploadDraftReceipt", "draftReceiptFile"],
    "/src/lib/offline.ts": ["fileToLocal", "localDrafts", "localToFile", "putLocalDraft", "removeLocalDraft"],
    "/src/components/AppShell.tsx": ["PageTitle", "Stat"],
}

class ExpenseReceiptButtons(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        OUTPUT.mkdir(parents=True, exist_ok=True)
        self.receipt = OUTPUT / "controlled-receipt.png"
        Image.new("RGB", (240, 320), "white").save(self.receipt)
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.context = await self.browser.new_context(viewport={"width": 1280, "height": 1800})
        self.page = await self.context.new_page()
        self.errors, self.blocked = [], []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        async def isolate(route):
            req = route.request
            parsed = urlparse(req.url)
            if parsed.netloc != "localhost:8080" or req.method not in ("GET", "HEAD"):
                self.blocked.append("unexpected external traffic/write")
                await route.abort()
            elif req.is_navigation_request() and parsed.path in ("/new", "/expenses", "/dashboard"):
                await route.fulfill(status=200, content_type="text/html", body=HTML)
            elif parsed.path in MOCKS:
                await route.fulfill(status=200, content_type="application/javascript", body=f'export {{ {", ".join(MOCKS[parsed.path])} }} from "/scripts/browser/expense-mocks.tsx";')
            elif parsed.path == "/controlled-receipt/controlled-receipt.png":
                await route.fulfill(status=200, content_type="image/png", body=self.receipt.read_bytes())
            else:
                await route.continue_()
        await self.context.route("**/*", isolate)
        await self.page.goto(BASE + "/new", wait_until="domcontentloaded")
        try:
            await expect(self.page.get_by_role("button", name="Save expense", exact=True)).to_be_visible(timeout=15000)
        except Exception:
            print("Setup errors:", self.errors, "blocked:", self.blocked)
            await self.browser.close()
            await self.playwright.stop()
            raise
        self.original = await self.page.evaluate("JSON.stringify(expenseBrowserFixture.transactions[0])")

    async def asyncTearDown(self):
        try:
            await self.page.screenshot(path=str(OUTPUT / f"{self._testMethodName}.png"))
            self.assertEqual(await self.page.evaluate("JSON.stringify(expenseBrowserFixture.transactions.find(e=>e.id==='other-expense'))"), self.original)
            self.assertEqual(self.errors, [])
            self.assertEqual(self.blocked, [])
        finally:
            await self.browser.close()
            await self.playwright.stop()

    async def choose_account(self):
        await self.page.get_by_role("combobox", name="Account", exact=True).click()
        await self.page.get_by_role("option", name="Controlled bank", exact=False).click()

    async def open_expense(self, title):
        await self.page.goto(BASE + "/expenses", wait_until="domcontentloaded")
        await self.page.get_by_role("button").filter(has_text=title).click()
        dialog = self.page.get_by_role("dialog")
        await expect(dialog.get_by_role("heading", name=title, exact=True)).to_be_visible()
        return dialog

    async def test_submit_expense_and_read_back_through_list(self):
        await self.page.get_by_label("Amount", exact=True).fill("1250.50")
        await self.choose_account()
        await self.page.get_by_role("button", name="Save expense", exact=True).click()
        await expect(self.page.get_by_role("heading", name="Controlled save complete")).to_be_visible()
        entries = await self.page.evaluate("expenseBrowserFixture.transactions.filter(e=>e.id!=='other-expense')")
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["amount"], 1250.50)
        self.assertEqual(entries[0]["accountId"], "controlled-account")
        dialog = await self.open_expense(entries[0]["title"])
        await expect(dialog.get_by_text("₹1,250.50", exact=True)).to_be_visible()

    async def test_receipt_upload_view_and_link_survives_edit(self):
        await self.page.get_by_role("button", name="Upload a receipt", exact=True).click()
        async with self.page.expect_file_chooser() as chooser:
            await self.page.get_by_role("button", name="Files / PDF", exact=True).click()
        await (await chooser.value).set_files(self.receipt)
        await expect(self.page.get_by_role("group", name="Review scanned details")).to_be_visible()
        self.assertEqual(await self.page.evaluate("expenseBrowserFixture.saves.length"), 0)
        await self.page.get_by_role("button", name="Confirm details", exact=True).click()
        await self.choose_account()
        await self.page.get_by_role("button", name="Save expense", exact=True).click()
        await expect(self.page.get_by_role("heading", name="Controlled save complete")).to_be_visible()
        entry = await self.page.evaluate("expenseBrowserFixture.transactions.find(e=>e.id!=='other-expense')")
        self.assertEqual(entry["amount"], 432.10)
        self.assertEqual(len(entry["receipts"]), 1)
        self.assertIn(f'/{entry["id"]}/', entry["receipts"][0]["path"])
        self.assertEqual(entry["receipts"][0]["name"], self.receipt.name)
        dialog = await self.open_expense("Controlled receipt expense")
        image = dialog.get_by_role("img", name=self.receipt.name, exact=True)
        await expect(image).to_be_visible()
        self.assertTrue(await image.evaluate("img=>img.complete && img.naturalWidth>0"))
        async with self.page.expect_popup() as popup:
            await image.click()
        attachment = await popup.value
        await attachment.wait_for_load_state()
        self.assertTrue(attachment.url.endswith("/controlled-receipt/controlled-receipt.png"))
        self.assertTrue(await attachment.locator("img").evaluate("img=>img.complete && img.naturalWidth===240"))
        await attachment.screenshot(path=str(OUTPUT / "attachment-open.png"))
        await attachment.close()
        await dialog.get_by_role("button", name="Edit", exact=True).click()
        await self.page.get_by_label("Amount", exact=True).fill("450")
        await self.page.get_by_role("button", name="Save changes", exact=True).click()
        await expect(self.page.get_by_role("heading", name="Sort it out", exact=True)).to_be_visible()
        dialog = await self.open_expense("Controlled receipt expense")
        await expect(dialog.get_by_role("img", name=self.receipt.name)).to_be_visible()
        updated = await self.page.evaluate("expenseBrowserFixture.transactions.find(e=>e.id!=='other-expense')")
        self.assertEqual(updated["id"], entry["id"])
        self.assertEqual(updated["receipts"], entry["receipts"])
        self.assertEqual(updated["amount"], 450)
        await dialog.get_by_role("button", name="Close", exact=True).click()
        await self.page.get_by_role("button").filter(has_text="Unrelated controlled expense").click()
        await expect(self.page.get_by_role("dialog").get_by_role("img", name=self.receipt.name)).to_have_count(0)

if __name__ == "__main__":
    unittest.main(verbosity=2)