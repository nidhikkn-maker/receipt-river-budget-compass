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

  // Warm the most-used pages once the first screen is idle.
  useEffect(() => {
    const run = () => { for (const to of WARM) void router.preloadRoute({ to } as never).catch(() => {}); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 2500 }) : window.setTimeout(run, 1200);
    return () => { if (!w.requestIdleCallback) clearTimeout(id); };
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
