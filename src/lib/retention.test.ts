// Retention policy (KK decision, 9 Nov 2026): only genuinely disposable interface data may be size-limited.
import { describe, expect, it } from "vitest";
import { normalizePreferences, type FinancePreferences } from "./preferences";
import { PREFERENCE_RETENTION } from "./retention";
import { canonical, preserveForSave, unreadableRecords } from "./preserve-records";
import { setChecked } from "./audit-checked";

const N = 2500; // above every previous cap (largest settings cap was 2,000 per batch / 1,000 aliases)
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const defaults = normalizePreferences({}) as unknown as Record<string, unknown>;
// Settings objects that are not collections of records (single values / option sets).
const SINGLE_SETTINGS = new Set(["books", "freshness", "emergency", "brief", "smartDefaults", "notifications", "homeCustomStart", "homeCustomEnd"]);

describe("every stored collection is classified", () => {
  it("each array/map setting has a retention class; KK's named evidence types are never UI", () => {
    for (const [k, v] of Object.entries(defaults)) {
      if (!v || typeof v !== "object" || SINGLE_SETTINGS.has(k)) continue;
      expect(PREFERENCE_RETENTION[k], `unclassified collection: ${k}`).toBeDefined();
    }
    for (const k of ["inboxDismissed", "depreciationDismissed", "coolingOff", "travelMessages", "contractObligations", "reimbursementSettings", "checkedAudit", "decisions", "autopilotActions", "statementUploads"])
      expect(PREFERENCE_RETENTION[k]!.class, k).not.toBe("ui");
    for (const r of Object.values(PREFERENCE_RETENTION)) expect(r.cap === null).toBe(r.class !== "ui");
  });
});

/** A large stored collection in a shape the app accepts where it validates, generic records elsewhere. */
function bigCollection(key: string): unknown {
  switch (key) {
    case "statementUploads": return range(N).map((i) => ({ id: `u${i}`, at: "2026-01-01", label: "L", posted: [`p${i}`], reconciled: [], createdAccounts: [], status: "complete" }));
    case "inboxDismissed": case "ruleDismissed": case "checkedAudit": return range(N).map((i) => `key-${i}`);
    case "depreciationDismissed": return range(N).map((i) => `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    case "travelMessages": return range(N).map((i) => ({ id: `t${i}`, title: "Booking", text: "PNR", tripId: null, source: "email", createdAt: "2026-01-01", reviewed: false }));
    case "reimbursementSettings": return { profiles: range(N).map((i) => ({ id: `rp${i}`, organisation: "Org" })), mappings: [], responsibilities: [], lastFormat: "detailed" };
    case "statementBatches": return Object.fromEntries(range(60).map((b) => [`b${b}`, range(N).map((i) => `e${b}-${i}`)]));
    case "shopRules": return Object.fromEntries(range(N).map((i) => [`shop ${i}`, { category: "Food" }]));
    case "shopAliases": return Object.fromEntries(range(N).map((i) => [`alias ${i}`, `shop ${i}`]));
    case "autopilotActions": case "merchantAliases": case "statementBalances": return Object.fromEntries(range(N).map((i) => [`k${i}`, { at: "2026-01-01" }]));
    case "mapPositions": return Object.fromEntries(range(N).map((i) => [`n${i}`, { x: 10, y: 40 }]));
    case "favouriteEntries": return range(N).map((i) => `fav-${i}`);
    case "savedViews": return range(N).map((i) => ({ id: `v${i}`, name: `View ${i}`, filters: { q: "x" } }));
    default: return range(N).map((i) => ({ id: `${key}-${i}`, name: `R${i}`, title: `R${i}`, at: "2026-01-01" }));
  }
}
const size = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);

describe("non-UI collections are never truncated or lost", () => {
  for (const [key, r] of Object.entries(PREFERENCE_RETENTION)) {
    if (r.class === "ui") continue;
    it(`${key} (${r.class}): load → save keeps all ${N} stored records`, () => {
      const stored = { [key]: bigCollection(key) } as Record<string, unknown>;
      const view = normalizePreferences(stored as Partial<FinancePreferences>) as unknown as Record<string, unknown>;
      const saved = preserveForSave(stored, view as unknown as FinancePreferences) as unknown as Record<string, unknown>;
      expect(canonical(saved[key])).toBe(canonical(stored[key])); // byte-identical in storage
      // Nothing the app could read is hidden either (no count cap on screens).
      const hidden = unreadableRecords(stored).filter((u) => u.path === key || u.path.startsWith(`${key}.`));
      expect(size(view[key]) + hidden.length).toBeGreaterThanOrEqual(key === "statementBatches" ? 60 : key === "reimbursementSettings" ? 4 : N);
    });
  }
  it("adding one record to a large evidence list keeps every earlier record", () => {
    const stored = { coolingOff: bigCollection("coolingOff"), inboxDismissed: bigCollection("inboxDismissed") } as Record<string, unknown>;
    const view = normalizePreferences(stored as Partial<FinancePreferences>);
    const saved = preserveForSave(stored, { ...view, inboxDismissed: [...view.inboxDismissed, "new-key"] }) as unknown as Record<string, unknown[]>;
    expect(saved["inboxDismissed"]).toHaveLength(N + 1);
    expect(saved["coolingOff"]).toHaveLength(N);
  });
  it("audit marks and dismissed depreciation months are not truncated when written", () => {
    const marks = range(N).map((i) => `audit-${i}`);
    expect(setChecked(marks, ["audit-new"], true)).toHaveLength(N + 1);
  });
});

describe("UI-only data keeps documented size limits", () => {
  for (const [key, r] of Object.entries(PREFERENCE_RETENTION)) {
    if (r.class !== "ui" || !["mapPositions", "favouriteEntries", "savedViews"].includes(key)) continue;
    it(`${key} is limited to ${r.cap} on screen (${r.why})`, () => {
      const view = normalizePreferences({ [key]: bigCollection(key) } as Partial<FinancePreferences>) as unknown as Record<string, unknown>;
      expect(size(view[key])).toBe(r.cap);
    });
  }
});
