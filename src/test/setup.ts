import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";

// waitFor/findBy* give up after 1 s by default. Under parallel load (several suites at once) async work such as
// PDF generation can take longer, which made correct screens fail intermittently. Allow more time; every
// assertion is unchanged.
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
