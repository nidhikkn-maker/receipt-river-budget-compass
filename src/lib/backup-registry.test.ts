// Registry completeness: a new id-bearing field or preference section cannot be added without being classified as
// remapped (REFS), verbatim, or explicitly not a reference to a remapped row. Pure; reads source files only.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLUMN_JSON_REFS, NOT_REMAPPED_FIELDS, PREFERENCE_NO_REFS, PREFERENCE_REFS, PREFERENCE_VERBATIM, collectRefs, type RefRule } from "./backup-remap";
import { defaultPreferences } from "./preferences";
import { PREFERENCE_RETENTION } from "./retention";
import { cleanBooks, emptyBooks } from "./books/types";
import { buildBackupFixture } from "../test/backup-fixture";

const ID_LIKE = /^(id|[a-zA-Z]+(Id|Ids))$/;
const lastField = (path: string) => path.replace(/\[\]|\{\}|\{key\}/g, "").split(".").filter(Boolean).at(-1) ?? "";
const ruleFields = new Set([...PREFERENCE_REFS, ...Object.values(COLUMN_JSON_REFS).flat() as RefRule[]].map((r) => lastField(r.path)));
const classifiedField = (name: string) => ruleFields.has(name) || name in NOT_REMAPPED_FIELDS;
const sectionCovered = (section: string) => section in PREFERENCE_NO_REFS || PREFERENCE_VERBATIM.some((v) => v.path === section || v.path.startsWith(`${section}.`)) || PREFERENCE_REFS.some((r) => r.path === section || r.path.startsWith(`${section}.`) || r.path.startsWith(`${section}[`) || r.path.startsWith(`${section}{`));

describe("backup reference registry completeness", () => {
  it("classifies every top-level preference section and every books register", async () => {
    const fixture = (await buildBackupFixture()).data.finance_preferences?.[0]?.["data"] as Record<string, unknown>;
    const top = new Set([...Object.keys(defaultPreferences()), ...Object.keys(PREFERENCE_RETENTION), ...Object.keys(fixture), "shopRules", "shopAliases", "smartDefaults", "statementBatches", "statementUploads", "entities", "assets", "receivables", "depreciationDismissed", "checkedAudit", "merchantGroupingHistory", "preservedRecords", "notifications"]);
    top.delete("books");
    const books = new Set([...Object.keys(emptyBooks()), ...Object.keys(cleanBooks({})), ...Object.keys(fixture["books"] as object)]);
    const missing = [...top].filter((k) => !sectionCovered(k)).concat([...books].map((k) => `books.${k}`).filter((k) => !sectionCovered(k)));
    expect(missing).toEqual([]);
  });

  it("classifies every id-like field name declared by the stored register types", () => {
    const files = ["preferences.ts", "books/types.ts", "assets.ts", "travel.ts", "intelligence.ts", "payment-instruments.ts", "reimbursement-profiles.ts", "rules-engine.ts", "contracts.ts", "merchant-management.ts", "travel-inbox.ts", "books/loan-balances.ts", "books/gst-special.ts", "books/itr-handoff.ts", "books/entity-tax-profile.ts", "drafts.ts", "receivables.ts", "entities.ts", "payees.ts", "graph.ts", "cooling-off.ts", "memory.ts", "allocation.ts", "books/price-overrides.ts", "reimbursements.ts", "books/accounting-journal.ts", "investments/demat.ts", "notification-settings.ts", "home-shortcuts.ts", "autopilot.ts", "preserve-records.ts"];
    const names = new Set(files.flatMap((f) => [...readFileSync(join(__dirname, f), "utf8").matchAll(/\b([a-zA-Z]+(?:Id|Ids))\??:/g)].map((m) => m[1]!)));
    expect([...names].filter((n) => !classifiedField(n)).sort()).toEqual([]);
  });

  it("classifies every id-like field present in the realistic fixture", async () => {
    const b = await buildBackupFixture();
    const seen = new Set<string>();
    const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (ID_LIKE.test(k)) seen.add(k); walk(x); } };
    walk(b.data.finance_preferences?.[0]?.["data"]);
    for (const t of Object.keys(COLUMN_JSON_REFS)) walk(b.data[t as keyof typeof b.data]);
    expect([...seen].filter((n) => !classifiedField(n)).sort()).toEqual([]);
  });

  it("the fixture populates every registered reference path (every register exercised)", async () => {
    const b = await buildBackupFixture();
    const prefs = b.data.finance_preferences?.[0]?.["data"];
    const unused = PREFERENCE_REFS.filter((rule) => collectRefs(prefs, [rule]).length === 0 && !(rule.encoding === "embedded")).map((r) => r.path);
    expect(unused).toEqual([]);
    for (const [t, rules] of Object.entries(COLUMN_JSON_REFS)) for (const rule of rules ?? []) {
      // An embedded rule on a text column (statement_ref, P0-032): the fixture holds such a text with a row id inside.
      if (rule.encoding === "embedded" && !rule.path.includes(".")) {
        expect((b.data[t as keyof typeof b.data] ?? []).some((r) => typeof r[rule.path] === "string" && /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(String(r[rule.path]))), `${t}.${rule.path}`).toBe(true);
        continue;
      }
      expect(collectRefs(b.data[t as keyof typeof b.data], [{ ...rule, path: `[].${rule.path}` }]).length, `${t}.${rule.path}`).toBeGreaterThan(0);
    }
  });

  it("every rule documents why it exists", () => {
    for (const r of [...PREFERENCE_REFS, ...Object.values(COLUMN_JSON_REFS).flat() as RefRule[]]) { expect(r.why.length).toBeGreaterThan(3); expect(r.table ?? r.encoding).toBeTruthy(); }
  });
});
