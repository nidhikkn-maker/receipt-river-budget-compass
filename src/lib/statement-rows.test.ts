import { describe, expect, it } from "vitest";
import { normalizeStatementRows } from "./statement-rows";
describe("Scanned statement review", () => {
  it("preserves positive debit and credit amounts for review",()=>expect(normalizeStatementRows([{date:"2026-10-31",description:"Salary",amount:50000,direction:"credit"},{date:"2026-10-31",description:"Taxi",amount:100.125,direction:"debit"}])).toEqual([{ref:"OCR1",date:"2026-10-31",description:"Salary",amount:50000,direction:"credit"},{ref:"OCR2",date:"2026-10-31",description:"Taxi",amount:100.13,direction:"debit"}]));
  it("rejects invented dates, invalid amounts and missing direction",()=>expect(normalizeStatementRows([{date:"2026-02-30",description:"x",amount:100,direction:"debit"},{date:"2026-10-31",description:"x",amount:-10,direction:"debit"},{date:"2026-10-31",description:"x",amount:10,direction:"unknown"}])).toEqual([]));
});