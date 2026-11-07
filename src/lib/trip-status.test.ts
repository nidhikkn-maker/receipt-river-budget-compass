import { describe, expect, it } from "vitest";
import { tripStatus } from "./travel";

const base = { start: "2026-11-10", end: "2026-11-15", closedAt: null, cancelledAt: null };

describe("tripStatus", () => {
  it("marks future trips upcoming", () => expect(tripStatus(base, "2026-11-01")).toBe("upcoming"));
  it("marks trips spanning today active", () => {
    expect(tripStatus(base, "2026-11-10")).toBe("active");
    expect(tripStatus(base, "2026-11-15")).toBe("active");
  });
  it("marks past trips completed", () => expect(tripStatus(base, "2026-11-16")).toBe("completed"));
  it("closed wins over dates", () => expect(tripStatus({ ...base, closedAt: "2026-11-20T00:00:00Z" }, "2026-11-12")).toBe("closed"));
  it("cancelled wins over closed and dates", () => expect(tripStatus({ ...base, closedAt: "2026-11-20T00:00:00Z", cancelledAt: "2026-11-05T00:00:00Z" }, "2026-11-12")).toBe("cancelled"));
});
