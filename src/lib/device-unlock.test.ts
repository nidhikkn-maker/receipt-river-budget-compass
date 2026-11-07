import { describe, expect, it } from "vitest";
import { consumeDeviceUnlock, rememberDeviceUnlock } from "./device-unlock";

describe("sign-in page device unlock handoff", () => {
  it("only unlocks the verified owner", () => {
    rememberDeviceUnlock("owner-a", 100);
    expect(consumeDeviceUnlock("owner-b", 101)).toBe(false);
  });
  it("can only be consumed once", () => {
    rememberDeviceUnlock("owner-a", 100);
    expect(consumeDeviceUnlock("owner-a", 101)).toBe(true);
    expect(consumeDeviceUnlock("owner-a", 102)).toBe(false);
  });
  it("expires after thirty seconds", () => {
    rememberDeviceUnlock("owner-a", 100);
    expect(consumeDeviceUnlock("owner-a", 30_100)).toBe(false);
  });
});