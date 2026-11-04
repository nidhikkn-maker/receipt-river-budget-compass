import { describe, expect, it } from "vitest";
import { fingerprint, headlines, newHeadlines } from "./rule-watch";

const page = (items: string[]) => `<html><script>var x="Notification 1 of 2099 should be ignored"</script><nav><a>Home notification menu link item</a></nav><ul>${items.map((i) => `<li><a href="#">${i}</a></li>`).join("")}</ul></html>`;
describe("official rule page watch", () => {
  it("keeps notification headlines and drops scripts and menus", () => {
    expect(headlines(page(["Notification No. 12/2026 – Central Tax &amp; due date extended", "Contact"]))).toEqual(["Notification No. 12/2026 – Central Tax & due date extended"]);
  });
  it("treats the first visit as a baseline and reports only new headlines later", () => {
    const a = ["Notification No. 11/2026 – Central Tax rate change"];
    const b = [...a, "Notification No. 12/2026 – GSTR-3B due date extended"];
    expect(newHeadlines(null, b)).toEqual([]);
    expect(newHeadlines(a, b)).toEqual(["Notification No. 12/2026 – GSTR-3B due date extended"]);
  });
  it("gives the same fingerprint for the same headlines", async () => {
    expect(await fingerprint(["A notification 2026"])).toBe(await fingerprint(["a NOTIFICATION 2026"]));
    expect(await fingerprint(["A notification 2026"])).not.toBe(await fingerprint(["Another notification 2026"]));
  });
});
