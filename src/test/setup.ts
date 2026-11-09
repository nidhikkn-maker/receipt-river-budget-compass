import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";

// Load-induced flakes: give async queries more time on busy CI machines (same change as the other tracks).
configure({ asyncUtilTimeout: 5000 });

if (typeof window !== "undefined") {
Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
}
