import { describe, expect, it } from "vitest";
import { runningBalanceEnds } from "./running-balance";

const d = (amount: number, balance?: number) => ({ amount, direction: "debit" as const, balance });
const c = (amount: number, balance?: number) => ({ amount, direction: "credit" as const, balance });

describe("running balance column", () => {
  it("derives opening ₹1,00,000 and closing ₹1,77,150.50 from an oldest-first export", () => {
    expect(runningBalanceEnds([d(450, 99550), c(85000, 184550), d(2399.5, 182150.5), d(5000, 177150.5)]))
      .toEqual({ opening: 100000, closing: 177150.5, owed: false });
  });
  it("handles newest-first files the same way", () => {
    expect(runningBalanceEnds([d(5000, 177150.5), d(2399.5, 182150.5), c(85000, 184550), d(450, 99550)]))
      .toEqual({ opening: 100000, closing: 177150.5, owed: false });
  });
  it("reads a card where spending raises what is owed", () => {
    expect(runningBalanceEnds([d(1000, 6000), c(500, 5500)])).toEqual({ opening: 5000, closing: 5500, owed: true });
  });
  it("refuses when one step is off by a paisa", () => {
    expect(runningBalanceEnds([d(450, 99550), c(85000, 184550.01)])).toBeNull();
  });
  it("refuses when any balance is missing", () => {
    expect(runningBalanceEnds([d(450, 99550), c(85000)])).toBeNull();
  });
  it("refuses a single line, which cannot show its own direction", () => {
    expect(runningBalanceEnds([d(450, 99550)])).toBeNull();
  });
  it("keeps decimals exact (0.1 + 0.2 style steps)", () => {
    expect(runningBalanceEnds([c(0.1, 0.1), c(0.2, 0.3)])).toEqual({ opening: 0, closing: 0.3, owed: false });
  });
});
