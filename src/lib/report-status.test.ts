import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_REPORTS, reportCounts } from "./report-status";

describe("required report dashboard", () => {
  it("lists all 20 required reports once, numbered 1–20", () => {
    expect(REQUIRED_REPORTS.map((r) => r.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
  it("every evidence and test path exists", () => {
    const missing = REQUIRED_REPORTS.flatMap((r) => [...r.evidence, ...r.tests]).filter((p) => !existsSync(p));
    expect(missing).toEqual([]);
  });
  it("unfinished reports say what they wait on", () => {
    expect(REQUIRED_REPORTS.filter((r) => r.state !== "done" && !r.waitingOn)).toEqual([]);
    expect(reportCounts()).toEqual({ done: 17, partial: 3, blocked: 0, total: 20 });
  });
});
