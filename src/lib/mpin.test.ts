import { describe, expect, it } from "vitest";
import { hasMpin, isValidPin, setMpin, verifyMpin } from "./mpin";

class Mem implements Storage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe("MPIN", () => {
  it("requires exactly 4 digits and refuses easy PINs", () => {
    expect(isValidPin("4821")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1111")).toBe(false);
    expect(isValidPin("1234")).toBe(false);
    expect(isValidPin("4321")).toBe(false);
  });
  it("unlocks with the right PIN and stores no plain PIN", async () => {
    const s = new Mem();
    await setMpin("u1", "4821", s);
    expect(s.getItem("ll-mpin-u1")).not.toContain("4821");
    expect(await verifyMpin("u1", "4821", s)).toEqual({ ok: true });
  });
  it("is tied to one account", async () => {
    const s = new Mem();
    await setMpin("u1", "4821", s);
    expect(hasMpin("u2", s)).toBe(false);
    expect((await verifyMpin("u2", "4821", s)).ok).toBe(false);
  });
  it("erases the PIN after 5 wrong tries", async () => {
    const s = new Mem();
    await setMpin("u1", "4821", s);
    for (let i = 0; i < 4; i++) expect(await verifyMpin("u1", "0000", s)).toEqual({ ok: false, left: 4 - i, reset: false });
    expect(await verifyMpin("u1", "0000", s)).toEqual({ ok: false, left: 0, reset: true });
    expect(hasMpin("u1", s)).toBe(false);
  });
});
