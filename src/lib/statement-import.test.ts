import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { readStatement } from "./statement-import";

describe("Excel bank statement imports", () => {
 for (const extension of ["xls", "xlsx"]) {
  it(`reads dated debit and credit rows from an actual ${extension} workbook`, async () => {
   const buffer = await readFile(new URL(`./fixtures/statement.${extension}`, import.meta.url));
   const file = new File([buffer], `statement.${extension}`);
   expect(await readStatement(file)).toEqual([
    { ref: "L1", date: "2026-10-30", description: "Taxi, airport", amount: 1250.5 },
    { ref: "L2", date: "2026-10-31", description: "Salary", amount: 50000, direction: "credit" },
   ]);
  });
 }
 it("rejects a workbook with no transaction columns", async () => {
  const buffer = await readFile(new URL("./fixtures/empty.xls", import.meta.url));
  await expect(readStatement(new File([buffer], "empty.xls"))).rejects.toThrow("No transactions found");
 });
});