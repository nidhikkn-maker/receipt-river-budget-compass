import { describe, it, expect } from "vitest";
import { parseGstr2b, matchGstr2b } from "./gstr2b";
import type { Expense } from "./expenses";

const json = { data: { docdata: { b2b: [{ ctin: "33abcpe1234f1z5", trdnm: "Acme Traders Pvt Ltd", inv: [
  { inum: "A1", dt: "05-05-2026", val: 1180, items: [{ cgst: 90, sgst: 90 }] },
  { inum: "A2", dt: "10-05-2026", val: 2000, items: [{ igst: 305 }] },
  { inum: "A3", dt: "20-05-2026", val: 500, items: [{ igst: 76 }] },
] }] } } };
const e = (id: string, amount: number, date: string, tax = 0) => ({ id, title: "x", merchant: "ACME traders", scope: "business", amount, date, receipts: [], fxRate: 1, receiptDetails: { tax } }) as unknown as Expense;

describe("gstr2b", () => {
  it("parses portal JSON into invoices with dates and tax", () => {
    const inv = parseGstr2b(json);
    expect(inv[0]).toEqual({ gstin: "33ABCPE1234F1Z5", supplier: "Acme Traders Pvt Ltd", number: "A1", date: "2026-05-05", value: 1180, tax: 180 });
  });
  it("matches exact, near and missing; lists taxed bills not filed by supplier", () => {
    const { rows, booksOnly } = matchGstr2b(parseGstr2b(json), [e("a", 1180, "2026-05-06"), e("b", 1950, "2026-05-11"), e("c", 900, "2026-05-28", 50)]);
    expect(rows.map((r) => r.state)).toEqual(["matched", "amount-differs", "not-in-books"]);
    expect(booksOnly.map((x) => x.id)).toEqual(["c"]);
  });
});
