import { describe, expect, it } from "vitest";
import { fileProblem, linkState, MAX_FILES, sendDue, signToken, verifyToken } from "./upload-link";

const row = { id: "x", expires_at: "2026-12-02T00:00:00Z", revoked_at: null, file_count: 0, max_files: MAX_FILES };
const now = new Date("2026-11-02T04:00:00Z");

describe("accountant upload link", () => {
  it("accepts at least 25 files", () => { expect(MAX_FILES).toBeGreaterThanOrEqual(25); expect(linkState({ ...row, file_count: 25 }, now)).toBe("active"); });
  it("stops when full", () => expect(linkState({ ...row, file_count: MAX_FILES }, now)).toBe("full"));
  it("expires after its date", () => expect(linkState(row, new Date("2026-12-02T00:00:01Z"))).toBe("expired"));
  it("turned-off link is revoked", () => expect(linkState({ ...row, revoked_at: "2026-11-01T00:00:00Z" }, now)).toBe("revoked"));
  it("rejects files over 20 MB and other types", () => {
    expect(fileProblem("a.pdf", 21 * 1024 * 1024)).not.toBeNull();
    expect(fileProblem("a.exe", 10)).not.toBeNull();
    expect(fileProblem("a.pdf", 10)).toBeNull();
  });
  it("monthly email only on the chosen day, once a month", () => {
    expect(sendDue(2, null, now)).toBe(true);
    expect(sendDue(1, null, now)).toBe(false);
    expect(sendDue(2, "2026-11-02T01:00:00Z", now)).toBe(false);
    expect(sendDue(2, "2026-10-02T01:00:00Z", now)).toBe(true);
  });
  it("tokens verify only with the right signature", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const t = await signToken("s", id);
    expect(await verifyToken("s", t)).toBe(id);
    expect(await verifyToken("other", t)).toBeNull();
    expect(await verifyToken("s", t.slice(0, -2) + "zz")).toBeNull();
  });
});
