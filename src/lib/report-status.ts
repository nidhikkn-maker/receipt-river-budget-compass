/** v6.0 §72 required reports: status, supporting evidence and the tests that prove them.
 * Mirrors docs/DELIVERABLES.md; report-status.test.ts checks every listed file really exists. */
export type ReportState = "done" | "partial" | "blocked";
export interface RequiredReport {
  n: number; title: string; state: ReportState; summary: string;
  /** In-app page holding the live evidence. */
  page?: { to: string; label: string } | undefined;
  evidence: string[]; tests: string[]; waitingOn?: string | undefined;
}

export const REQUIRED_REPORTS: RequiredReport[] = [
  { n: 1, title: "Existing System Audit", state: "done", summary: "Independent re-read of both specifications.", evidence: [".lovable/requirements/audit-2026-11-06.md", "docs/MASTER_REQUIREMENTS.md"], tests: [] },
  { n: 2, title: "Statement Desk Integration Report", state: "done", summary: "One upload path with identity and balance checks.", page: { to: "/statements", label: "Statement Desk" }, evidence: ["docs/IMPLEMENTATION_PROGRESS.md"], tests: ["src/lib/statement-pipeline"] },
  { n: 3, title: "DocuRepo Implementation Report", state: "done", summary: "Document search, company-tagged sharing and member uploads.", page: { to: "/vault", label: "Documents" }, evidence: ["src/lib/books/docrepo.ts", "drizzle/migrations"], tests: ["src/lib/books/docrepo-search.test.ts", "src/lib/books/entity-upload-sql.test.ts"] },
  { n: 4, title: "Document Extraction Accuracy Report", state: "partial", summary: "Reading rules tested; accuracy on your real scans not yet reviewed.", page: { to: "/vault", label: "Documents" }, evidence: ["src/lib/books/asset-read.ts"], tests: ["src/lib/books/asset-read.test.ts", "src/lib/books/fund-statement.test.ts"], waitingOn: "Your review of real scanned documents" },
  { n: 5, title: "Entity Onboarding Verification", state: "done", summary: "Company and person profiles with PAN/GSTIN checks.", page: { to: "/entities", label: "Companies & years" }, evidence: ["src/lib/entities.ts"], tests: ["src/lib/books/books.test.ts", "src/lib/books/typed-intake-sql.test.ts"] },
  { n: 6, title: "Previous-Year Financial Import Verification", state: "done", summary: "Prior-year schedules with source evidence.", page: { to: "/entities", label: "Companies & years" }, evidence: ["src/lib/books/fy.ts"], tests: ["src/lib/books/books.test.ts", "src/lib/books/opening-sql.test.ts"] },
  { n: 7, title: "Opening Balance Reconciliation", state: "done", summary: "Dated opening entries posted atomically with undo.", page: { to: "/entities", label: "Companies & years" }, evidence: ["src/lib/books/fy.ts"], tests: ["src/lib/books/opening-sql.test.ts"] },
  { n: 8, title: "Asset Register Verification", state: "done", summary: "Asset register with QR/barcode physical checks.", page: { to: "/assets", label: "Property & assets" }, evidence: ["src/lib/assets.ts"], tests: ["src/lib/books/asset-read.test.ts", "src/lib/books/asset-verification.test.ts"] },
  { n: 9, title: "Depreciation Verification", state: "done", summary: "Book and tax depreciation, monthly preparation, closed-year freeze.", page: { to: "/assets", label: "Property & assets" }, evidence: ["src/lib/books/assets-ledger.ts"], tests: ["src/lib/books/scheduled-depreciation.test.ts", "src/lib/books/frozen-registers-sql.test.ts"] },
  { n: 10, title: "Property Management Verification", state: "done", summary: "Properties, leases and costs.", page: { to: "/assets", label: "Property & assets" }, evidence: ["src/lib/books/property.ts"], tests: ["src/lib/books/books.test.ts"] },
  { n: 11, title: "Rental Reconciliation", state: "done", summary: "Rent matched separately from deposits.", page: { to: "/assets", label: "Property & assets" }, evidence: ["src/lib/books/property.ts"], tests: ["src/lib/books/books.test.ts", "src/lib/books/v6-final.test.ts"] },
  { n: 12, title: "Demat Import Verification", state: "done", summary: "Demat statements imported once, events retained.", page: { to: "/wealth", label: "Wealth" }, evidence: ["src/lib/books/market.ts"], tests: ["src/lib/books/investment-events-sql.test.ts", "src/lib/books/books.test.ts"] },
  { n: 13, title: "Regulatory Intelligence Test Report", state: "done", summary: "Official pages watched; rules change only after approval.", page: { to: "/tax", label: "Income Tax & GST" }, evidence: ["src/lib/books/rule-watch.ts"], tests: ["src/lib/books/rule-watch.test.ts"] },
  { n: 14, title: "Tax/GST Preparation Verification", state: "done", summary: "Working drafts for tax and GST; final filing format pending.", page: { to: "/tax", label: "Income Tax & GST" }, evidence: ["src/lib/books/tax-full.ts"], tests: ["src/lib/books/tax-regression.test.ts", "src/lib/books/compliance.test.ts"] },
  { n: 15, title: "Continuous Audit Report", state: "done", summary: "Read-only findings that clear when records are fixed.", page: { to: "/audit", label: "Audit dashboard" }, evidence: ["src/lib/books/audit.ts"], tests: ["src/lib/books/recon-extra.test.ts", "src/lib/books/recon.test.ts"] },
  { n: 16, title: "Financial Integrity Report", state: "done", summary: "Ledger invariants and source-to-report traceability.", page: { to: "/audit", label: "Audit dashboard" }, evidence: ["src/lib/ledger.ts"], tests: ["src/lib/books/books.test.ts"] },
  { n: 17, title: "Security and Permissions Report", state: "done", summary: "Role and company access enforced in the database.", page: { to: "/settings", label: "Settings" }, evidence: ["drizzle/migrations"], tests: ["src/lib/books/entity-access-sql.test.ts", "src/lib/books/entity-transactions-sql.test.ts"] },
  { n: 18, title: "Responsive Design Screenshots", state: "partial", summary: "Phone and tablet layouts checked in a browser.", evidence: ["docs/VERIFICATION_RESULTS.md"], tests: [], waitingOn: "A check on your own iPhone and iPad" },
  { n: 19, title: "Exception Register", state: "done", summary: "Open blockers recorded with their owner.", evidence: ["docs/OPEN_BLOCKERS.md"], tests: [] },
  { n: 20, title: "Deployment Readiness Report", state: "partial", summary: "All tests pass; licensed prices and final filing format still pending.", page: { to: "/wealth", label: "Wealth (manual prices)" }, evidence: ["docs/VERIFICATION_RESULTS.md", "docs/DELIVERABLES.md"], tests: ["src/lib/books/price-overrides.test.ts"], waitingOn: "Licensed price provider and final ITR format" },
];

export function reportCounts(list: RequiredReport[] = REQUIRED_REPORTS) {
  return { done: list.filter((r) => r.state === "done").length, partial: list.filter((r) => r.state === "partial").length, blocked: list.filter((r) => r.state === "blocked").length, total: list.length };
}
