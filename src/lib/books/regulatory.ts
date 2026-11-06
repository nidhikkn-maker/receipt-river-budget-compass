/**
 * Regulatory Intelligence register [§49–51]: versioned rules with source, publication and effective dates,
 * validation tests and approval. Monitoring only proposes; activation is manual; history is never rewritten.
 */
import type { RuleArea, RuleVersion } from "./types";

/** Official sources watched read-only. */
export const OFFICIAL_SOURCES: { area: RuleArea; name: string; url: string }[] = [
  { area: "income_tax", name: "Income Tax Department — notifications", url: "https://incometaxindia.gov.in/Pages/communications/notifications.aspx" },
  { area: "return_format", name: "e-Filing — ITR schemas & utilities", url: "https://www.incometax.gov.in/iec/foportal/downloads" },
  { area: "gst", name: "CBIC GST — notifications", url: "https://cbic-gst.gov.in/central-tax-notifications.html" },
  { area: "due_date", name: "GST portal — news & updates", url: "https://www.gst.gov.in/newsandupdates" },
  { area: "corporate", name: "MCA — notifications & circulars", url: "https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/notifications.html" },
  { area: "depreciation", name: "Income-tax Rules — Appendix I depreciation rates", url: "https://incometaxindia.gov.in/Pages/rules/income-tax-rules-1962.aspx" },
  { area: "return_format", name: "GST portal — offline tools & return JSON formats", url: "https://www.gst.gov.in/download/returns" },
  { area: "property", name: "TN Registration Dept — guideline values & stamp duty", url: "https://tnreginet.gov.in/portal/" },
  { area: "property", name: "Income Tax — TDS on property (Form 26QB)", url: "https://incometaxindia.gov.in/Pages/i-am/nri/tds-on-sale-of-property.aspx" },
];

/**
 * Rule keys the calculations actually read [§50]. A proposal for one of these is tested by running the
 * calculation with the old and new value on a sample, so approval sees the real effect.
 */
export const CALC_RULES: Record<string, { label: string; min: number; max: number; sample: (v: number) => string }> = {
  "tax.hp_interest_cap": { label: "House-property interest / loss cap (₹)", min: 0, max: 10_000_000, sample: (v) => `Rent 3,00,000, interest 4,00,000 → house property ${Math.max(-v, 300000 * 0.7 - 400000).toLocaleString("en-IN")}` },
  "cg.equity_months": { label: "Long-term holding for listed shares/equity funds (months)", min: 1, max: 120, sample: (v) => `Held 13 months → ${13 > v ? "long-term" : "short-term"}` },
  "cg.other_months": { label: "Long-term holding for property/other assets (months)", min: 1, max: 120, sample: (v) => `Held 20 months → ${20 > v ? "long-term" : "short-term"}` },
  "loss.carry_years": { label: "Years a business loss can be carried forward", min: 1, max: 20, sample: (v) => `Loss from 8 years ago → ${8 <= v ? "still available" : "expired"}` },
};
/** Approved value of a calculation rule on a date, else the built-in default. */
export function calcValue(rules: RuleVersion[] | undefined, key: keyof typeof CALC_RULES | string, date: string, fallback: number): number {
  const r = rules ? ruleOn(rules, key, date) : null;
  const n = r ? Number(r.value.replace(/[,₹\s]/g, "")) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Rule in force for a key on a date: the active version whose window contains it [§50, test 14]. */
export function ruleOn(rules: RuleVersion[], key: string, date: string): RuleVersion | null {
  return rules.filter((r) => r.key === key && r.status !== "proposed" && r.status !== "rejected" && r.effectiveFrom <= date && (!r.effectiveTo || r.effectiveTo >= date))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

/** A newly detected change enters as "proposed", compared with what it would replace [test 13]. */
export function proposeRule(rules: RuleVersion[], r: Omit<RuleVersion, "status" | "tests">): { rules: RuleVersion[]; previous: RuleVersion | null; duplicate: boolean } {
  const duplicate = rules.some((x) => x.key === r.key && x.effectiveFrom === r.effectiveFrom && x.value === r.value);
  if (duplicate) return { rules, previous: null, duplicate };
  const previous = ruleOn(rules, r.key, r.effectiveFrom);
  return { rules: [...rules, { ...r, status: "proposed", tests: [] }], previous, duplicate };
}

/** Validation: source, dates and value present; ambiguity must be resolved before activation. */
export function validateRule(r: RuleVersion): { name: string; passed: boolean }[] {
  return [
    { name: "Has an official source link", passed: /^https:\/\/[^ ]+\.(gov\.in|nic\.in)(\/|$)/.test(r.sourceUrl) },
    { name: "Effective date on or after publication", passed: r.effectiveFrom >= r.publishedOn || r.publishedOn === "" },
    { name: "Value stated", passed: r.value.trim().length > 0 },
    { name: "No open ambiguity", passed: !r.ambiguity?.trim() },
    ...substantive(r),
  ];
}
function substantive(r: RuleVersion): { name: string; passed: boolean }[] {
  const c = CALC_RULES[r.key];
  if (!c) return [];
  const n = Number(r.value.replace(/[,₹\s]/g, ""));
  const ok = Number.isFinite(n) && n >= c.min && n <= c.max;
  return [{ name: ok ? `Calculation check: ${c.sample(n)}` : `Value must be a number between ${c.min} and ${c.max} for ${c.label}`, passed: ok }];
}

/** Activating closes the previous version the day before; earlier years keep their old rule [§50]. */
export function activateRule(rules: RuleVersion[], id: string, today: string): RuleVersion[] {
  const r = rules.find((x) => x.id === id);
  if (!r || r.status !== "proposed") throw new Error("Only a proposed rule can be activated");
  const tests = validateRule(r);
  if (tests.some((t) => !t.passed)) throw new Error("Fix the failing checks before activating");
  const dayBefore = new Date(Date.parse(r.effectiveFrom) - 864e5).toISOString().slice(0, 10);
  return rules.map((x) => {
    if (x.id === id) return { ...x, status: "active", approvedOn: today, tests };
    if (x.key === r.key && x.status === "active" && x.effectiveFrom < r.effectiveFrom && (!x.effectiveTo || x.effectiveTo >= r.effectiveFrom)) return { ...x, effectiveTo: dayBefore, status: "superseded" };
    return x;
  });
}

/** Form version for a period: e.g. ITR forms are notified per assessment year [§51, test 15]. */
export interface FormVersion { form: string; assessmentYear: string; schemaVersion: string; source: string }
export const FORM_VERSIONS: FormVersion[] = [
  { form: "ITR-1", assessmentYear: "2025-26", schemaVersion: "AY2025-26 v1.0", source: "CBDT-notified form — confirm version on the e-Filing portal" },
  { form: "ITR-3", assessmentYear: "2025-26", schemaVersion: "AY2025-26 v1.0", source: "CBDT-notified form — confirm version on the e-Filing portal" },
  { form: "ITR-6", assessmentYear: "2025-26", schemaVersion: "AY2025-26 v1.0", source: "CBDT-notified form — confirm version on the e-Filing portal" },
  { form: "ITR-1", assessmentYear: "2024-25", schemaVersion: "AY2024-25 v1.1", source: "CBDT-notified form — confirm version on the e-Filing portal" },
  { form: "ITR-3", assessmentYear: "2024-25", schemaVersion: "AY2024-25 v1.1", source: "CBDT-notified form — confirm version on the e-Filing portal" },
  { form: "ITR-6", assessmentYear: "2024-25", schemaVersion: "AY2024-25 v1.1", source: "CBDT-notified form — confirm version on the e-Filing portal" },
];
/** Assessment year for a financial year. */
export const ayOf = (fy: string) => { const s = Number(fy.slice(0, 4)) + 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };
/** Form for an entity kind; a later AY with no notified form says so instead of reusing silently. */
export function formFor(kind: string, hasBusiness: boolean, fy: string): { form: string; version: FormVersion | null; note: string } {
  const form = kind === "company" ? "ITR-6" : kind === "individual" && !hasBusiness ? "ITR-1" : kind === "llp" || kind === "partnership" ? "ITR-5" : kind === "trust" ? "ITR-7" : "ITR-3";
  const ay = ayOf(fy);
  const version = FORM_VERSIONS.find((v) => v.form === form && v.assessmentYear === ay) ?? null;
  return { form, version, note: version ? `${form} for AY ${ay} (${version.schemaVersion}, ${version.source})` : `${form} for AY ${ay} has not been added yet — the draft is a working only` };
}

/** Official return format registry [rank 6]: a draft is "validated" only against a pinned official schema. */
export interface ReturnSchema { form: string; period: string; entityKinds: string[]; source: string; schemaHash: string | null }
export const RETURN_SCHEMAS: ReturnSchema[] = [
  ...FORM_VERSIONS.map((v) => ({ form: v.form, period: v.assessmentYear, entityKinds: v.form === "ITR-6" ? ["company"] : ["individual", "proprietorship", "huf"], source: v.source, schemaHash: null })),
  { form: "GSTR-1", period: "any", entityKinds: ["company", "llp", "partnership", "proprietorship"], source: "GSTN offline tool JSON — pin version before validating", schemaHash: null },
  { form: "GSTR-3B", period: "any", entityKinds: ["company", "llp", "partnership", "proprietorship"], source: "GSTN offline tool JSON — pin version before validating", schemaHash: null },
];
export type DraftStatus = { status: "validated" | "working" | "unsupported"; label: string; problems: string[] };
/** Checks a return draft against the registry; unsupported or unpinned schemas never count as validated. */
export function validateReturnDraft(form: string, period: string, entityKind: string, draft: Record<string, unknown> | null, required: string[] = []): DraftStatus {
  const s = RETURN_SCHEMAS.find((r) => r.form === form && (r.period === period || r.period === "any") && r.entityKinds.includes(entityKind));
  const registered = RETURN_SCHEMAS.some((r) => r.form === form && (r.period === period || r.period === "any"));
  if (!s && registered) return { status: "unsupported", label: `${form} does not apply to a ${entityKind}`, problems: ["Wrong taxpayer type"] };
  if (!s) return { status: "unsupported", label: `${form} for ${period} is not registered — working draft only`, problems: ["No registered format"] };
  const problems = required.filter((k) => draft?.[k] == null || draft[k] === "").map((k) => `Missing ${k}`);
  if (!s.schemaHash) return { status: "working", label: "Working draft — not validated (official format not pinned)", problems };
  return problems.length ? { status: "working", label: "Working draft — has missing fields", problems } : { status: "validated", label: `Checked against ${s.source}`, problems };
}
