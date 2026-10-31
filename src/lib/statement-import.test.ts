import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { File } from "node:buffer";
import { readStatement } from "./statement-import";

describe("Excel bank statement imports", () => {
 for (const extension of ["xls", "xlsx"]) {
  it(`reads dated debit and credit rows from an actual ${extension} workbook`, async () => {
   const buffer = await readFile(`src/lib/fixtures/statement.${extension}`);
   const file = Object.assign(new File([buffer], `statement.${extension}`), { webkitRelativePath: "" });
   expect(await readStatement(file)).toEqual([
    { ref: "L1", date: "2026-10-30", description: "Taxi, airport", amount: 1250.5 },
    { ref: "L2", date: "2026-10-31", description: "Salary", amount: 50000, direction: "credit" },
   ]);
  });
 }
 it("rejects a workbook with no transaction columns", async () => {
  const buffer = await readFile("src/lib/fixtures/empty.xls");
  await expect(readStatement(Object.assign(new File([buffer], "empty.xls"), { webkitRelativePath: "" }))).rejects.toThrow("No transactions found");
 });
});