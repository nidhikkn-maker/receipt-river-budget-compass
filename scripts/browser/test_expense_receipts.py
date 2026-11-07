#!/usr/bin/env python3
"""Exercise real expense form/list/dialog buttons with isolated store, OCR and files.
Run python3 scripts/browser/test_expense_receipts.py with Vite at localhost:8080.
No Cloud access; controlled browser-only persistence is not Cloud acceptance.
"""
import re
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
    "/src/lib/receipt-problems.functions.ts": ["reportReceiptProblem"],
    "/src/lib/drafts.ts": ["hasDraftContent", "draftStatus", "getDraft", "completeDraft", "upsertDraft", "uploadDraftReceipt", "draftReceiptFile"],
    "/src/lib/offline.ts": ["fileToLocal", "localDrafts", "localToFile", "putLocalDraft", "removeLocalDraft"],
    "/src/components/AppShell.tsx": ["PageTitle", "Stat"],
    "/src/components/TeamAccess.tsx": ["TeamExpenses"],
}

class ExpenseReceiptButtons(unittest.IsolatedAsyncioTestCase):
    @unittest.skip("Obsolete sequential approval UI removed in 0002. Current review/authorization coverage: src/lib/expense-review-security.test.ts and src/lib/role-access.test.ts; see docs/evidence/approval-test-replacement.md. These are not sequential-approval acceptance.")
    async def test_department_manager_then_finance_approval(self):
        """Retired workflow only; current security boundaries run in isolated PostgreSQL, not mock buttons."""

    async def asyncSetUp(self):
        OUTPUT.mkdir(parents=True, exist_ok=True)
        self.receipt = OUTPUT / "controlled-receipt.png"
        Image.new("RGB", (240, 320), "white").save(self.receipt)
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.context = await self.browser.new_context(viewport={"width": 1280, "height": 1800}, has_touch=True)
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
            elif parsed.path == '/src/components/TeamAccess.tsx':
                await route.fulfill(status=200, content_type='application/javascript', body='export const TeamExpenses=()=>null;')
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
        await expect(dialog.get_by_role("heading", name=title, exact=True).last).to_be_visible()
        return dialog

    async def test_submit_expense_and_read_back_through_list(self):
        await self.page.get_by_label("Amount", exact=True).fill("1250.50")
        await self.page.get_by_label("Note", exact=True).fill("Controlled submitted expense")
        await self.choose_account()
        await self.page.get_by_role("button", name="Save expense", exact=True).click()
        await expect(self.page.get_by_role("heading", name="Controlled save complete")).to_be_visible()
        entries = await self.page.evaluate("expenseBrowserFixture.transactions.filter(e=>e.id!=='other-expense')")
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["amount"], 1250.50)
        self.assertEqual(entries[0]["accountId"], "controlled-account")
        dialog = await self.open_expense(entries[0]["title"])
        await expect(dialog.get_by_text("₹1,250.50", exact=True)).to_be_visible()

    async def test_pdf_receipt_zooms_in_side_by_side_viewer(self):
        pdf = OUTPUT / "controlled-receipt.pdf"
        Image.new("RGB", (240, 320), "white").save(pdf, "PDF")
        await self.page.get_by_role("button", name="Upload a receipt", exact=True).click()
        async with self.page.expect_file_chooser() as chooser:
            await self.page.get_by_role("button", name="Files / PDF", exact=True).click()
        await (await chooser.value).set_files(pdf)
        review = self.page.get_by_role("group", name="Review scanned details")
        await review.get_by_text("Original receipt", exact=True).click()
        viewer = review.get_by_role("img", name="Receipt controlled-receipt.pdf, zoom 100%")
        await expect(viewer).to_be_visible()
        await expect(viewer.locator("img")).to_be_visible(timeout=15000)
        await review.get_by_role("button", name="Zoom in", exact=True).click()
        await expect(review.get_by_role("img", name="Receipt controlled-receipt.pdf, zoom 150%")).to_be_visible()
        await review.get_by_role("button", name="Reset zoom", exact=True).click()
        frame = review.get_by_role("img", name=re.compile("Receipt controlled-receipt.pdf"))
        await expect(frame).to_have_attribute("aria-label", re.compile("zoom 100%"))
        b = await frame.bounding_box(); cx, cy = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
        cdp = await self.context.new_cdp_session(self.page)
        async def touch(kind, pts): await cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
        # Gentle pinch: doubling the finger gap zooms about 1.5x, not straight to the maximum.
        await touch("touchStart", [(cx - 30, cy), (cx + 30, cy)])
        for k in range(1, 7): await touch("touchMove", [(cx - 30 - 5 * k, cy), (cx + 30 + 5 * k, cy)])
        await touch("touchEnd", [])
        zoom = int(re.search(r"zoom (\d+)%", await frame.get_attribute("aria-label")).group(1))
        self.assertTrue(130 <= zoom <= 170, zoom)
        await review.get_by_role("button", name="Reset zoom", exact=True).click()
        await self.page.wait_for_timeout(300)
        async def double_tap():
            for _ in range(2):
                await touch("touchStart", [(cx, cy)]); await touch("touchEnd", []); await self.page.wait_for_timeout(80)
        await double_tap()
        await expect(frame).to_have_attribute("aria-label", re.compile("zoom 250%"))
        await self.page.wait_for_timeout(400)
        await double_tap()
        await expect(frame).to_have_attribute("aria-label", re.compile("zoom 100%"))

    async def test_report_a_problem_from_the_viewer_sends_device_and_browser(self):
        """Reporting receipt trouble carries the chosen problem, the note and this device's details."""
        await self.page.get_by_role("button", name="Upload a receipt", exact=True).click()
        async with self.page.expect_file_chooser() as chooser:
            await self.page.get_by_role("button", name="Files / PDF", exact=True).click()
        await (await chooser.value).set_files(self.receipt)
        review = self.page.get_by_role("group", name="Review scanned details")
        await review.get_by_text("Original receipt", exact=True).click()
        await expect(review).to_be_visible()
        await review.get_by_role("button", name="Zoom in", exact=True).click()
        await expect(review.get_by_role("img", name="Receipt controlled-receipt.png, zoom 150%")).to_be_visible()
        await review.get_by_role("button", name="Report a problem", exact=True).click()
        dialog = self.page.get_by_role("dialog")
        await expect(dialog.get_by_role("heading", name="Report a receipt viewing problem", exact=True)).to_be_visible()
        await expect(dialog.get_by_role("button", name="Send report", exact=True)).to_be_disabled()
        await dialog.get_by_text("Device details we'll send", exact=True).click()
        await expect(dialog.get_by_text("Screen:")).to_be_visible()
        await expect(dialog.get_by_text("Touch:")).to_be_visible()
        await dialog.get_by_role("radio", name="Zoom didn't work", exact=True).check()
        await dialog.get_by_label("Anything else? (optional)", exact=True).fill("Pinch jumped straight to full zoom")
        await dialog.get_by_role("button", name="Send report", exact=True).click()
        await expect(self.page.get_by_role("dialog")).not_to_be_visible()
        sent = await self.page.evaluate("expenseBrowserFixture.reports[0]")
        self.assertEqual(sent["kind"], "zoom")
        self.assertEqual(sent["note"], "Pinch jumped straight to full zoom")
        self.assertEqual(sent["receiptName"], "controlled-receipt.png")
        self.assertEqual(sent["receiptType"], "image/png")
        self.assertEqual(sent["zoom"], 1.5)
        facts = sent["facts"]
        self.assertIn("zoom in tapped", facts["log"])
        self.assertTrue(facts["pointerEvents"])
        self.assertGreater(facts["screenWidth"], 0)
        self.assertIn("Mozilla", facts["ua"])
        self.assertEqual(await self.page.evaluate("expenseBrowserFixture.saves.length"), 0)

    async def test_receipt_upload_view_and_link_survives_edit(self):
        await self.page.get_by_label("Extract receipt items", exact=True).check()
        await self.page.get_by_role("button", name="Upload a receipt", exact=True).click()
        async with self.page.expect_file_chooser() as chooser:
            await self.page.get_by_role("button", name="Files / PDF", exact=True).click()
        await (await chooser.value).set_files(self.receipt)
        await expect(self.page.get_by_role("group", name="Review scanned details")).to_be_visible()
        self.assertEqual(await self.page.evaluate("expenseBrowserFixture.saves.length"), 0)
        review = self.page.get_by_role("group", name="Review scanned details")
        await review.get_by_text("Original receipt", exact=True).click()
        fields = review.get_by_text("Check what I read from the receipt", exact=True)
        if await review.locator("details.canvas-fields:not([open])").count(): await fields.click()
        await expect(review.get_by_label("Item 1 name confidence: High reading confidence", exact=True)).to_be_visible()
        await expect(review.get_by_role('heading', name='Intelligent Canvas')).to_be_visible()
        await expect(review.get_by_text('A receipt from Controlled cafe', exact=False)).to_be_visible()
        await review.get_by_role('combobox', name='Receipt workspace').click()
        await self.page.get_by_role('option', name='Personal', exact=True).click()
        await review.get_by_text('Where this came from', exact=True).click()
        await expect(review.get_by_text('Controlled receipt', exact=True)).to_be_visible()
        await expect(review.get_by_label("Item 1 amount confidence: Double-check · low confidence", exact=True)).to_be_visible()
        await expect(review.get_by_text("1 need your check", exact=False)).to_be_visible()
        await expect(review.get_by_text("Check the amount of this item", exact=True)).to_be_visible()
        await review.get_by_label("Item 1 name", exact=True).fill("Dinner for two")
        await expect(review.get_by_label("Item 1 amount", exact=True)).to_have_value("360")
        await review.get_by_label("Subtotal before tax and tip", exact=True).fill("350")
        await expect(review.get_by_role("alert")).to_contain_text("Receipt total mismatch")
        await expect(review.get_by_role("alert")).to_contain_text("Receipt items add up to 360.00")
        await self.page.get_by_role("button", name="Confirm details", exact=True).click()
        await expect(review).to_be_visible()
        await review.get_by_label("Subtotal before tax and tip", exact=True).fill("360")
        await expect(review.get_by_label("Tax included", exact=True)).to_have_value("32.1")
        await expect(review.get_by_label("Tip included", exact=True)).to_have_value("40")
        await expect(review.get_by_text("High reading confidence", exact=True).first).to_be_visible()
        await expect(review.get_by_text("Double-check · low confidence", exact=True).first).to_be_visible()
        await expect(review.get_by_text("Double-check · medium confidence", exact=True)).to_be_visible()
        await review.screenshot(path=str(OUTPUT / "receipt-review-desktop.png"))
        await self.page.set_viewport_size({"width": 402, "height": 874})
        await review.scroll_into_view_if_needed()
        await review.screenshot(path=str(OUTPUT / "receipt-review-phone.png"))
        self.assertFalse(await self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        await self.page.set_viewport_size({"width": 1280, "height": 1800})
        await review.get_by_role("combobox", name="Receipt category", exact=True).click()
        await self.page.get_by_role("option", name="Client & Business Meals", exact=True).click()
        await review.get_by_label("Tip included", exact=True).fill("500")
        await self.page.get_by_role("button", name="Confirm details", exact=True).click()
        await expect(review).to_be_visible()
        self.assertEqual(await self.page.evaluate("expenseBrowserFixture.saves.length"), 0)
        await review.get_by_label("Tip included", exact=True).fill("40")
        await expect(review.get_by_role("img", name="Receipt controlled-receipt.png, zoom 100%")).to_be_visible()
        await review.get_by_role("button", name="Zoom in", exact=True).click()
        await expect(review.get_by_role("img", name="Receipt controlled-receipt.png, zoom 150%")).to_be_visible()
        await self.page.get_by_role("button", name="Confirm details", exact=True).click()
        await expect(review).to_be_visible()
        self.assertEqual(await self.page.evaluate("expenseBrowserFixture.saves.length"), 0)
        await review.get_by_label("I've checked this date against the receipt").check()
        await self.page.get_by_role("button", name="Confirm details", exact=True).click()
        gate = self.page.get_by_role("dialog")
        await expect(gate.get_by_role("heading", name="Check these receipt items before saving", exact=True)).to_be_visible()
        await expect(gate).to_contain_text("Item 1")
        await expect(gate).to_contain_text("the amount was hard to read")
        await self.page.screenshot(path=str(OUTPUT / "receipt-review-gate.png"))
        await gate.get_by_role("button", name="I've checked these items", exact=True).click()
        await expect(review).not_to_be_visible()
        await self.choose_account()
        await self.page.get_by_role("button", name="Save expense", exact=True).click()
        await expect(self.page.get_by_role("heading", name="Controlled save complete")).to_be_visible()
        entry = await self.page.evaluate("expenseBrowserFixture.transactions.find(e=>e.id!=='other-expense')")
        self.assertEqual(entry["amount"], 432.10)
        self.assertEqual(entry['scope'], 'personal')
        self.assertEqual(entry["receiptDetails"]["subtotal"], 360)
        self.assertEqual(entry["receiptDetails"]["items"], [{"name": "Dinner for two", "quantity": 2, "amount": 360, "confidence": {"name": "high", "amount": "low"}}])
        self.assertEqual(entry["receiptDetails"]["tax"], 32.10)
        self.assertEqual(entry["receiptDetails"]["tip"], 40)
        self.assertEqual(entry["category"], "Client & Business Meals")
        self.assertEqual(len(entry["receipts"]), 1)
        self.assertIn(f'/{entry["id"]}/', entry["receipts"][0]["path"])
        self.assertEqual(entry["receipts"][0]["name"], self.receipt.name)
        dialog = await self.open_expense("Controlled receipt expense")
        await expect(dialog.get_by_text("Tip included:", exact=False)).to_be_visible()
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
        await self.page.get_by_label("Note", exact=True).fill("Reviewed receipt attachment")
        await self.page.get_by_role("button", name="Save changes", exact=True).click()
        await expect(self.page.get_by_role("heading", name="Sort it out", exact=True)).to_be_visible()
        dialog = await self.open_expense("Reviewed receipt attachment")
        await expect(dialog.get_by_role("img", name=self.receipt.name)).to_be_visible()
        updated = await self.page.evaluate("expenseBrowserFixture.transactions.find(e=>e.id!=='other-expense')")
        self.assertEqual(updated["id"], entry["id"])
        self.assertEqual(updated["receipts"], entry["receipts"])
        self.assertEqual(updated["amount"], 432.10)
        await dialog.get_by_role("button", name="Close", exact=True).click()
        await self.page.get_by_role("button").filter(has_text="Unrelated controlled expense").click()
        await expect(self.page.get_by_role("dialog").get_by_role("img", name=self.receipt.name)).to_have_count(0)

if __name__ == "__main__":
    unittest.main(verbosity=2)