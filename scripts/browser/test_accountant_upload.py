#!/usr/bin/env python3
"""Accountant link → upload page → Statement Desk, with no Cloud traffic.

Run: python3 scripts/browser/test_accountant_upload.py (Vite at localhost:8080).
Uses the real /u/$token page and the real Statement Desk; the upload endpoint and
Cloud reads are answered by an in-memory stand-in, so no file or record is stored.
Server-side link checks (signature, expiry, file cap) are covered by src/lib/upload-link.test.ts.
"""
import json
import unittest
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
EVIDENCE = Path("/tmp/browser/accountant-upload-tests")
TOKEN = "123e4567-e89b-12d3-a456-426614174000.controlled"
HTML = """<!doctype html><html><head><meta charset="utf-8">
<script>window.__oj_refresh_installed__ = true; window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;</script></head>
<body><div id="root"></div><script type="module" src="/scripts/browser/statement-desk.fixture.tsx"></script></body></html>"""
CSV = "Date,Description,Debit,Credit\n2026-10-02,SWIGGY ORDER,250.00,\n2026-10-03,AMAZON PURCHASE,480.00,\n"


class AccountantUpload(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        self.stored = []  # what the stand-in upload endpoint received
        self.errors, self.blocked = [], []
        self.pw = await async_playwright().start()
        self.browser = await self.pw.chromium.launch(headless=True)
        self.context = await self.browser.new_context(viewport={"width": 402, "height": 874})

        async def isolate(route):
            req = route.request
            u = urlparse(req.url)
            if u.netloc in ("fonts.googleapis.com", "fonts.gstatic.com") and req.method == "GET":
                return await route.abort()
            if u.netloc != "localhost:8080":
                self.blocked.append(u.hostname); return await route.abort()
            if u.path == f"/api/public/upload/{TOKEN}":
                if req.method == "GET":
                    return await route.fulfill(json={"active": True, "ownerName": "Krupa", "remaining": 50 - len(self.stored), "expiresAt": "2026-12-02T00:00:00Z"})
                body = req.post_data_buffer or b""
                name = "accountant-sample.csv" if b"accountant-sample.csv" in body else "unknown"
                start = body.find(b"Date,Description")
                end = body.find(b"\r\n--", start)
                self.stored.append({"id": f"up-{len(self.stored)+1}", "file_name": name, "bytes": body[start:end], "mime_type": "text/csv"})
                return await route.fulfill(json={"ok": True})
            if u.path.startswith("/api/public/upload/"):
                return await route.fulfill(status=404, json={"active": False})
            if u.path == "/__fixture/accountant-uploads":
                rows = [{"id": s["id"], "file_path": f"owner/accountant/{s['id']}", "file_name": s["file_name"], "mime_type": s["mime_type"], "uploaded_at": "2026-11-02T04:00:00Z"} for s in self.stored]
                return await route.fulfill(json=rows)
            if u.path == "/__fixture/file":
                sid = parse_qs(u.query)["path"][0].rsplit("/", 1)[-1]
                hit = next(s for s in self.stored if s["id"] == sid)
                return await route.fulfill(status=200, content_type="text/csv", body=hit["bytes"])
            if u.path == "/statements":
                return await route.fulfill(status=200, content_type="text/html", body=HTML)
            if u.path in ("/src/lib/store.tsx", "/src/integrations/supabase/client.ts"):
                name = "useStore" if "store.tsx" in u.path else "supabase"
                return await route.fulfill(status=200, content_type="application/javascript", body=f'export {{ {name} }} from "/scripts/browser/statement-desk-mocks.tsx";')
            if req.method not in ("GET", "HEAD"):
                self.blocked.append("unexpected write " + u.path); return await route.abort()
            await route.continue_()

        await self.context.route("**/*", isolate)

    async def asyncTearDown(self):
        await self.browser.close(); await self.pw.stop()

    async def test_upload_through_link_then_appears_in_statement_desk(self):
        page = await self.context.new_page()
        page.on("pageerror", lambda e: self.errors.append(str(e)))
        await page.goto(f"{BASE}/u/{TOKEN}", wait_until="domcontentloaded")
        await expect(page.get_by_role("heading", name="Upload statements for Krupa")).to_be_visible(timeout=20000)
        await page.get_by_label("Statement files").set_input_files(files=[{"name": "accountant-sample.csv", "mimeType": "text/csv", "buffer": CSV.encode()}])
        await expect(page.get_by_text("1 of 1 uploaded")).to_be_visible()
        await page.screenshot(path=str(EVIDENCE / "1_upload_page.png"))
        self.assertEqual(len(self.stored), 1)

        desk = await self.context.new_page()
        desk.on("pageerror", lambda e: self.errors.append(str(e)))
        await desk.goto(f"{BASE}/statements", wait_until="domcontentloaded")
        await expect(desk.get_by_text("1 statement from your accountant")).to_be_visible(timeout=20000)
        await desk.get_by_role("button", name="Read & match").click()
        await expect(desk.get_by_text("accountant-sample.csv").first).to_be_visible()
        await desk.locator("select").first.select_option("desk-account")
        await expect(desk.get_by_role("button", name="Accept all 2 asking items")).to_be_visible()
        await desk.screenshot(path=str(EVIDENCE / "2_statement_desk.png"))
        self.assertEqual(await desk.evaluate("accountantConsumed"), ["up-1"])
        self.assertEqual(await desk.evaluate("deskFixture.saves.length"), 0)  # nothing posted without confirmation
        self.assertEqual(self.errors, []); self.assertEqual(self.blocked, [])

    async def test_inactive_link_shows_message(self):
        page = await self.context.new_page()
        await page.goto(f"{BASE}/u/not-a-real-link", wait_until="domcontentloaded")
        await expect(page.get_by_role("heading", name="This link is no longer active")).to_be_visible(timeout=20000)


if __name__ == "__main__":
    unittest.main()
