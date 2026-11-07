#!/usr/bin/env python3
"""Mobile performance check for Ledgerline.

Loads the dashboard the way a phone would — small viewport, throttled CPU and
"Fast 4G" network — and reports how quickly the page frame and the latest
figures appear. Run against the dev server:

    python3 scripts/mobile-perf.py                 # dev server on :8080
    python3 scripts/mobile-perf.py https://ledgerline.biz   # live site

Uses the injected/minted browser session when available so the signed-in
experience is measured, not the sign-in page.
"""
import asyncio
import json
import os
import sys
import time
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
URL = BASE.rstrip("/") + "/dashboard"

# Fast 4G-ish profile: ~4 Mbps down, 3 Mbps up, 40 ms latency, 4x CPU throttle.
LATENCY_MS = 40
DOWN_BPS = 4 * 1024 * 1024 // 8
UP_BPS = 3 * 1024 * 1024 // 8
CPU_THROTTLE = 4


async def restore_session(context, page):
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") == "injected":
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
    else:
        try:
            with open(os.path.expanduser("~/.cache/lovable-auth/session.json")) as f:
                minted = json.load(f)
            storage_key = minted["storage_key"]
            session_json = json.dumps(minted["session"])
            cookies = minted.get("cookies") or []
        except FileNotFoundError:
            print("note: no saved sign-in session — measuring signed-out load only")
            return False
    if cookies and BASE.startswith("http://localhost"):
        await context.add_cookies([{**c, "url": BASE} for c in cookies])
    await page.goto(BASE, wait_until="domcontentloaded")
    await page.evaluate("([k, v]) => window.localStorage.setItem(k, v)", [storage_key, session_json])
    return True


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 402, "height": 725},
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        )
        page = await context.new_page()
        signed_in = await restore_session(context, page)

        cdp = await context.new_cdp_session(page)
        await cdp.send("Network.enable")
        await cdp.send("Network.emulateNetworkConditions", {
            "offline": False, "latency": LATENCY_MS,
            "downloadThroughput": DOWN_BPS, "uploadThroughput": UP_BPS,
        })
        await cdp.send("Emulation.setCPUThrottlingRate", {"rate": CPU_THROTTLE})

        requests = {"count": 0, "bytes": 0}
        page.on("request", lambda r: requests.__setitem__("count", requests["count"] + 1))
        page.on("response", lambda r: None)

        t0 = time.monotonic()
        await page.goto(URL, wait_until="domcontentloaded")
        t_dom = time.monotonic() - t0

        # Page frame: the app header brand is visible.
        try:
            await page.get_by_text("Ledgerline").first.wait_for(timeout=20000)
            t_frame = time.monotonic() - t0
        except Exception:
            t_frame = None

        # Figures visible: loading placeholder gone.
        try:
            await page.get_by_text("Loading…").wait_for(state="detached", timeout=30000)
            t_figures = time.monotonic() - t0
        except Exception:
            t_figures = None

        # Sync finished: the sync pill reports "Up to date".
        try:
            await page.get_by_text("Up to date").first.wait_for(timeout=30000)
            t_synced = time.monotonic() - t0
        except Exception:
            t_synced = None

        await page.screenshot(path="/tmp/mobile-perf-dashboard.png")
        await browser.close()

        print(f"\n=== Mobile performance ({URL}) ===")
        print(f"signed-in session : {'yes' if signed_in else 'no'}")
        print(f"profile           : 402px phone, Fast 4G (~4 Mbps, {LATENCY_MS} ms), {CPU_THROTTLE}x CPU throttle")
        print(f"DOM ready         : {t_dom:.2f}s")
        print(f"page frame visible: {f'{t_frame:.2f}s' if t_frame is not None else 'not seen within 20s'}")
        print(f"figures visible   : {f'{t_figures:.2f}s' if t_figures is not None else 'not seen within 30s'}")
        print(f"synced (up to date): {f'{t_synced:.2f}s' if t_synced is not None else 'not seen within 30s'}")
        print(f"network requests  : {requests['count']}")
        print("screenshot        : /tmp/mobile-perf-dashboard.png")


asyncio.run(main())
