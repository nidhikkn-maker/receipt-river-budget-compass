import { describe, expect, it } from "vitest";
import { csvCell } from "./csv-safe";

describe("csvCell", () => {
  it("turns formula text into plain text", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("+cmd")).toBe(`"'+cmd"`);
  });
  it("keeps numbers as numbers", () => {
    expect(csvCell(-250)).toBe(`"-250"`);
    expect(csvCell("-12.50")).toBe(`"-12.50"`);
  });
});
