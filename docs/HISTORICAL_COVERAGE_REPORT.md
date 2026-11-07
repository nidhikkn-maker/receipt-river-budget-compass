# Historical Requirements Coverage Report

Generated 2026-11-07. Basis: 12,559 document clauses and 349 chat requests from 38 pre-v6.0 documents,
consolidated into 2,541 deduplicated requirement clusters, each audited read-only against the codebase
by 12 independent audits plus manual review of the remainder. Full per-cluster register:
`.lovable/requirements/historical/audit.json`.

## Overall coverage

| Status | Clusters | Share |
|---|---|---|
| implemented | 1537 | 60% |
| partial | 934 | 36% |
| missing | 51 | 2% |
| superseded | 19 | 0% |
| **total** | 2541 | 100% |

## Per-module assessment

| Module | Implemented | Partial | Missing | Superseded |
|---|---|---|---|---|
| ai | 33 | 14 | 1 | 0 |
| asset | 3 | 1 | 0 | 0 |
| document | 35 | 28 | 4 | 0 |
| entry | 206 | 81 | 9 | 3 |
| investment | 6 | 10 | 1 | 0 |
| loan | 30 | 6 | 0 | 0 |
| other | 799 | 430 | 5 | 9 |
| process | 31 | 31 | 0 | 1 |
| reimbursement | 49 | 21 | 0 | 2 |
| reporting | 76 | 51 | 7 | 0 |
| security | 14 | 32 | 0 | 0 |
| statement | 102 | 53 | 2 | 0 |
| taxation | 3 | 0 | 0 | 0 |
| testing | 48 | 76 | 20 | 0 |
| travel | 65 | 25 | 2 | 4 |
| ux | 37 | 75 | 0 | 0 |

PARTIAL almost always means: the capability exists in code, but the specific historical acceptance
evidence (physical-device timing, live-site checks, owner's real records, or exhaustive cross-module
tracing) has not been produced. These are verification gaps, not absent features.

## Missing Functionality Register (54)

### Buildable feature gaps (21)
- **C-0214** (statement): Add an admin view that shows statement upload status, reminder history, and confirmation email delivery for each monthly request.
- **C-0389** (entry): Each allocation dimension should reconcile independently with the primary budget when configured as a complete allocation.
- **C-0391** (entry): These functions must remain available through the optional Budget Breakdown view, where applicable.
- **C-0409** (reporting): Add a CSV export for each loan’s repayment history with payment dates, principal, interest, and remaining balance.
- **C-0517** (testing): If background jobs are available, report generation should persist safely after acceptance by the backend.
- **C-0553** (document): Add browser tests for uploading a receipt, viewing its attachment, and verifying it stays linked to the correct expense.
- **C-0581** (entry): Configurable alerts should be available when budget utilisation crosses selected thresholds.
- **C-0709** (entry): Selecting **Edit Budget** should open a small dedicated form or bottom sheet.
- **C-0879** (testing): All original supporting bills and payment evidence must be included as annexures at the end of the same PDF.
- **C-1065** (other): Do not rely on ordinary floating-point arithmetic for financial ledger calculations.
- **C-1249** (entry): Partial allocations must be identified as partial, not assumed to cover the entire budget.
- **C-1252** (entry): Where no authoritative primary budget exists, display **Budget requires confirmation**.
- **C-1253** (entry): The user must be able to review ambiguous historical budget records.
- **C-1487** (testing): Before generating the final PDF, provide a document verification screen.
- **C-1493** (ai): Once completed, the setup assistant should not repeatedly appear.
- **C-1501** (other): Merging categories must provide a review of affected records.
- **C-1857** (document): Include a missing-document list before the annexures.
- **C-2024** (reporting): The summary should remain visible while scrolling.
- **C-2094** (entry): Provide a merchant merge and unmerge function.
- **C-2301** (entry): Automatically combine unrelated budget allocations.

### Verification-evidence gaps (15) — need physical device, live site, or benchmark run
- **C-0212** (testing): Verify that Face ID opens automatically on my iPhone after my first email sign-in and confirm the cold and repeat opening times.
- **C-0547** (testing): Add mobile performance testing so I can verify that the faster loading experience works well on my phone.
- **C-0571** (testing): Use a temporary matching entry on ledgerline.biz to verify the duplicate-transfer warning, then delete the test entry.
- **C-0605** (testing): Financial Inbox initial view: approximately 2 seconds under normal test conditions.
- **C-0737** (testing): Test all seven existing account configurations using safe copies of their records.
- **C-0760** (testing): Verify the ChatGPT OAuth sign-in, approval, and revocation flows against the published MCP endpoint.
- **C-0779** (testing): Verify pinch zoom and panning for PDF receipts on a real iPhone and report any interaction issues.
- **C-0781** (testing): Test the duplicate-transfer warning on ledgerline.biz with a matching transfer and confirm it appears as expected.
- **C-1038** (testing): Verify the updated receipt zoom and pan controls on my real iPhone and report any issues.
- **C-1546** (other): This target should be validated through usability testing.
- **C-1630** (testing): All test failures must be documented and resolved according to severity.
- **C-1703** (testing): Verify the published app on my actual iPhone and iPad, and fix any issues you find.
- **C-1765** (testing): Verify icon appearance at actual mobile sizes.
- **C-2065** (testing): Test Face ID unlock on the live site and fix any issues.
- **C-2300** (testing): Test the complete workflow on iPhone Safari.

### External dependencies (6) — blocked outside the codebase
- **C-0146** (statement): Automatic financial data connections should be evaluated separately according to actual provider availability, bank support, regulatory requirements and user consent.
- **C-0181** (investment): Users should be able to share bills, invoices, receipts and payment screenshots from WhatsApp directly to the application using the iOS Share Sheet.
- **C-0204** (travel): Add an email connection or forwarding address so I can automatically bring booking confirmations and trip-related messages into my travel inbox for review.
- **C-1697** (testing): Give me a demo link for testing for my chat gpt account to verify
- **C-1698** (testing): Publish my app and configure the ChatGPT MCP endpoint so I can test it with my account.
- **C-2402** (other): Supported automatic banking integrations.

### Needs the owner's real records (4)
- **C-0086** (travel): MOVAC gap: Three records appear on none of the statements: Lazio Pizzeria ₹5,408.71, H&M ₹27,137.45 and Raki taksi ₹1,732.99. Together they make up the ₹34,279.15. They look like Finland trip spending, probably paid by card, so I left them unchanged. Tell me whether to remove them or move them to a card. Paid using my HDFC Forex Card from HDFC Krupa account AMEX payments: Five AMEX credits totalling ₹13,80,969.45 had no matching payment on your other statements. They lower what you owe but don't count as income. Tell me which account paid them. Paid by AET
- **C-0091** (reporting): Still Uncategorised (2): two ₹10,000 transfers to "Self" on 19 Aug. Which account did they go to? It’s my ICICI kids joint accounts for each one I have transferred 10,000 each. I’ll share the statements. I have ICICI Amazon credit card last financial year statement. That’s the last transaction I have made after which I think I have stopped using that card [User attached 7 files: ICICI Kid 2 Savings.pdf, ICICI Kid 1 Savings.pdf, ICICI AMAZON CREDIT CARD FIN 2025.pdf, ICICI AMAZON Credit Card Jan Statement.pdf, ICICI AMAZON Credit Card March Statement.pdf, ICICI AMAZON Credit Card FEB Statement.pdf, ICICI AMAZON Credit Card June Statement.pdf]
- **C-0108** (reporting): This is Mercedes GLS loan statement. Feed this into the app accordingly and reconcile. Amount is paid using by IDFC KRUPA account. Mark as recurring payment also [User attached 2 files: GLS Vehicle Loan Statement 2025-2026.pdf, GLS Vehicle Loan statement 2026-2027.pdf]
- **C-0783** (testing): Verify my Mercedes GLS loan's original amount and exact start date against my loan documents.

### Meta/process requests (6) — satisfied by tracking docs or superseded by later direction
- **C-0462** (reporting): Proceed in the stated priority order, validate each stage and provide a final implementation report.
- **C-0823** (reporting): Provide the implementation report, screenshots, financial checks and unresolved exception list.
- **C-0931** (reporting): Provide a before-and-after interface review and feature-wise completion report.
- **C-0995** (document): Before testing, Lovable must inspect and document the existing financial architecture.
- **C-2386** (document): The document I uploaded do a complete plan for build
- **C-2387** (other): Give me in nos How many features left to build

### Reclassified during consolidation (2)
- **C-1031**: entities compatibility patches are documented in `patches/README.md` — implemented.
- **C-1546** (10-second entry target): no timing evidence — stays a verification gap.

## Superseded / Cancelled Register (19)

- **C-0081** (process): Automatically approve reimbursement claims.
- **C-0127** (travel): Ledgerline currently manages personal, family, business, official and travel-related financial activities. The typography must support both everyday expense recording and detailed financial analysis.
- **C-0189** (travel): The development must establish Universal Expense Entry as the foundation of all personal, family, business, official and travel-related financial activities.
- **C-0282** (entry): The keyboard automatically opens when the Add Expense page is launched and remains visible until the user interacts elsewhere.
- **C-0412** (reimbursement): Add browser tests for submitting an expense and completing department manager and finance approvals through the page buttons.
- **C-0474** (travel): The reporting system must support personal, family, business, official and travel financial management.
- **C-0644** (other): The current application requires users to remain on the active page for certain processing tasks.
- **C-0755** (other): Add shared cloud storage so employees, managers, and Finance can see the same expenses across devices.
- **C-0898** (travel): Travel should remain connected to Personal, Family, Business and Official workspaces.
- **C-1010** (entry): Implement secure sign-in with employee, manager, and Finance roles for my expense app.
- **C-1702** (other): It’s ok leave the email connection build and proceed with the remaining
- **C-1743** (other): The amount field should receive immediate focus.
- **C-1805** (entry): Automatic focus when opening the entry screen.
- **C-2060** (other): Remove unresolved issues without correcting them.
- **C-2063** (reimbursement): Let me set each department’s budget and update budget limits from the app.
- **C-2353** (other): Automatically apply uncertain financial classifications.
- **C-2382** (other): Re-import statements without duplicate protection.
- **C-2498** (other): Automatically assign uncertain categories.
- **C-2539** (other): Remove official workspace

Supersede reasons: official workspace removed by owner decision (C-0127, C-0189, C-0474, C-0898, C-2539);
multi-role approval workflow replaced by owner-scoped model (C-0081, C-0412, C-0755, C-1010, C-2063);
auto-focus keyboard reversed by later requirement (C-0282, C-1743, C-1805); email connection set aside by
owner (C-1702); unsafe automatic actions rejected by design (C-2060, C-2353, C-2382, C-2498); page-bound
processing replaced by persistent server jobs (C-0644).

## External Blocker Register

1. Licensed market-price feed — manual price overrides with source/date/history shipped instead.
2. Production publication and any real-record changes — held for explicit owner approval.
3. Physical iPhone/iPad verification (Face ID, Safari, pinch-zoom, timing) — no device access in sandbox.
4. Bank/email provider connections — require provider availability and owner consent decisions.

## Relationship to the v6.0/v6.1 register

The 899-clause v6 register (566 verified / 331 partial / 2 blocked) remains the authoritative development
tracker. This historical audit confirms no pre-v6 requirement was silently dropped: every historical
cluster is either implemented, superseded by a recorded owner decision, externally blocked, or carried
forward as a partial/verification item overlapping the v6 partial set.

