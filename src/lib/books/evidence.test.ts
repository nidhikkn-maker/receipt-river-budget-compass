import { describe, expect, it } from "vitest";
import { evidenceCsv, registerEvidence, unsourced } from "./evidence";
import { emptyBooks } from "./types";
import type { Asset } from "../assets";

const asset = (x: Partial<Asset>) => ({ id: "a1", name: "Laptop", kind: "computer", cost: 90000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 20, ...x }) as Asset;
const docs = [{ id: "d1", title: "Invoice 42" }];

describe("register figure sources", () => {
  it("uses the record's own document first", () => {
    const r = registerEvidence({ assets: [asset({ docId: "d1" })], books: emptyBooks(), docs });
    expect(r[0]!.source).toEqual({ kind: "document", id: "d1", title: "Invoice 42" });
  });
  it("falls back to a DocuRepo link, then a linked entry", () => {
    const books = { ...emptyBooks(), docLinks: [{ docId: "d1", kind: "asset", targetId: "a1", label: "x" }] } as never;
    expect(registerEvidence({ assets: [asset({})], books, docs })[0]!.source?.id).toBe("d1");
    expect(registerEvidence({ assets: [asset({ transactionId: "t1" })], books: emptyBooks(), docs })[0]!.source).toMatchObject({ kind: "entry", id: "t1" });
  });
  it("a figure with no source, or a deleted document, is reported as unsourced", () => {
    const r = registerEvidence({ assets: [asset({ docId: "gone" })], books: emptyBooks(), docs });
    expect(unsourced(r)).toHaveLength(1);
    expect(evidenceCsv(r)).toContain("No source");
  });
  it("CSV neutralises spreadsheet formulas", () => {
    expect(evidenceCsv(registerEvidence({ assets: [asset({ name: "=HYPERLINK()" })], books: emptyBooks(), docs }))).toContain("'=HYPERLINK");
  });
});
