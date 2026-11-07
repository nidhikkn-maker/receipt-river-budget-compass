import { describe, expect, it } from "vitest";
import { hasComplex, plain } from "./pdf-unicode";
describe("pdf unicode text", () => {
  it("detects Tamil and keeps Latin text drawable", () => {
    expect(hasComplex("சென்னை பயணம்")).toBe(true);
    expect(hasComplex("Chennai trip ₹")).toBe(true);
    expect(hasComplex("Chennai trip")).toBe(false);
  });
  it("plain() never passes Tamil to Latin-only fonts", () => {
    expect(plain("₹500 – சென்னை")).toBe("INR 500 - ??????");
  });
});
