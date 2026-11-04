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
];

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
  ];
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
  { form: "ITR-1", assessmentYear: "2025-26", schemaVersion: "AY2025-26 v1.0", source: "CBDT Notification 40/2025" },
  { form: "ITR-3", assessmentYear: "2025-26", schemaVersion: "AY2025-26 v1.0", source: "CBDT Notification 42/2025" },
  { form: "ITR-6", assessmentYear: "2025-26", schemaVersion: "AY2025-26 v1.0", source: "CBDT Notification 43/2025" },
  { form: "ITR-1", assessmentYear: "2024-25", schemaVersion: "AY2024-25 v1.1", source: "CBDT Notification 105/2023" },
  { form: "ITR-3", assessmentYear: "2024-25", schemaVersion: "AY2024-25 v1.1", source: "CBDT Notification 19/2024" },
  { form: "ITR-6", assessmentYear: "2024-25", schemaVersion: "AY2024-25 v1.1", source: "CBDT Notification 19/2024" },
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
