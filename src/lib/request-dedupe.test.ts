import { describe, expect, it } from "vitest";
import { shareInflight, throttled } from "./request-dedupe";

describe("request de-duplication", () => {
  it("concurrent identical reads share one request", async () => {
    let calls = 0;
    const run = () => new Promise<number>((r) => { calls++; setTimeout(() => r(calls), 5); });
    const [a, b] = await Promise.all([shareInflight("k", run), shareInflight("k", run)]);
    expect(calls).toBe(1); expect(a).toBe(b);
  });
  it("a read after the first settles fetches fresh records", async () => {
    let calls = 0;
    await shareInflight("k2", async () => ++calls);
    await shareInflight("k2", async () => ++calls);
    expect(calls).toBe(2);
  });
  it("a failed read is not reused", async () => {
    await expect(shareInflight("k3", async () => { throw Error("x"); })).rejects.toThrow();
    expect(await shareInflight("k3", async () => 7)).toBe(7);
  });
  it("throttled runs once per interval", () => {
    let n = 0;
    expect(throttled("t", 60_000, () => n++, 1000)).toBe(true);
    expect(throttled("t", 60_000, () => n++, 30_000)).toBe(false);
    expect(throttled("t", 60_000, () => n++, 61_001)).toBe(true);
    expect(n).toBe(2);
  });
});
