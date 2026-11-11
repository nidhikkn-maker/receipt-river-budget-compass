# Application-wide money formatting cleanup: plan (KK approved, 11 Nov 2026)

**When:** after the current WS-E (7067076) and WS-F1 frozen-candidate acceptance checkpoints. Frozen commits are not changed.

**Priority:** below accounting correctness and security. This work must not delay or alter a financial or security fix.

## Rules
1. All user-facing amounts use the shared formatter: `money()` / `wholeRupees()` in `src/lib/expenses.ts` (CONTRACTS §1). This covers Home, Money, Records, Travel, Investments, Reports, Tax, Smart Add, notifications and the financial assistant (MCP tools).
2. Stored monetary values, transaction identities, calculations, exchange rates and historical records are not changed.
3. `toFixed` (or equivalent) used in statement identity signatures and source references stays as it is: `statement-pipeline/apply.ts:11`, `:157`, `statement-fingerprint.ts` and any other identity builder.
4. CSV, Excel and structured exports keep machine-readable numbers (no currency symbol, no grouping).
5. Precision: paise for postings, balances and claim figures. Whole rupees only where the screen is a deliberate summary and says so. Indian digit grouping for INR; each currency's own formatting for foreign amounts.
6. Negative values, refunds, zero amounts and multi-currency figures are shown consistently (one sign convention, decided once and tested).
7. Guard test: a vitest check that fails on new hand-built money in user-facing code. Patterns: `` `₹${ ``, `"₹" +`, `toLocaleString("en-IN"` on amounts, and `toFixed(2)` inside user-facing strings. It applies to src/components, src/routes, src/lib/**/*message*, notification and assistant text. Explicit exceptions sit in an allowlist file, each with a reason: non-display calculations, identity signatures, structured exports.
8. Layout check: iPhone 15, iPad Pro 11 and 1440×900 captures of the affected screens, with no horizontal overflow from longer formatted amounts.

## Ownership (Track A scan at 63b3d84; each track changes only its own files)

| Owner | Files (line refs at 63b3d84) |
|---|---|
| Track A | Done at 63b3d84: store.tsx, statement-pipeline/match.ts, draft-match.ts, asset-disposal.ts. Remaining: receipt-reading.ts:113, 119, 164; duplicate-compare.ts:27; statement-crosscheck.ts:14; books/reconciliation-exceptions.ts:38, 39, 47; books/gst-reconciliation.ts:40; books/audit.ts:40, 68, 131, 135 |
| Track C (Money, Inbox) | allocation.ts:108, 127; position.ts:90, 92, 93; statement-auto.ts:166; inbox.ts:80, 81; autopilot.ts:54; rules-engine.ts:88; reimbursements.ts:61; monthly-review.ts:35–37; stress.ts:123, 126, 127; projection.ts:51, 54, 55 |
| Shared (lead review) | intelligence.ts:91, 96, 102, 105, 110, 118, 289, 293; search.ts:187, 201; graph.ts:23; notification-centre.ts:50 |
| Assistant / MCP | mcp/tools/upcoming-payments.ts:19, list-accounts.ts:23, list-transactions.ts:37, spending-summary.ts:28 |
| WS-F1 (Travel) | travel.ts:116, 118, 169, 170, 174, 175 (next candidate, not the frozen one) |
| WS-E / Books | books/tax-workpaper.ts:60–62; fund-statement.ts:28; taxcomp.ts:56, 63; from-entities.ts:60; market.ts:180; investment-alerts.ts:11; itr-handoff.ts:37; property.ts:155; regulatory.ts:25; bonds.ts:40 |
| Leave as is (structured) | CSV/report numeric columns in reports.ts, travel-reports.ts, reconciliation-report.ts, books/corporate-statements.ts, expenditure-statement.ts; expenses.ts:305 (the formatter's own fallback) |

## Acceptance
Each track lands its share with tests on the exact display strings. The guard test lands last, with an empty allowlist apart from documented exceptions. The combined change goes into one frozen integration candidate and is verified with the standard acceptance runner, plus the three-device captures.
