import { describe, expect, it } from "vitest";
import { addSample, percentile, summarise, PERF_MAX } from "./perf-check";

const s = (path: string, ms: number) => ({ path, kind: "page" as const, ms, at: 0 });

describe("on-device speed check", () => {
  it("Inbox passes at a 2 second median and fails above it", () => {
    const ok = [1500, 2000, 1900].map((m) => s("/inbox", m));
    expect(summarise(ok).find((r) => r.path === "/inbox")!.result).toBe("pass");
    const slow = [2100, 2500, 1900].map((m) => s("/inbox", m));
    expect(summarise(slow).find((r) => r.path === "/inbox")!.result).toBe("slow");
  });
  it("needs at least 3 opens before judging", () => {
    expect(summarise([s("/inbox", 100), s("/inbox", 100)])[0]!.result).toBe("no_data");
  });
  it("drops invalid timings and keeps only the newest samples", () => {
    expect(addSample([], s("/inbox", -1))).toEqual([]);
    expect(addSample([], s("/inbox", NaN))).toEqual([]);
    let l: ReturnType<typeof addSample> = [];
    for (let i = 0; i < PERF_MAX + 5; i++) l = addSample(l, s("/x", i));
    expect(l.length).toBe(PERF_MAX);
    expect(l[0]!.ms).toBe(5);
  });
  it("nearest-rank percentile", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([], 50)).toBeNull();
  });
});
