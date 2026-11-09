// @vitest-environment node
// Registry completeness by TYPE PATH (not just field name): every string leaf, map key and untyped value of every
// stored register type (finance_preferences.data and the JSON columns of backed-up tables) is either remapped by a
// registered rule, kept verbatim, listed as not a reference with a reason, or is a non-id field. A new `accountId`
// in a new register therefore fails here even though `accountId` is registered elsewhere. Reads source files only.
import { describe, expect, it } from "vitest";
import { COLUMN_JSON_REFS, NOT_REMAPPED_FIELDS, PATHS_NOT_REMAPPED, PREFERENCE_REFS, PREFERENCE_VERBATIM, type RefRule } from "./backup-remap";
import { typeLeaves, type Leaf, type TypeRoot } from "../test/type-paths";

const ID_LIKE = /^(id|[a-zA-Z]+(Id|Ids))$/;
const tok = (p: string) => p.match(/\[\]|\{key\}|\{\}|[^.[\]{}]+/g) ?? [];
const same = (rule: string, actual: string) => { const r = tok(rule), a = tok(actual); return r.length === a.length && r.every((t, i) => t === a[i] || (t === "{}" && a[i] !== "[]" && a[i] !== "{key}")); };
const under = (prefix: string, actual: string) => { const r = tok(prefix), a = tok(actual); return r.length <= a.length && r.every((t, i) => t === a[i]); };
const lastField = (path: string) => tok(path).filter((t) => !t.startsWith("[") && !t.startsWith("{")).at(-1) ?? "";

/** Field names some rule treats as a reference: a leaf with this name must match a rule path or be listed by path. */
function referenceNames(rules: readonly RefRule[]) { return new Set(rules.map((r) => lastField(r.path)).filter((f) => f !== "id")); }

function unclassified(leaves: Leaf[], rules: readonly RefRule[], verbatim: readonly string[], base: string): string[] {
  const refNames = referenceNames([...PREFERENCE_REFS, ...Object.values(COLUMN_JSON_REFS).flat() as RefRule[]]);
  return leaves.filter(({ path, kind }) => {
    if (verbatim.some((v) => under(v, path))) return false;
    if (`${base}${path}` in PATHS_NOT_REMAPPED) return false;
    if (rules.some((r) => same(r.path, path))) return false;
    if (kind !== "string") return true; // map keys and untyped values must be classified explicitly
    const f = lastField(path);
    if (!ID_LIKE.test(f) || f === "id") return false;
    return refNames.has(f) || !(f in NOT_REMAPPED_FIELDS);
  }).map((l) => `${base}${l.path} (${l.kind})`);
}

const PREFS: TypeRoot[] = [{ file: "src/lib/preferences.ts", type: "FinancePreferences", prefix: "" }, { file: "src/lib/travel.ts", type: "TravelTrip", prefix: "trips[]" }];
const COLUMNS: Record<string, TypeRoot[]> = {
  expenses: [
    { file: "src/lib/expenses.ts", type: "Receipt", prefix: "receipts[]" }, { file: "src/lib/expenses.ts", type: "Split", prefix: "splits[]" },
    { file: "src/lib/expenses.ts", type: "Allocation", prefix: "allocations[]" }, { file: "src/lib/workspaces.ts", type: "WorkspaceShare", prefix: "workspace_allocations[]" },
    { file: "src/lib/reimbursements.ts", type: "ReimbursementInfo", prefix: "reimbursement" }, { file: "src/lib/expenses.ts", type: "ReceiptDetails", prefix: "receipt_details" },
  ],
  expense_drafts: [{ file: "src/lib/drafts.ts", type: "DraftData", prefix: "data" }, { file: "src/lib/drafts.ts", type: "DraftReceipt", prefix: "receipts[]" }],
  accounts: [{ file: "src/lib/ledger.ts", type: "AccountDetails", prefix: "details" }],
  documents: [{ file: "src/lib/documents.ts", type: "DocField", prefix: "fields[]" }],
  loans: [{ file: "src/lib/cards.ts", type: "LoanPayment", prefix: "payments[]" }],
  security_holdings: [{ file: "src/lib/investments/demat.ts", type: "StoredHolding", prefix: "" }],
};

describe("backup reference registry completeness by type path", () => {
  it("every id-like path of the stored preference types is classified", () => {
    const leaves = typeLeaves(PREFS);
    expect(leaves.length).toBeGreaterThan(300);
    expect(unclassified(leaves, PREFERENCE_REFS, PREFERENCE_VERBATIM.map((v) => v.path), "finance_preferences.data.")).toEqual([]);
  }, 60000);

  it("every id-like path of the JSON columns of backed-up tables is classified", () => {
    const problems: string[] = [];
    for (const [table, roots] of Object.entries(COLUMNS)) {
      const leaves = typeLeaves(roots).filter((l) => table !== "security_holdings" || /^(lots|gains|sources|events)\b/.test(l.path));
      problems.push(...unclassified(leaves, COLUMN_JSON_REFS[table] ?? [], [], `${table}.`));
    }
    expect(problems).toEqual([]);
  }, 60000);

  it("every path exception still exists in a stored type (no stale classifications)", () => {
    const known = new Set([...typeLeaves(PREFS).map((l) => `finance_preferences.data.${l.path}`), ...Object.entries(COLUMNS).flatMap(([t, roots]) => typeLeaves(roots).map((l) => `${t}.${l.path}`))]);
    expect(Object.keys(PATHS_NOT_REMAPPED).filter((p) => !known.has(p))).toEqual([]);
  }, 60000);
});
