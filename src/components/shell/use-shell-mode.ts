import { useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { cleanUixOverride, effectiveTheme, parseUixFlag, resolveShellMode, UIX_OVERRIDE_KEY, type ShellMode, type ThemeName, type UixOverride } from "@/lib/themes";

/*
 * Device-only Signature Flow preview switch. The `?uix=` flag (used for review captures) is read once
 * per page load and kept in this browser's storage; it is never sent to the cloud and never changes
 * records. The saved Appearance choice in Settings is the durable, owner-level switch.
 */

const listeners = new Set<() => void>();
let current: UixOverride | null | undefined;

function readStored(): UixOverride | null {
  try { return cleanUixOverride(localStorage.getItem(UIX_OVERRIDE_KEY)); } catch { return null; }
}

function writeStored(v: UixOverride | null) {
  try {
    if (v) localStorage.setItem(UIX_OVERRIDE_KEY, v);
    else localStorage.removeItem(UIX_OVERRIDE_KEY);
  } catch { /* private mode: the override lasts for this page only */ }
}

function initial(): UixOverride | null {
  if (typeof window === "undefined") return null;
  const flag = parseUixFlag(window.location.search);
  if (flag === "reset") { writeStored(null); return null; }
  if (flag) { writeStored(flag); return flag; }
  return readStored();
}

export function getUixOverride(): UixOverride | null {
  if (current === undefined) current = initial();
  return current;
}

export function setUixOverride(v: UixOverride | null) {
  current = v;
  writeStored(v);
  for (const l of listeners) l();
}

/** Test helper: forget the cached value so the next read re-parses the URL and storage. */
export function resetUixOverrideCache() { current = undefined; }

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useUixOverride(): UixOverride | null {
  return useSyncExternalStore(subscribe, getUixOverride, () => null);
}

/** Which shell to render and which theme to paint, from the saved Appearance and the device override. */
export function useShellMode(): { mode: ShellMode; theme: ThemeName; override: UixOverride | null } {
  const { preferences } = useStore();
  const override = useUixOverride();
  return { mode: resolveShellMode(preferences.themeName, override), theme: effectiveTheme(preferences.themeName, override), override };
}
