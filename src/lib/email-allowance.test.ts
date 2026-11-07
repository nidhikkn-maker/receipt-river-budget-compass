import { describe, it, expect } from "vitest";
import { emailAllowance } from "./upload-link";
const now = new Date("2026-11-02T12:00:00Z");
const ev = (detail: string, hoursAgo: number) => ({ detail, at: new Date(now.getTime() - hoursAgo * 3600_000).toISOString() });
describe("accountant email allowance", () => {
  it("blocks the 11th email within 24 hours", () => {
    expect(emailAllowance(Array.from({ length: 10 }, () => ev("a@x.com", 1)), "a@x.com", now).ok).toBe(false);
    expect(emailAllowance(Array.from({ length: 9 }, () => ev("a@x.com", 1)), "a@x.com", now).ok).toBe(true);
  });
  it("ignores emails older than 24 hours", () => {
    expect(emailAllowance(Array.from({ length: 10 }, () => ev("a@x.com", 25)), "a@x.com", now).ok).toBe(true);
  });
  it("blocks a 4th different address but allows repeats", () => {
    const r = [ev("a@x.com", 1), ev("resent:b@x.com", 1), ev("c@x.com", 1)];
    expect(emailAllowance(r, "d@x.com", now).ok).toBe(false);
    expect(emailAllowance(r, "B@x.com", now).ok).toBe(true);
  });
  it("blocks the 5th email to the same address within 24 hours", () => {
    const r = Array.from({ length: 4 }, () => ev("a@x.com", 2));
    expect(emailAllowance(r, "a@x.com", now).ok).toBe(false);
    expect(emailAllowance(r, "b@x.com", now).ok).toBe(true);
  });
  it("counts manual resends toward the same-address limit", () => {
    const r = [ev("a@x.com", 3), ev("resent:a@x.com", 2), ev("resent:a@x.com", 1), ev("a@x.com", 1)];
    expect(emailAllowance(r, "A@x.com", now).ok).toBe(false);
  });
});
