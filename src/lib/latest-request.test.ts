import { describe, expect, it } from "vitest";
import { createLatest } from "./latest-request";
describe("latest request guard", () => {
  it("marks an older request stale once a newer one starts", () => {
    const l = createLatest(); const a = l.begin(); const b = l.begin();
    expect(a.isCurrent()).toBe(false); expect(b.isCurrent()).toBe(true);
  });
  it("cancel makes the running request stale", () => {
    const l = createLatest(); const a = l.begin(); l.cancel(); expect(a.isCurrent()).toBe(false);
  });
});
