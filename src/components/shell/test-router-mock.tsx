import type { ReactNode } from "react";

/**
 * Minimal TanStack Router stand-in for shell component tests: links render as plain anchors so tests can
 * check where each control goes without a running router. Not used by the app.
 */
export function MockLink({ to, params, search, hash, children, ...rest }: { to?: string; params?: Record<string, string>; search?: Record<string, string>; hash?: string; children?: ReactNode; [k: string]: unknown }) {
  let href = to ?? "";
  for (const [k, v] of Object.entries(params ?? {})) href = href.replace(`$${k}`, v);
  const q = search ? `?${new URLSearchParams(search).toString()}` : "";
  return <a href={`${href}${q}${hash ? `#${hash}` : ""}`} {...(rest as Record<string, unknown>)}>{children}</a>;
}
