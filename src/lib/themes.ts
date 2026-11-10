/**
 * Thapal theme catalog (Version 4.3).
 * Five families, seven selectable styles; each style supports light, dark and
 * follow-system appearances. Values live as design tokens in src/styles.css —
 * this module is the single source of truth for names, grouping and previews.
 */

export type ThemeName =
  | "signature"
  | "forest"
  | "midnight"
  | "graphite"
  | "apple-classic"
  | "apple-ledgerline"
  | "apple-glass"
  | "signature-flow";

export type Appearance = "light" | "dark" | "system";

export interface ThemeStyle {
  name: ThemeName;
  family: string;
  label: string;
  /** Short description shown under the preview. */
  hint: string;
  /** Preview swatches: [background, card, primary, accent]. */
  swatch: [string, string, string, string];
  /** True when the family's dark appearance is its primary identity. */
  darkFirst?: boolean;
  /** Built for review and not yet visually approved; never the default. */
  proposed?: boolean;
}

export const THEME_STYLES: ThemeStyle[] = [
  { name: "signature", family: "Signature Blue & Gold", label: "Signature", hint: "The classic Thapal navy with gold highlights.", swatch: ["#F5F7FC", "#FFFFFF", "#14265D", "#E6B43A"] },
  { name: "forest", family: "Forest Green & Mint", label: "Forest", hint: "Calm, modern green with a soft mint accent.", swatch: ["#F8FAF9", "#FFFFFF", "#176452", "#A5E2C9"] },
  { name: "midnight", family: "Midnight Blue & Champagne Gold", label: "Midnight", hint: "A luxurious dark interface with champagne gold.", swatch: ["#0C1429", "#182844", "#243C68", "#D8B66A"], darkFirst: true },
  { name: "graphite", family: "Graphite & Platinum", label: "Graphite", hint: "Neutral executive clarity, understated and precise.", swatch: ["#F7F8FA", "#FFFFFF", "#20252C", "#DDE2E8"] },
  { name: "apple-classic", family: "Apple-Inspired Minimal", label: "Apple Classic", hint: "Clean neutrals with a subtle blue accent.", swatch: ["#F5F5F7", "#FFFFFF", "#007AFF", "#E5E5EA"] },
  { name: "apple-ledgerline", family: "Apple-Inspired Minimal", label: "Apple × Thapal", hint: "Apple-inspired simplicity with Thapal navy and gold.", swatch: ["#F7F8FB", "#FFFFFF", "#14265D", "#E6B43A"] },
  { name: "apple-glass", family: "Apple-Inspired Minimal", label: "Apple Glass", hint: "Layered translucent surfaces, restrained and readable.", swatch: ["#EEF1F6", "#FFFFFF", "#007AFF", "#E6B43A"] },
  // Batch B1: the approved Signature Flow look with its own navigation shell. Proposed until KK approves the build.
  { name: "signature-flow", family: "Signature Flow (proposed)", label: "Signature Flow (proposed)", hint: "Forest ink on a calm canvas, with the new Home, Money, To-do and Records navigation. Awaiting visual approval.", swatch: ["#FBFBF8", "#F5F5F0", "#223B35", "#D3E8DC"], proposed: true },
];

export const THEME_FAMILIES = ["Signature Blue & Gold", "Forest Green & Mint", "Midnight Blue & Champagne Gold", "Graphite & Platinum", "Apple-Inspired Minimal", "Signature Flow (proposed)"] as const;

export const DEFAULT_THEME: ThemeName = "signature";
export const DEFAULT_APPEARANCE: Appearance = "system";

const NAMES = new Set<string>(THEME_STYLES.map((t) => t.name));

/** Accept only a known theme style; anything else falls back to the default. */
export function cleanThemeName(raw: unknown): ThemeName {
  return typeof raw === "string" && NAMES.has(raw) ? (raw as ThemeName) : DEFAULT_THEME;
}

export function cleanAppearance(raw: unknown): Appearance {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : DEFAULT_APPEARANCE;
}

/** Resolve the appearance to a concrete light/dark for a given system preference. */
export function resolveAppearance(appearance: Appearance, systemDark: boolean): "light" | "dark" {
  return appearance === "dark" || (appearance === "system" && systemDark) ? "dark" : "light";
}

/**
 * Apply a theme style and appearance to the document root. Pure DOM effect —
 * safe to call before sign-in; the same values persist in finance_preferences.
 */
export function applyTheme(themeName: ThemeName, appearance: Appearance, systemDark: boolean) {
  const root = document.documentElement;
  root.dataset["theme"] = themeName;
  root.classList.toggle("dark", resolveAppearance(appearance, systemDark) === "dark");
  try {
    localStorage.setItem("ll-theme", JSON.stringify({ themeName, appearance }));
  } catch {
    /* private mode: theme still applies for this session */
  }
}

/** Read the last applied theme before preferences load, to avoid a flash. */
export function earlyTheme(): { themeName: ThemeName; appearance: Appearance } {
  try {
    const raw = JSON.parse(localStorage.getItem("ll-theme") ?? "{}") as { themeName?: unknown; appearance?: unknown };
    return { themeName: cleanThemeName(raw.themeName), appearance: cleanAppearance(raw.appearance) };
  } catch {
    return { themeName: DEFAULT_THEME, appearance: DEFAULT_APPEARANCE };
  }
}

/* ---------------------------------------------------------------------------
 * Signature Flow shell switch (Track B, batch B1).
 * The proposed Signature Flow look is a theme *and* a navigation shell. It is on when the
 * owner picks "Signature Flow (proposed)" in Settings → Appearance (saved with the other
 * display preferences), or on this device only through the `?uix=` flag used for review
 * captures. The flag never writes to the cloud and never touches financial records.
 * ------------------------------------------------------------------------- */

export const SIGNATURE_FLOW: ThemeName = "signature-flow";
export type ShellMode = "classic" | "signature-flow";
/** Device-only override set by `?uix=signature-flow` / `?uix=classic`; `?uix=reset` clears it. */
export type UixOverride = ShellMode;
export const UIX_OVERRIDE_KEY = "ll-uix";

/** Reads the `uix` flag from a URL query string. `reset` means "clear the device override". */
export function parseUixFlag(search: string): UixOverride | "reset" | null {
  let raw: string | null = null;
  try { raw = new URLSearchParams(search).get("uix"); } catch { return null; }
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  if (v === "signature-flow" || v === "signature" || v === "sf" || v === "on") return "signature-flow";
  if (v === "classic" || v === "current" || v === "off") return "classic";
  if (v === "reset" || v === "default" || v === "") return "reset";
  return null;
}

export function cleanUixOverride(raw: unknown): UixOverride | null {
  return raw === "signature-flow" || raw === "classic" ? raw : null;
}

/** Which shell renders: a device override wins, otherwise the saved theme decides. Default: the current UI. */
export function resolveShellMode(themeName: ThemeName, override: UixOverride | null): ShellMode {
  if (override) return override;
  return themeName === SIGNATURE_FLOW ? "signature-flow" : "classic";
}

/** The theme actually painted, so the tokens always match the shell that is showing. */
export function effectiveTheme(themeName: ThemeName, override: UixOverride | null): ThemeName {
  if (override === "signature-flow") return SIGNATURE_FLOW;
  if (override === "classic" && themeName === SIGNATURE_FLOW) return DEFAULT_THEME;
  return themeName;
}
