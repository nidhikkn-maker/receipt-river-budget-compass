import { useEffect, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

const WARM = ["/expenses", "/inbox", "/statements", "/reports", "/new", "/settings"] as const;

/** Top progress bar for page changes, idle warm-up of main pages, and duplicate-tap guard. */
export function NavProgress() {
  const router = useRouter();
  const pending = useRouterState({ select: (s) => s.status === "pending" || s.isLoading });
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!pending) {
      setShow(false);
      document.querySelectorAll("[data-nav-pending]").forEach((el) => el.removeAttribute("data-nav-pending"));
      return;
    }
    setShow(true);
  }, [pending]);

  // Mark the tapped link so it shows its own spinner until the page is ready.
  useEffect(() => {
    let timer = 0;
    const onTap = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      clearTimeout(timer);
      // Only show it if opening takes longer than a blink.
      timer = window.setTimeout(() => { if (router.state.status === "pending" || router.state.isLoading) a.setAttribute("data-nav-pending", ""); }, 120);
    };
    document.addEventListener("click", onTap);
    return () => { clearTimeout(timer); document.removeEventListener("click", onTap); };
  }, [router]);

  // Warm the most-used pages one at a time, only after the first screen has settled,
  // so background page code never competes with the data the first screen is waiting on.
  // On a line slow enough to hold up that first screen, only the most-used page is
  // warmed, and much later; the rest loads when it is actually tapped.
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    let idleId = 0;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const warm = (list: readonly string[], gap: number) => list.forEach((to, i) => {
      timers.push(window.setTimeout(() => {
        if (!cancelled) void router.preloadRoute({ to } as never).catch(() => {});
      }, i * gap));
    });
    const start = () => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      if (conn?.saveData === true || (nav?.loadEventEnd ?? 0) > 4000) warm(["/expenses"], 0);
      else warm(WARM, 700);
    };
    const kick = window.setTimeout(() => {
      const run = () => { if (!cancelled) start(); };
      // Still loading the first screen? Wait for it, then judge how busy the line is.
      if (document.readyState !== "complete") {
        window.addEventListener("load", () => window.setTimeout(run, 1500), { once: true });
        return;
      }
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(run, { timeout: 5000 }) ?? 0;
      else run();
    }, 2200);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearTimeout(kick);
      const cw = w as Window & { cancelIdleCallback?: (id: number) => void };
      if (idleId && cw.cancelIdleCallback) cw.cancelIdleCallback(idleId);
    };
  }, [router]);

  // Ignore repeat taps on a link to the page that is already opening.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const st = router.state;
      if (st.status !== "pending" && !st.isLoading) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && url.pathname === st.location.pathname) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
    <div className={show ? "nav-progress h-full bg-gold" : "h-full w-0 opacity-0 transition-opacity duration-300"} />
  </div>;
}
