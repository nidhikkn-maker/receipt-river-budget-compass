// The Signature Flow switch: off by default, on through the saved Appearance choice or the device-only
// review flag, and never a reason to touch records. Store and heavy shell parts are isolated stand-ins.
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences, normalizePreferences } from "@/lib/preferences";
import { cleanThemeName, DEFAULT_THEME, effectiveTheme, parseUixFlag, resolveShellMode, THEME_STYLES, UIX_OVERRIDE_KEY } from "@/lib/themes";

const local = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("@/lib/store", () => ({ useStore: () => local.store }));
vi.mock("@tanstack/react-router", async () => {
  const { MockLink } = await import("./test-router-mock");
  return {
    Link: MockLink,
    useRouter: () => ({ history: { location: { href: "/home" }, subscribe: () => () => {}, canGoBack: () => false, back: () => {}, forward: () => {} }, navigate: () => {} }),
    useRouterState: ({ select }: { select: (s: unknown) => unknown }) => select({ location: { href: "/home", pathname: "/home", state: {} } }),
    useNavigate: () => () => {},
  };
});
vi.mock("./SignatureShell", () => ({ SignatureShell: ({ children }: { children: React.ReactNode }) => <div data-testid="signature-shell">{children}</div> }));
for (const [path, name] of [["../OfflineBanner", "OfflineBanner"], ["../PageSkeleton", "PageSkeleton"], ["../NavProgress", "NavProgress"], ["../DemoBanner", "DemoBanner"], ["../DraftsReminder", "DraftsReminder"], ["../StepUpHost", "StepUpHost"], ["../StoreLoadNotice", "StoreLoadNotice"], ["../SmartAdd", "SmartAdd"], ["../ModuleDirectory", "ModuleDirectory"], ["./SyncStatus", "SyncStatus"]] as const) {
  vi.doMock(path, () => ({ [name]: () => null }));
}
vi.mock("../DeviceLock", () => ({ DeviceLock: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { getUixOverride, resetUixOverrideCache, setUixOverride } from "./use-shell-mode";

function setUrl(search: string) { window.history.replaceState(null, "", `/home${search}`); }

beforeEach(() => {
  localStorage.clear();
  setUrl("");
  resetUixOverrideCache();
  local.store = { preferences: defaultPreferences(), loading: false, name: "KK", savePreferences: vi.fn() };
});
afterEach(cleanup);

describe("Signature Flow theme catalog entry", () => {
  it("is selectable, labelled proposed and never the default", () => {
    const sf = THEME_STYLES.find((t) => t.name === "signature-flow");
    expect(sf?.label).toBe("Signature Flow (proposed)");
    expect(sf?.proposed).toBe(true);
    expect(sf?.swatch).toEqual(["#FBFBF8", "#F5F5F0", "#223B35", "#D3E8DC"]);
    expect(DEFAULT_THEME).toBe("signature");
    expect(defaultPreferences().themeName).toBe("signature");
  });
  it("survives preference cleaning so the saved choice sticks", () => {
    expect(cleanThemeName("signature-flow")).toBe("signature-flow");
    expect(normalizePreferences({ themeName: "signature-flow" }).themeName).toBe("signature-flow");
  });
});

describe("switch rules", () => {
  it("parses the review flag", () => {
    expect(parseUixFlag("?uix=signature-flow")).toBe("signature-flow");
    expect(parseUixFlag("?uix=sf")).toBe("signature-flow");
    expect(parseUixFlag("?uix=classic")).toBe("classic");
    expect(parseUixFlag("?uix=reset")).toBe("reset");
    expect(parseUixFlag("?uix=neon")).toBeNull();
    expect(parseUixFlag("?section=review")).toBeNull();
  });
  it("default is the current UI; saved choice or device flag turns it on; the flag can turn it off", () => {
    expect(resolveShellMode("signature", null)).toBe("classic");
    expect(resolveShellMode("forest", null)).toBe("classic");
    expect(resolveShellMode("signature-flow", null)).toBe("signature-flow");
    expect(resolveShellMode("signature", "signature-flow")).toBe("signature-flow");
    expect(resolveShellMode("signature-flow", "classic")).toBe("classic");
  });
  it("paints tokens that match the shell", () => {
    expect(effectiveTheme("forest", null)).toBe("forest");
    expect(effectiveTheme("forest", "signature-flow")).toBe("signature-flow");
    expect(effectiveTheme("signature-flow", "classic")).toBe("signature");
    expect(effectiveTheme("midnight", "classic")).toBe("midnight");
  });
});

describe("device override (review flag)", () => {
  it("reads ?uix= once, keeps it on this device, and ?uix=reset clears it", () => {
    setUrl("?uix=signature-flow");
    expect(getUixOverride()).toBe("signature-flow");
    expect(localStorage.getItem(UIX_OVERRIDE_KEY)).toBe("signature-flow");
    resetUixOverrideCache(); setUrl("");
    expect(getUixOverride()).toBe("signature-flow");
    resetUixOverrideCache(); setUrl("?uix=reset");
    expect(getUixOverride()).toBeNull();
    expect(localStorage.getItem(UIX_OVERRIDE_KEY)).toBeNull();
  });
  it("ignores junk in storage", () => {
    localStorage.setItem(UIX_OVERRIDE_KEY, "<script>");
    expect(getUixOverride()).toBeNull();
  });
});

describe("AppShell switch", () => {
  it("renders today's shell by default and the Signature Flow shell when switched on; records are never written", async () => {
    const { AppShell } = await import("../AppShell");
    const save = local.store["savePreferences"] as ReturnType<typeof vi.fn>;
    const view = render(<AppShell><p>page body</p></AppShell>);
    expect(screen.queryByTestId("signature-shell")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Sidebar" })).toBeInTheDocument();
    expect(document.documentElement.dataset["theme"]).toBe("signature");

    act(() => setUixOverride("signature-flow"));
    expect(screen.getByTestId("signature-shell")).toHaveTextContent("page body");
    expect(document.documentElement.dataset["theme"]).toBe("signature-flow");

    act(() => setUixOverride(null));
    expect(screen.queryByTestId("signature-shell")).toBeNull();
    view.unmount();

    local.store = { ...local.store, preferences: { ...defaultPreferences(), themeName: "signature-flow" } };
    render(<AppShell><p>page body</p></AppShell>);
    expect(screen.getByTestId("signature-shell")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
