import { describe, it, expect } from "vitest";
import { filterShared, rowsFor, sharedCompanyCsv, sharedCompanyPdfData, type SharedCompany, type SharedTxn, type SharedDoc } from "./shared-company";

const c: SharedCompany = { grant_id: "g", owner_id: "o1", entity_id: "c1", company_name: "Krupa Pvt Ltd", owner_email: "o@x.in", can_write: false };
const t = (id: string, owner: string, ent: string | null): SharedTxn => ({ id, employee_id: owner, entity_id: ent, title: id, merchant: null, category: "Office", amount: 100, currency: "INR", expense_date: "2026-10-01", txn_type: "expense" });
const d = (id: string, owner: string, ent: string | null): SharedDoc => ({ id, owner_id: owner, entity_id: ent, title: id, doc_type: "invoice", doc_date: null, file_path: "x" });

describe("shared company export", () => {
  it("includes only that owner's rows for that company", () => {
    const rows = [t("keep", "o1", "c1"), t("othercompany", "o1", "c2"), t("personal", "o1", null), t("otherowner", "o2", "c1")];
    expect(rowsFor(rows, c, (r) => r.employee_id).map((r) => r.id)).toEqual(["keep"]);
  });
  it("CSV leaves out other companies' transactions and documents", () => {
    const csv = sharedCompanyCsv(c, [t("keep", "o1", "c1"), t("leak", "o1", "c2")], [d("doc-ok", "o1", "c1"), d("doc-leak", "o2", "c1")]);
    expect(csv).toContain("keep"); expect(csv).toContain("doc-ok");
    expect(csv).not.toContain("leak");
  });
  it("neutralises spreadsheet formulas in shared text", () => {
    expect(sharedCompanyCsv(c, [{ ...t("x", "o1", "c1"), title: "=HYPERLINK(1)" }], [])).toContain(`"'=HYPERLINK(1)"`);
  });
});
