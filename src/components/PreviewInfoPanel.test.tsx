import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PREVIEW_PANEL_POSITION, PreviewInfoPanel } from "./PreviewInfoPanel";
import { buildVersion, classifyDataSource, parseBuiltAt, readPreviewInfo, SAMPLE_DATA_LABEL, UNKNOWN_DATA_LABEL } from "@/lib/preview-info";

const SHA = "69ab3e2d4c1f0a9b8e7d6c5b4a39281706f5e4d3";
const base = {
  VITE_PREVIEW_ENV: "preview",
  VITE_PREVIEW_COMMIT: SHA,
  VITE_PREVIEW_BRANCH: "uix/signature-shell",
  VITE_PREVIEW_BUILT_AT: "2026-11-10T14:32:05Z",
  VITE_SUPABASE_URL: "https://thapal-fixture-backend.vercel.app/__fixture-supabase",
};

describe("preview build identity (pure)", () => {
  it("detects the fixture backend positively and nothing else", () => {
    expect(classifyDataSource("http://localhost:8090/__fixture-supabase")).toBe("sample");
    expect(classifyDataSource("/__fixture-supabase", "https://preview.example")).toBe("sample");
    expect(classifyDataSource("https://thapal-fixture-backend.vercel.app")).toBe("sample");
    expect(classifyDataSource("https://fixtures.example.test/")).toBe("sample");
    expect(classifyDataSource("https://abcdefghijklmnop.supabase.co")).toBe("unknown");
    expect(classifyDataSource("https://prefixture.example")).toBe("unknown");
    expect(classifyDataSource("https://example.test/fixture")).toBe("unknown");
    expect(classifyDataSource("javascript:alert(1)//__fixture-supabase")).toBe("unknown");
    expect(classifyDataSource("")).toBe("unknown");
    expect(classifyDataSource(undefined)).toBe("unknown");
  });

  it("parses ISO and Unix build times and labels the build", () => {
    expect(parseBuiltAt("1794320000")?.toISOString()).toBe(new Date(1794320000 * 1000).toISOString());
    expect(parseBuiltAt("not a date")).toBeNull();
    const d = parseBuiltAt("2026-11-10T14:32:05Z");
    expect(buildVersion(d, "69ab3e2")).toBe("20261110.1432-69ab3e2");
    expect(buildVersion(null, null)).toBe("Unknown build");
    const info = readPreviewInfo(base, "signature.thapal.app");
    expect(info).toMatchObject({ shortCommit: "69ab3e2", builtAtLabel: "10 Nov 2026, 14:32 UTC", dataSource: "sample", host: "signature.thapal.app" });
  });
});

describe("PreviewInfoPanel", () => {
  it("renders nothing unless the build is marked preview", () => {
    for (const VITE_PREVIEW_ENV of [undefined, "", "production", "development", "Preview "]) {
      const { container, unmount } = render(<PreviewInfoPanel env={{ ...base, VITE_PREVIEW_ENV }} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    // The default (no prop) reads the test build's variables, which never set VITE_PREVIEW_ENV.
    const { container } = render(<PreviewInfoPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows commit, branch, build, time, host and sample-data status, collapsed then expanded", () => {
    render(<PreviewInfoPanel env={base} />);
    const pill = screen.getByRole("button", { name: "Preview build 69ab3e2 on uix/signature-shell, sample data" });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    expect(pill).toHaveTextContent("69ab3e2");
    expect(pill.className).toMatch(/min-h-11/);
    expect(pill.className).toMatch(/min-w-11/);
    expect(screen.queryByText(SAMPLE_DATA_LABEL)).toBeNull();

    fireEvent.click(pill);
    expect(pill).toHaveAttribute("aria-expanded", "true");
    const card = screen.getByRole("region", { name: "Preview build details" });
    expect(pill).toHaveAttribute("aria-controls", card.id);
    expect(card).toHaveTextContent(SAMPLE_DATA_LABEL);
    expect(card).toHaveTextContent(SHA);
    expect(card).toHaveTextContent("uix/signature-shell");
    expect(card).toHaveTextContent("20261110.1432-69ab3e2");
    expect(card).toHaveTextContent("10 Nov 2026, 14:32 UTC");
    expect(card).toHaveTextContent(window.location.host);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Preview build details" })).toBeNull();
    expect(pill).toHaveFocus();
  });

  it("says Unknown data source for any other backend", () => {
    render(<PreviewInfoPanel env={{ ...base, VITE_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co" }} />);
    const pill = screen.getByRole("button", { name: /unknown data source$/ });
    fireEvent.click(pill);
    expect(screen.getByRole("region", { name: "Preview build details" })).toHaveTextContent(UNKNOWN_DATA_LABEL);
    expect(screen.queryByText(SAMPLE_DATA_LABEL)).toBeNull();
  });

  it("closes when tapping elsewhere", () => {
    render(<div><p>page</p><PreviewInfoPanel env={base} /></div>);
    fireEvent.click(screen.getByRole("button", { name: /^Preview build/ }));
    fireEvent.pointerDown(screen.getByText("page"));
    expect(screen.queryByRole("region", { name: "Preview build details" })).toBeNull();
  });
});

describe("PreviewInfoPanel layout rule (stays clear of the tab bar, Add, Smart Add and toasts)", () => {
  const css = readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");
  const px = (re: RegExp) => Number(re.exec(css)?.[1]);

  it("sits above the iPhone tab bar plus its safe area", () => {
    const tabbar = px(/--sf-tabbar-h:\s*(\d+)px/);
    expect(tabbar).toBeGreaterThan(0);
    const bottom = Number(/(?:^|\s)bottom-\[calc\(env\(safe-area-inset-bottom,0px\)_\+_(\d+)px\)\]/.exec(PREVIEW_PANEL_POSITION)?.[1]);
    // Clears the Signature tab bar (and the classic bottom nav, which is shorter) with at least an 8 px gap.
    expect(bottom).toBeGreaterThanOrEqual(tabbar + 8);
    expect(PREVIEW_PANEL_POSITION).toMatch(/left-\[max\(12px,env\(safe-area-inset-left\)\)\]/);
    expect(PREVIEW_PANEL_POSITION).toMatch(/md:right-\[max\(16px,env\(safe-area-inset-right\)\)\]/);
  });

  it("stacks below Smart Add, dialogs and sheets but above the bars", () => {
    const z = Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec(PREVIEW_PANEL_POSITION)?.[1]);
    const canvas = px(/\.sf-canvas-layer\s*\{[^}]*z-index:\s*(\d+)/);
    const tabbar = px(/\.sf-tabbar\s*\{[^}]*z-index:\s*(\d+)/);
    expect(canvas).toBe(50);
    expect(z).toBeLessThan(canvas);
    expect(z).toBeGreaterThan(tabbar);
  });
});
