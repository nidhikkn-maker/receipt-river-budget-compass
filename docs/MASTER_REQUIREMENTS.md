# Ledgerline v6.0 + v6.1 master requirements register

Generated from `.lovable/requirements/register.json`; edit the register, then run `python3 scripts/requirements/render_docs.py`.
Status rule: VERIFIED COMPLETE only with connected code, enforced security, executed tests and recorded evidence. NOT AUDITED means the individual clause has not yet been assessed; MISSING means an audit found no implementation. PARTIAL retains the remaining development or verification work.

| Status | Count |
|---|---|
| BLOCKED | 2 |
| MISSING | 4 |
| PARTIAL | 404 |
| VERIFIED COMPLETE | 489 |


## v6.0 — Preamble

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0001 | 1 | LEDGERLINE v6.0 | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0002 | 3 | Autonomous Financial Operating System — Final Consolidated Development Specification | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0003 | 5 | Date: 4 November 2026 | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0004 | 6 | Platform: Lovable | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0005 | 7 | Application: Ledgerline | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0006 | 8 | Version: 6.0 | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0007 | 9 | Development status: Proposed implementation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0008 | 10 | Environment: Development and isolated testing only | PARTIAL |  | docs/VERIFICATION_RESULTS.md records hosted Cloud changes and a scheduled publish; no verified development-only isolation or production-deployment prohibition enforcement found. |
| V60-0009 | 11 | Production deployment: Not authorised | PARTIAL |  | docs/VERIFICATION_RESULTS.md records hosted Cloud changes and a scheduled publish; no verified development-only isolation or production-deployment prohibition enforcement found. |

## v6.0 — 1. VISION

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0010 | 15 | 1. VISION | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0011 | 17 | Develop Ledgerline into an intelligent, document-driven financial operating system that maintains continuously audit-ready accounts for individuals, families, p | PARTIAL |  | src/components/DocumentIntake.tsx, src/lib/books/intake.ts and books.test.ts support entity/document proposals; continuously audit-ready autonomous operation across every entity is not verified. |
| V60-0012 | 19 | The system must manage: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 1. Financial accounting.

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0013 | 21 | 1. Financial accounting. | PARTIAL |  | src/lib/books/depreciation.ts prepares accounting journals; src/lib/books/books.test.ts covers journal/ledger integrity rules, not the full financial accounting workflow. |
| V60-0014 | 22 | 2. Bank and credit card statements. | PARTIAL |  | src/routes/_authenticated/statements.tsx; src/lib/books/books.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0015 | 23 | 3. Income and expenses. | PARTIAL |  | src/routes/_authenticated/expenses.tsx; src/lib/reports.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0016 | 24 | 4. Financial reconciliation. | PARTIAL |  | src/lib/books/recon.ts; src/lib/books/recon.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0017 | 25 | 5. Investments and Demat holdings. | PARTIAL |  | src/lib/investments/demat.ts; src/lib/investments/demat.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0018 | 26 | 6. Assets and depreciation. | PARTIAL |  | src/lib/books/depreciation.ts; src/lib/books/books.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0019 | 27 | 7. Properties and rental management. | PARTIAL |  | src/lib/books/property.ts; src/lib/books/books.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0020 | 28 | 8. Loans and liabilities. | PARTIAL |  | src/lib/books/loan-balances.ts; src/lib/books/loan-balances.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0021 | 29 | 9. GST. | PARTIAL |  | src/lib/books/gst.ts; src/lib/books/books.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0022 | 30 | 10. Income tax. | PARTIAL |  | src/components/books/TaxWorkpaper.tsx; src/lib/books/tax-workpaper.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0023 | 31 | 11. Statutory compliance preparation. | PARTIAL |  | src/components/books/ItrHandoff.tsx; src/lib/books/itr-handoff.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0024 | 32 | 12. Continuous auditing. | PARTIAL |  | src/lib/books/evidence.ts; src/lib/books/evidence.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0025 | 33 | 13. Historical financial records. | PARTIAL |  | src/lib/books/fy.ts; src/lib/books/books.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0026 | 34 | 14. Financial reporting. | PARTIAL |  | src/lib/reports.ts; src/lib/reports.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0027 | 35 | 15. Financial forecasting. | PARTIAL |  | src/routes/_authenticated/forecast.tsx; forecast page exists; no focused forecasting verification located. |
| V60-0028 | 36 | 16. Documents and evidence. | PARTIAL |  | src/lib/documents.ts; src/lib/documents.test.ts covers component rules, not the full enumerated module workflow. |
| V60-0029 | 38 | The design objective is zero routine manual data entry. | PARTIAL |  | src/components/DocumentIntake.tsx proposes records from documents, but src/routes/_authenticated/entities.tsx and assets.tsx retain blank manual forms; zero routine entry/source-only operation is not verified. |
| V60-0030 | 40 | All supported information should be derived from uploaded documents, previously verified records, approved mappings and validated integrations. | PARTIAL |  | src/components/DocumentIntake.tsx proposes records from documents, but src/routes/_authenticated/entities.tsx and assets.tsx retain blank manual forms; zero routine entry/source-only operation is not verified. |
| V60-0031 | 42 | Manual intervention should normally be limited to exceptions, approvals and information unavailable from reliable sources. | PARTIAL |  | src/components/DocumentIntake.tsx proposes records from documents, but src/routes/_authenticated/entities.tsx and assets.tsx retain blank manual forms; zero routine entry/source-only operation is not verified. |
| V60-0032 | 44 | Do not fabricate missing information. | PARTIAL |  | src/lib/document-extract.functions.ts instructs printed-only extraction; src/lib/books/books.test.ts tests omitted schedules stay missing; AI non-fabrication on real documents remains unverified (docs/VERIFICATION_RESULTS.md). |
| V60-0033 | 48 | PART A — FUNDAMENTAL ARCHITECTURE | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 2. Statement Desk — single intake point

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0034 | 50 | 2. Statement Desk — single intake point | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0035 | 52 | The existing Statement Desk must remain Ledgerline’s single standard entry point for financial documents and information. | PARTIAL |  | src/routes/_authenticated/statements.tsx centralizes intake, but src/routes/_authenticated/new.tsx has a separate receipt capture/upload workflow; universal Statement Desk-only processing is not satisfied. |
| V60-0036 | 54 | Do not build competing upload centres within individual modules. | PARTIAL |  | src/routes/_authenticated/statements.tsx centralizes intake, but src/routes/_authenticated/new.tsx has a separate receipt capture/upload workflow; universal Statement Desk-only processing is not satisfied. |
| V60-0037 | 56 | Instead, every module’s Upload or Add from Document action must open Statement Desk with the relevant context already selected. | PARTIAL |  | src/routes/_authenticated/statements.tsx centralizes intake, but src/routes/_authenticated/new.tsx has a separate receipt capture/upload workflow; universal Statement Desk-only processing is not satisfied. |
| V60-0038 | 58 | Statement Desk must support: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0039 | 60 | * Bank statements. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0040 | 61 | * Credit card statements. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0041 | 62 | * Company incorporation documents. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0042 | 63 | * PAN and GST registration documents. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0043 | 64 | * Audited financial statements. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0044 | 65 | * Trial balances. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0045 | 66 | * Tax returns. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0046 | 67 | * GST returns. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0047 | 68 | * Invoices. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0048 | 69 | * Receipts. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0049 | 70 | * Contracts. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0050 | 71 | * Investment statements. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0051 | 72 | * ICICI Direct statements. | VERIFIED COMPLETE |  | src/lib/investments/demat.ts imports ICICI Direct holdings; src/lib/books/books.test.ts acceptance case 11 exercises ICICI import (focused run passed). |
| V60-0052 | 73 | * Demat holdings. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0053 | 74 | * Mutual fund statements. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0054 | 75 | * Loan statements. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0055 | 76 | * Property deeds. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0056 | 77 | * Lease agreements. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0057 | 78 | * Insurance documents. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0058 | 79 | * Asset purchase invoices. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0059 | 80 | * Depreciation schedules. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0060 | 81 | * Utility bills. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0061 | 82 | * Maintenance documents. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0062 | 83 | * Other supported financial and legal records. | PARTIAL |  | src/lib/documents.ts DOC_TYPES and src/lib/document-extract.functions.ts support this document family; src/components/DocumentIntake.tsx reviews/saves it; no real-document extraction/intake verification for this family (docs/VERIFICATION_RESULTS.md). |
| V60-0063 | 85 | The user should not need to select the document category if the system can identify it reliably. | PARTIAL |  | src/routes/_authenticated/statements.tsx and src/lib/document-extract.functions.ts identify document type automatically; classification reliability and confidence-based category bypass lack focused verification. |

## v6.0 — 3. Statement Desk processing sequence

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0064 | 87 | 3. Statement Desk processing sequence | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0065 | 89 | Every uploaded document must follow: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0066 | 91 | Upload → Identify → Extract → Validate → Match → Classify → Prepare Records → Confirm Where Required → Save → Reconcile → Audit | PARTIAL |  | src/lib/books/intake.ts STEPS and src/components/DocumentIntake.tsx trace processing; statements.tsx saves statement originals after posting and tolerates storage failure; complete universal sequence not verified. |
| V60-0067 | 93 | The process must be traceable. | VERIFIED COMPLETE |  | src/lib/books/intake.ts trail and src/components/DocumentIntake.tsx persisted runs expose stages/failures; src/lib/books/books.test.ts failed-step trail test passed. |
| V60-0068 | 95 | A failed step must not silently create partially completed financial records. | PARTIAL |  | src/components/DocumentIntake.tsx uses reviewed atomic record commit (intake-revision-sql.test.ts; docs/VERIFICATION_RESULTS.md), but statements.tsx posts before storing originals and catches storage failure; full financial-record/evidence atomicity is incomplete. |

## v6.0 — 4. No duplicated upload workflows

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0069 | 97 | 4. No duplicated upload workflows | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0070 | 99 | The user must be able to initiate an upload from any module, but the file must be processed through Statement Desk. | PARTIAL |  | src/routes/_authenticated/statements.tsx centralizes intake, but src/routes/_authenticated/new.tsx has a separate receipt capture/upload workflow; universal Statement Desk-only processing is not satisfied. |
| V60-0071 | 101 | Examples: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0072 | 103 | * Upload from Investments opens Statement Desk. | PARTIAL |  | src/components/books/MarketPanel.tsx links to /statements with the appropriate context; no focused module-to-intake route verification found. |
| V60-0073 | 104 | * Upload from Property Management opens Statement Desk. | PARTIAL |  | src/components/books/PropertyPanel.tsx links to /statements with the appropriate context; no focused module-to-intake route verification found. |
| V60-0074 | 105 | * Upload from Asset Management opens Statement Desk. | PARTIAL |  | src/routes/_authenticated/assets.tsx links to /statements with the appropriate context; no focused module-to-intake route verification found. |
| V60-0075 | 106 | * Upload from Tax & Audit opens Statement Desk. | PARTIAL |  | src/routes/_authenticated/tax.tsx links to /statements with the appropriate context; no focused module-to-intake route verification found. |
| V60-0076 | 108 | All use the same intake, extraction, deduplication and evidence services. | PARTIAL |  | src/routes/_authenticated/statements.tsx centralizes intake, but src/routes/_authenticated/new.tsx has a separate receipt capture/upload workflow; universal Statement Desk-only processing is not satisfied. |
| V60-0077 | 112 | PART B — DOCUREPO | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 5. Dedicated DocuRepo module

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0078 | 114 | 5. Dedicated DocuRepo module | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0079 | 116 | Create: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0080 | 118 | More → DocuRepo | PARTIAL |  | src/routes/_authenticated/vault.tsx renders DocuRepo; More-menu placement not verified by focused test or documented check. |
| V60-0081 | 120 | DocuRepo must be Ledgerline’s central document repository and evidence-management system. | VERIFIED COMPLETE |  | src/lib/documents.ts vaultItems unifies receipts and documents; src/components/books/VaultBooks.tsx supplies central repository views; src/lib/documents.test.ts combined-vault test passed. |
| V60-0082 | 122 | Every document processed through Statement Desk must be stored in DocuRepo with appropriate access controls. | PARTIAL |  | src/components/DocumentIntake.tsx uses reviewed atomic record commit (intake-revision-sql.test.ts; docs/VERIFICATION_RESULTS.md), but statements.tsx posts before storing originals and catches storage failure; full financial-record/evidence atomicity is incomplete. |
| V60-0083 | 124 | Do not create separate disconnected document stores for individual modules. | VERIFIED COMPLETE |  | src/lib/documents.ts vaultItems unifies receipts and documents; src/components/books/VaultBooks.tsx supplies central repository views; src/lib/documents.test.ts combined-vault test passed. |

## v6.0 — 6. Automatic document classification

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0084 | 126 | 6. Automatic document classification | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0085 | 128 | Identify: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0086 | 130 | * Document type. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0087 | 131 | * Legal entity. | VERIFIED COMPLETE |  | src/lib/books/intake.ts matchEntity uses PAN/CIN/GSTIN for entity matching; src/lib/books/v6-gaps.test.ts identifier-only and same-name suggestion tests passed. |
| V60-0088 | 132 | * Relevant individual. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0089 | 133 | * Organisation. | VERIFIED COMPLETE |  | src/lib/books/intake.ts matchEntity uses PAN/CIN/GSTIN for entity matching; src/lib/books/v6-gaps.test.ts identifier-only and same-name suggestion tests passed. |
| V60-0090 | 134 | * Financial year. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0091 | 135 | * Reporting period. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0092 | 136 | * Account. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0093 | 137 | * Related asset. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0094 | 138 | * Related property. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0095 | 139 | * Related investment. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0096 | 140 | * Related loan. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0097 | 141 | * Related transaction. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0098 | 142 | * Applicable tax registration. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0099 | 143 | * Expiry or renewal date. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0100 | 144 | * Relevant monetary values. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0101 | 146 | Automatically suggest a logical classification. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |
| V60-0102 | 148 | Only ask for confirmation when identity or classification is uncertain. | PARTIAL |  | src/lib/document-extract.functions.ts supplies type/fields/profiles and src/lib/books/intake.ts proposes classification/matches; automatic classification of this attribute and uncertainty-only confirmation have no focused real-document verification. |

## v6.0 — 7. Intelligent document extraction

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0103 | 150 | 7. Intelligent document extraction | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0104 | 152 | Extract available: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0105 | 154 | * Names. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0106 | 155 | * Addresses. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0107 | 156 | * Registration identifiers. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0108 | 157 | * Dates. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0109 | 158 | * Monetary amounts. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0110 | 159 | * Tax amounts. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0111 | 160 | * Account references. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0112 | 161 | * Asset details. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0113 | 162 | * Contract conditions. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0114 | 163 | * Payment terms. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0115 | 164 | * Interest rates. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0116 | 165 | * Depreciation information. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0117 | 166 | * Investment holdings. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0118 | 167 | * Financial statement values. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0119 | 168 | * Relevant obligations. | PARTIAL |  | src/lib/document-extract.functions.ts structured fields/profiles support this extraction attribute; no verified real-document extraction accuracy for this attribute (docs/VERIFICATION_RESULTS.md). |
| V60-0120 | 170 | Every extracted field must retain: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0121 | 172 | * Source document. | VERIFIED COMPLETE |  | src/lib/documents.ts DocField/VaultDoc retain source, locator, original/normalised values, confidence and status; src/components/DocumentIntake.tsx enforces locators; src/lib/books/tax-workpaper.test.ts provenance tests passed. |
| V60-0122 | 173 | * Page or section. | VERIFIED COMPLETE |  | src/lib/documents.ts DocField/VaultDoc retain source, locator, original/normalised values, confidence and status; src/components/DocumentIntake.tsx enforces locators; src/lib/books/tax-workpaper.test.ts provenance tests passed. |
| V60-0123 | 174 | * Original extracted value. | VERIFIED COMPLETE |  | src/lib/documents.ts DocField/VaultDoc retain source, locator, original/normalised values, confidence and status; src/components/DocumentIntake.tsx enforces locators; src/lib/books/tax-workpaper.test.ts provenance tests passed. |
| V60-0124 | 175 | * Normalised value. | VERIFIED COMPLETE |  | src/lib/documents.ts DocField/VaultDoc retain source, locator, original/normalised values, confidence and status; src/components/DocumentIntake.tsx enforces locators; src/lib/books/tax-workpaper.test.ts provenance tests passed. |
| V60-0125 | 176 | * Confidence. | VERIFIED COMPLETE |  | src/lib/documents.ts DocField/VaultDoc retain source, locator, original/normalised values, confidence and status; src/components/DocumentIntake.tsx enforces locators; src/lib/books/tax-workpaper.test.ts provenance tests passed. |
| V60-0126 | 177 | * Verification status. | VERIFIED COMPLETE |  | src/lib/documents.ts DocField/VaultDoc retain source, locator, original/normalised values, confidence and status; src/components/DocumentIntake.tsx enforces locators; src/lib/books/tax-workpaper.test.ts provenance tests passed. |

## v6.0 — 8. Document relationships

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0127 | 179 | 8. Document relationships | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0128 | 181 | A document may relate to multiple records. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts addLink/linksOf and src/lib/books/types.ts DocLink share one docId across records without copying files; src/lib/books/docrepo-search.test.ts and tax-workpaper.test.ts linked-document tests passed. |
| V60-0129 | 183 | For example, a vehicle purchase invoice may link to: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0130 | 185 | * Asset register. | PARTIAL |  | src/lib/books/types.ts LinkKind and src/lib/books/docrepo.ts addLink support shared record associations; automatic vehicle-invoice linkage to this specific record has no focused verification. |
| V60-0131 | 186 | * Supplier. | PARTIAL |  | src/lib/books/types.ts LinkKind and src/lib/books/docrepo.ts addLink support shared record associations; automatic vehicle-invoice linkage to this specific record has no focused verification. |
| V60-0132 | 187 | * Bank/card payment. | PARTIAL |  | src/lib/books/types.ts LinkKind and src/lib/books/docrepo.ts addLink support shared record associations; automatic vehicle-invoice linkage to this specific record has no focused verification. |
| V60-0133 | 188 | * Loan. | PARTIAL |  | src/lib/books/types.ts LinkKind and src/lib/books/docrepo.ts addLink support shared record associations; automatic vehicle-invoice linkage to this specific record has no focused verification. |
| V60-0134 | 189 | * Insurance. | PARTIAL |  | src/lib/books/types.ts LinkKind and src/lib/books/docrepo.ts addLink support shared record associations; automatic vehicle-invoice linkage to this specific record has no focused verification. |
| V60-0135 | 190 | * Depreciation schedule. | PARTIAL |  | src/lib/books/types.ts has asset/fy links but no dedicated depreciation-schedule link kind; related asset provenance exists; direct schedule relationship verification absent. |
| V60-0136 | 191 | * Organisation. | PARTIAL |  | src/lib/books/types.ts LinkKind and src/lib/books/docrepo.ts addLink support shared record associations; automatic vehicle-invoice linkage to this specific record has no focused verification. |
| V60-0137 | 192 | * Tax treatment. | PARTIAL |  | src/lib/books/types.ts LinkKind and src/lib/books/docrepo.ts addLink support shared record associations; automatic vehicle-invoice linkage to this specific record has no focused verification. |
| V60-0138 | 194 | Create one document identity with multiple authorised links. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts addLink/linksOf and src/lib/books/types.ts DocLink share one docId across records without copying files; src/lib/books/docrepo-search.test.ts and tax-workpaper.test.ts linked-document tests passed. |
| V60-0139 | 196 | Do not duplicate the underlying file merely because several modules use it. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts addLink/linksOf and src/lib/books/types.ts DocLink share one docId across records without copying files; src/lib/books/docrepo-search.test.ts and tax-workpaper.test.ts linked-document tests passed. |

## v6.0 — 9. Automatic naming and organisation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0140 | 198 | 9. Automatic naming and organisation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0141 | 200 | Generate descriptive document names and searchable metadata. | VERIFIED COMPLETE |  | src/lib/books/intake.ts autoName builds Entity / FY / Type / Identifier; src/lib/books/books.test.ts autoName assertion passed; docrepo.ts provides searchable metadata. |
| V60-0142 | 202 | Example: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0143 | 204 | Entity / Financial Year / Document Type / Relevant Identifier | VERIFIED COMPLETE |  | src/lib/books/intake.ts autoName builds Entity / FY / Type / Identifier; src/lib/books/books.test.ts autoName assertion passed; docrepo.ts provides searchable metadata. |
| V60-0144 | 206 | Preserve the original filename and unmodified document. | VERIFIED COMPLETE |  | src/lib/documents.ts retains fileName/filePath and replacesId; currentVersions/earlierVersions preserve originals; src/lib/documents.test.ts replacement-chain test passed. |
| V60-0145 | 208 | Allow logical folder views without requiring a rigid physical folder hierarchy. | PARTIAL |  | src/lib/books/docrepo.ts folders and src/components/books/VaultBooks.tsx provide logical company/year/type views; no focused folder-view verification found. |

## v6.0 — 10. Search

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0146 | 210 | 10. Search | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0147 | 212 | Provide intelligent document search by: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0148 | 214 | * Natural-language query. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts parses company/type/amount/year plain-language filters; src/lib/books/v6-batch7.test.ts plain-language query test passed. |
| V60-0149 | 215 | * Company. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts parses company/type/amount/year plain-language filters; src/lib/books/v6-batch7.test.ts plain-language query test passed. |
| V60-0150 | 216 | * Property. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts applyDocQuery searches linked-record labels; src/lib/books/docrepo-search.test.ts finds a linked property by name (passed). |
| V60-0151 | 217 | * Asset. | PARTIAL |  | src/lib/books/docrepo.ts parseDocQuery/applyDocQuery/filterRepo and src/lib/documents.ts searchVault implement text/metadata/link search; full search for this dimension lacks focused UI verification. |
| V60-0152 | 218 | * Account. | PARTIAL |  | src/lib/books/docrepo.ts parseDocQuery/applyDocQuery/filterRepo and src/lib/documents.ts searchVault implement text/metadata/link search; full search for this dimension lacks focused UI verification. |
| V60-0153 | 219 | * Transaction. | PARTIAL |  | src/lib/books/docrepo.ts parseDocQuery/applyDocQuery/filterRepo and src/lib/documents.ts searchVault implement text/metadata/link search; full search for this dimension lacks focused UI verification. |
| V60-0154 | 220 | * Date. | VERIFIED COMPLETE |  | src/lib/documents.ts searchVault searches dates/fields/merchant; src/lib/documents.test.ts date-range, GSTIN key-detail and merchant-search tests passed. |
| V60-0155 | 221 | * Amount. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts parses company/type/amount/year plain-language filters; src/lib/books/v6-batch7.test.ts plain-language query test passed. |
| V60-0156 | 222 | * Financial year. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts parses company/type/amount/year plain-language filters; src/lib/books/v6-batch7.test.ts plain-language query test passed. |
| V60-0157 | 223 | * Document type. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts parses company/type/amount/year plain-language filters; src/lib/books/v6-batch7.test.ts plain-language query test passed. |
| V60-0158 | 224 | * Registration number. | VERIFIED COMPLETE |  | src/lib/documents.ts searchVault searches dates/fields/merchant; src/lib/documents.test.ts date-range, GSTIN key-detail and merchant-search tests passed. |
| V60-0159 | 225 | * Merchant. | VERIFIED COMPLETE |  | src/lib/documents.ts searchVault searches dates/fields/merchant; src/lib/documents.test.ts date-range, GSTIN key-detail and merchant-search tests passed. |
| V60-0160 | 226 | * Tenant. | PARTIAL |  | src/lib/books/docrepo.ts parseDocQuery/applyDocQuery/filterRepo and src/lib/documents.ts searchVault implement text/metadata/link search; full search for this dimension lacks focused UI verification. |
| V60-0161 | 227 | * Supplier. | PARTIAL |  | src/lib/books/docrepo.ts parseDocQuery/applyDocQuery/filterRepo and src/lib/documents.ts searchVault implement text/metadata/link search; full search for this dimension lacks focused UI verification. |
| V60-0162 | 229 | Search results must respect entity-level permissions. | PARTIAL | drizzle/migrations/0075_entity_level_access.sql, src/components/books/CompanyAccess.tsx, src/lib/books/entity-accounts.ts (companyDocuments) | src/lib/books/entity-access-sql.test.ts 6/6: no-grant, foreign-company, personal-file, write, stranger and revoke refusals; entity-accounts.test.ts companyDocuments 2/2; Signed-in /entities panel render, no page errors (6 Nov) |

## v6.0 — 11. Document lifecycle

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0163 | 231 | 11. Document lifecycle | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0164 | 233 | Support: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0165 | 235 | * Version history. | VERIFIED COMPLETE |  | src/lib/documents.ts currentVersions/earlierVersions/duplicateDocuments implement versions/replacement/duplicate detection; src/lib/documents.test.ts corresponding tests passed. |
| V60-0166 | 236 | * Replacement documents. | VERIFIED COMPLETE |  | src/lib/documents.ts currentVersions/earlierVersions/duplicateDocuments implement versions/replacement/duplicate detection; src/lib/documents.test.ts corresponding tests passed. |
| V60-0167 | 237 | * Expiry reminders. | VERIFIED COMPLETE |  | src/lib/documents.ts expiringDocuments computes expiry reminders; src/lib/documents.test.ts expiring warranties/policies test passed. |
| V60-0168 | 238 | * Renewal tracking. | PARTIAL |  | src/lib/books/docrepo.ts renewalReminders and src/components/books/VaultBooks.tsx list renewals; no focused renewal-completion/tracking verification found. |
| V60-0169 | 239 | * Duplicate identification. | VERIFIED COMPLETE |  | src/lib/documents.ts currentVersions/earlierVersions/duplicateDocuments implement versions/replacement/duplicate detection; src/lib/documents.test.ts corresponding tests passed. |
| V60-0170 | 240 | * Original file preservation. | VERIFIED COMPLETE |  | src/lib/documents.ts retains fileName/filePath and replacesId; currentVersions/earlierVersions preserve originals; src/lib/documents.test.ts replacement-chain test passed. |
| V60-0171 | 241 | * Audit evidence. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts recordProvenance retains linked audit facts; src/lib/books/tax-workpaper.test.ts printed-original/source scoping tests passed. |
| V60-0172 | 242 | * Retention policies. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts pastRetention and DEFAULT_RETENTION implement review-only retention; src/lib/books/books.test.ts retention-never-deletes test passed. |
| V60-0173 | 243 | * Controlled export. | PARTIAL |  | src/components/books/VaultBooks.tsx exports selected original files plus docrepo.ts exportManifest; no focused ZIP/permission/end-to-end export test found. |
| V60-0174 | 245 | A replacement document must not erase the original evidence. | VERIFIED COMPLETE |  | src/lib/documents.ts retains fileName/filePath and replacesId; currentVersions/earlierVersions preserve originals; src/lib/documents.test.ts replacement-chain test passed. |
| V60-0175 | 249 | PART C — AUTOMATED ENTITY ONBOARDING | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 12. Document-based company creation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0176 | 251 | 12. Document-based company creation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0177 | 253 | Creating a new company or organisation must begin with: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0178 | 255 | Add Entity → Upload Documents | PARTIAL |  | src/routes/_authenticated/entities.tsx defaults to Add from documents linking /statements?context=entity, with optional manual form; no focused onboarding route/UI verification found. |
| V60-0179 | 257 | Do not require users to complete a large blank registration form. | PARTIAL |  | src/routes/_authenticated/entities.tsx defaults to Add from documents linking /statements?context=entity, with optional manual form; no focused onboarding route/UI verification found. |
| V60-0180 | 259 | Use Statement Desk to process the documents. | PARTIAL |  | src/routes/_authenticated/entities.tsx defaults to Add from documents linking /statements?context=entity, with optional manual form; no focused onboarding route/UI verification found. |

## v6.0 — 13. Supported onboarding documents

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0181 | 261 | 13. Supported onboarding documents | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0182 | 263 | Where applicable: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0183 | 265 | * Certificate of Incorporation. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0184 | 266 | * PAN document. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0185 | 267 | * GST registration certificate. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0186 | 268 | * Memorandum of Association. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0187 | 269 | * Articles of Association. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0188 | 270 | * LLP agreement. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0189 | 271 | * Partnership deed. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0190 | 272 | * Trust deed. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0191 | 273 | * Registration certificates. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0192 | 274 | * Relevant bank documents. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |
| V60-0193 | 275 | * Prior-year audited statements. | PARTIAL |  | src/lib/document-extract.functions.ts entity profile explicitly supports incorporation/PAN/GST/MoA/AoA/deeds/KYC/audited documents; src/components/DocumentIntake.tsx proposes profiles; this document family lacks real-document verification. |

## v6.0 — 14. Automatic entity profile

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0194 | 277 | 14. Automatic entity profile | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0195 | 279 | Extract and propose: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0196 | 281 | * Legal name. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeEntity builds legal name/kind/PAN/GSTIN/CIN profile; src/lib/books/books.test.ts incorporation draft and identifier re-upload cases passed. |
| V60-0197 | 282 | * Entity type. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeEntity builds legal name/kind/PAN/GSTIN/CIN profile; src/lib/books/books.test.ts incorporation draft and identifier re-upload cases passed. |
| V60-0198 | 283 | * Registration numbers. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeEntity builds legal name/kind/PAN/GSTIN/CIN profile; src/lib/books/books.test.ts incorporation draft and identifier re-upload cases passed. |
| V60-0199 | 284 | * PAN. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeEntity builds legal name/kind/PAN/GSTIN/CIN profile; src/lib/books/books.test.ts incorporation draft and identifier re-upload cases passed. |
| V60-0200 | 285 | * GSTINs. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeEntity builds legal name/kind/PAN/GSTIN/CIN profile; src/lib/books/books.test.ts incorporation draft and identifier re-upload cases passed. |
| V60-0201 | 286 | * Incorporation date. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0202 | 287 | * Registered address. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0203 | 288 | * Directors/partners/trustees where available. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0204 | 289 | * Shareholding information where available. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0205 | 290 | * Financial year. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0206 | 291 | * Tax registrations. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0207 | 292 | * Related entities. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0208 | 293 | * Registered business activities. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0209 | 294 | * Authorised persons where supported. | PARTIAL |  | src/lib/document-extract.functions.ts entity schema and src/lib/books/intake.ts proposeEntity support profile fields; src/lib/books/books.test.ts tests draft profile, not this field-specific real-document extraction. |
| V60-0210 | 296 | The user should review the extracted profile rather than type every field. | PARTIAL |  | src/components/DocumentIntake.tsx displays editable extracted profile proposal; no focused profile review/typing-reduction UI verification found. |

## v6.0 — 15. Intelligent schema mapping

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0211 | 298 | 15. Intelligent schema mapping | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0212 | 300 | If an uploaded document contains a relevant field not currently represented in Ledgerline: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 1. Identify the field.

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0213 | 302 | 1. Identify the field. | VERIFIED COMPLETE |  | src/lib/books/intake.ts canonicalField/unmappedFields create controlled named-detail proposals, never database columns; src/lib/books/books.test.ts unknown-fields-never-columns test passed. |
| V60-0214 | 303 | 2. Determine whether an equivalent canonical field already exists. | VERIFIED COMPLETE |  | src/lib/books/intake.ts canonicalField/unmappedFields create controlled named-detail proposals, never database columns; src/lib/books/books.test.ts unknown-fields-never-columns test passed. |
| V60-0215 | 304 | 3. Map it where possible. | VERIFIED COMPLETE |  | src/lib/books/intake.ts canonicalField/unmappedFields create controlled named-detail proposals, never database columns; src/lib/books/books.test.ts unknown-fields-never-columns test passed. |
| V60-0216 | 305 | 4. Propose a controlled schema extension when genuinely necessary. | VERIFIED COMPLETE |  | src/lib/books/intake.ts canonicalField/unmappedFields create controlled named-detail proposals, never database columns; src/lib/books/books.test.ts unknown-fields-never-columns test passed. |
| V60-0217 | 306 | 5. Test data migration and compatibility. | PARTIAL |  | src/lib/books/intake.ts fieldExtensionPlan only checks labels/mapping collisions and describes no-table-change compatibility; no actual migration/backward-reader compatibility test found. |
| V60-0218 | 307 | 6. Require approval before shared-schema changes. | PARTIAL |  | src/routes/_authenticated/audit.tsx requires explicit approval and compatible fieldExtensionPlan; no focused approval-enforcement/shared-schema test found (extensions are named details, not shared-schema DDL). |
| V60-0219 | 309 | Do not automatically generate uncontrolled database columns from arbitrary text. | VERIFIED COMPLETE |  | src/lib/books/intake.ts canonicalField/unmappedFields create controlled named-detail proposals, never database columns; src/lib/books/books.test.ts unknown-fields-never-columns test passed. |

## v6.0 — 16. Entity recognition

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0220 | 311 | 16. Entity recognition | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0221 | 313 | When later documents are uploaded, automatically match them to an existing entity using verified identifiers. | VERIFIED COMPLETE |  | src/lib/books/intake.ts matchEntity/proposeEntity match verified PAN/CIN/GSTIN before names; src/lib/books/v6-gaps.test.ts identifier/same-name tests and books.test.ts duplicate-company case passed. |
| V60-0222 | 315 | Avoid creating duplicate companies because of spelling variations or abbreviations. | VERIFIED COMPLETE |  | src/lib/books/intake.ts matchEntity/proposeEntity match verified PAN/CIN/GSTIN before names; src/lib/books/v6-gaps.test.ts identifier/same-name tests and books.test.ts duplicate-company case passed. |
| V60-0223 | 319 | PART D — PREVIOUS-YEAR AUDITED RECORDS | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 17. Financial Year Onboarding

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0224 | 321 | 17. Financial Year Onboarding | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0225 | 323 | Create: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0226 | 325 | Tax & Audit → Financial Year Onboarding | PARTIAL |  | src/components/books/TaxCentre.tsx renders Financial year onboarding with contextual Statement Desk link; no focused Tax & Audit navigation verification found. |
| V60-0227 | 327 | Allow historical records to be imported for multiple years. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeFy merges by entity/year and src/lib/books/types.ts stores fyRecords[]; src/lib/books/books.test.ts FY re-upload/record-source merge test passed. |

## v6.0 — 18. Automatic audited statement extraction

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0228 | 329 | 18. Automatic audited statement extraction | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0229 | 331 | Process: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0230 | 333 | * Balance sheets. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0231 | 334 | * Profit and loss statements. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0232 | 335 | * Trial balances. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0233 | 336 | * Cash flow statements. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0234 | 337 | * Notes to accounts. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0235 | 338 | * Auditor reports. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0236 | 339 | * Fixed asset registers. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0237 | 340 | * Depreciation schedules. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0238 | 341 | * Loan schedules. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0239 | 342 | * Receivables. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0240 | 343 | * Payables. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0241 | 344 | * Investment schedules. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0242 | 345 | * Tax computations. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |
| V60-0243 | 346 | * GST reconciliation statements. | PARTIAL |  | src/lib/document-extract.functions.ts audited schema lists this schedule and detail lines; src/lib/books/intake.ts proposeFy stores it; no schedule-specific real-document extraction verification (docs/VERIFICATION_RESULTS.md). |

## v6.0 — 19. Proposed opening balances

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0244 | 348 | 19. Proposed opening balances | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0245 | 350 | Automatically prepare: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0246 | 352 | * Bank opening balances. | VERIFIED COMPLETE |  | src/lib/books/fy.ts openingProposal and src/lib/books/intake.ts proposeFy retain audited closing heads as proposed openings without inventing missing values; src/lib/books/books.test.ts opening-balance/incomplete-schedule cases passed. |
| V60-0247 | 353 | * Cash balances. | VERIFIED COMPLETE |  | src/lib/books/fy.ts openingProposal and src/lib/books/intake.ts proposeFy retain audited closing heads as proposed openings without inventing missing values; src/lib/books/books.test.ts opening-balance/incomplete-schedule cases passed. |
| V60-0248 | 354 | * Investments. | VERIFIED COMPLETE |  | src/lib/books/fy.ts openingProposal and src/lib/books/intake.ts proposeFy retain audited closing heads as proposed openings without inventing missing values; src/lib/books/books.test.ts opening-balance/incomplete-schedule cases passed. |
| V60-0249 | 355 | * Fixed assets. | VERIFIED COMPLETE |  | src/lib/books/fy.ts openingProposal and src/lib/books/intake.ts proposeFy retain audited closing heads as proposed openings without inventing missing values; src/lib/books/books.test.ts opening-balance/incomplete-schedule cases passed. |
| V60-0250 | 356 | * Accumulated depreciation. | VERIFIED COMPLETE |  | src/lib/books/fy.ts openingProposal and src/lib/books/intake.ts proposeFy retain audited closing heads as proposed openings without inventing missing values; src/lib/books/books.test.ts opening-balance/incomplete-schedule cases passed. |
| V60-0251 | 357 | * Capital and reserves. | PARTIAL |  | src/lib/books/types.ts OPENING_HEADS and src/lib/books/fy.ts openingPlan; src/components/books/OpeningBalances.tsx supports audited heads; per-head end-to-end verification incomplete. |
| V60-0252 | 358 | * Loans. | PARTIAL |  | src/lib/books/types.ts OPENING_HEADS and src/lib/books/fy.ts openingPlan; src/components/books/OpeningBalances.tsx supports audited heads; per-head end-to-end verification incomplete. |
| V60-0253 | 359 | * Receivables. | PARTIAL |  | src/lib/books/types.ts OPENING_HEADS and src/lib/books/fy.ts openingPlan; src/components/books/OpeningBalances.tsx supports audited heads; per-head end-to-end verification incomplete. |
| V60-0254 | 360 | * Payables. | PARTIAL |  | src/lib/books/types.ts OPENING_HEADS and src/lib/books/fy.ts openingPlan; src/components/books/OpeningBalances.tsx supports audited heads; per-head end-to-end verification incomplete. |
| V60-0255 | 361 | * Tax balances. | PARTIAL |  | src/lib/books/types.ts OPENING_HEADS and src/lib/books/fy.ts openingPlan; src/components/books/OpeningBalances.tsx supports audited heads; per-head end-to-end verification incomplete. |
| V60-0256 | 362 | * Other recognised balances. | PARTIAL |  | src/lib/books/types.ts OPENING_HEADS and src/lib/books/fy.ts openingPlan; src/components/books/OpeningBalances.tsx supports audited heads; per-head end-to-end verification incomplete. |
| V60-0257 | 364 | Compare the proposed opening trial balance against audited closing values. | VERIFIED COMPLETE |  | src/lib/books/fy.ts openingPlan compares audited amounts and requires explained differences; src/lib/books/v6-batch7.test.ts opening-balance posting tests cover differences, unlinked heads and split mismatches. |
| V60-0258 | 366 | Do not force reconciliation through unexplained adjustments. | VERIFIED COMPLETE |  | src/lib/books/fy.ts openingPlan compares audited amounts and requires explained differences; src/lib/books/v6-batch7.test.ts opening-balance posting tests cover differences, unlinked heads and split mismatches. |

## v6.0 — 20. Previous-year history

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0259 | 368 | 20. Previous-year history | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0260 | 370 | Maintain: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0261 | 372 | * Financial statements. | PARTIAL |  | src/lib/books/types.ts FyRecord stores schedules, qualifications, audited/confirmed balances, filed returns, losses and document links; src/lib/books/intake.ts proposeFy and src/lib/books/fy.ts; full historical-category retention verification incomplete. |
| V60-0262 | 373 | * Audit qualifications. | PARTIAL |  | src/lib/books/types.ts FyRecord stores schedules, qualifications, audited/confirmed balances, filed returns, losses and document links; src/lib/books/intake.ts proposeFy and src/lib/books/fy.ts; full historical-category retention verification incomplete. |
| V60-0263 | 374 | * Opening/closing balances. | PARTIAL |  | src/lib/books/types.ts FyRecord stores schedules, qualifications, audited/confirmed balances, filed returns, losses and document links; src/lib/books/intake.ts proposeFy and src/lib/books/fy.ts; full historical-category retention verification incomplete. |
| V60-0264 | 375 | * Filed returns. | PARTIAL |  | src/lib/books/types.ts FyRecord stores schedules, qualifications, audited/confirmed balances, filed returns, losses and document links; src/lib/books/intake.ts proposeFy and src/lib/books/fy.ts; full historical-category retention verification incomplete. |
| V60-0265 | 376 | * Tax losses and applicable carry-forwards. | VERIFIED COMPLETE |  | src/lib/books/types.ts FyRecord.lossesCarriedForward and src/lib/books/taxcomp.ts; src/lib/books/v6-batch7.test.ts verifies latest earlier losses and eight-year expiry. |
| V60-0266 | 377 | * Depreciation history. | PARTIAL |  | src/lib/books/types.ts FyRecord stores schedules, qualifications, audited/confirmed balances, filed returns, losses and document links; src/lib/books/intake.ts proposeFy and src/lib/books/fy.ts; full historical-category retention verification incomplete. |
| V60-0267 | 378 | * Investment history. | PARTIAL |  | src/lib/books/types.ts FyRecord stores schedules, qualifications, audited/confirmed balances, filed returns, losses and document links; src/lib/books/intake.ts proposeFy and src/lib/books/fy.ts; full historical-category retention verification incomplete. |
| V60-0268 | 379 | * Property records. | PARTIAL |  | src/lib/books/types.ts FyRecord stores schedules, qualifications, audited/confirmed balances, filed returns, losses and document links; src/lib/books/intake.ts proposeFy and src/lib/books/fy.ts; full historical-category retention verification incomplete. |
| V60-0269 | 380 | * Loan balances. | PARTIAL |  | src/lib/books/types.ts FyRecord stores schedules, qualifications, audited/confirmed balances, filed returns, losses and document links; src/lib/books/intake.ts proposeFy and src/lib/books/fy.ts; full historical-category retention verification incomplete. |
| V60-0270 | 382 | Historical source data must remain accessible even after future corrections. | PARTIAL |  | src/lib/books/types.ts FyRecord.versions and docIds, src/lib/books/source-corrections.ts preserve correction evidence; source-corrections.test.ts covers corrections, but immutable accessibility of every historical original not established. |
| V60-0271 | 386 | PART E — AUTOMATED FINANCIAL ACCOUNTING | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 21. Shared financial ledger

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0272 | 388 | 21. Shared financial ledger | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0273 | 390 | Continue using the existing Ledgerline financial ledger and Universal Expense Entry. | PARTIAL |  | src/lib/ledger.ts shared movement types and src/components/books/AssetBooks.tsx shared ledger postings; src/lib/books/v6-gaps.test.ts verifies depreciation entries, but complete cross-module no-second-ledger integration not verified. |
| V60-0274 | 392 | Do not create a second ledger for tax, assets, property or investments. | PARTIAL |  | src/lib/ledger.ts shared movement types and src/components/books/AssetBooks.tsx shared ledger postings; src/lib/books/v6-gaps.test.ts verifies depreciation entries, but complete cross-module no-second-ledger integration not verified. |

## v6.0 — 22. Automated transaction recognition

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0275 | 394 | 22. Automated transaction recognition | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0276 | 396 | Use uploaded statements and verified records to identify: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0277 | 398 | * Income. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |
| V60-0278 | 399 | * Expenses. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |
| V60-0279 | 400 | * Transfers. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |
| V60-0280 | 401 | * Credit card settlements. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |
| V60-0281 | 402 | * Loans. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |
| V60-0282 | 403 | * Investment transactions. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |
| V60-0283 | 404 | * Asset acquisitions. | PARTIAL |  | src/lib/books/intake.ts proposeAsset and src/lib/books/assets-ledger.ts suggestPayment identify assets/payment candidates; v6-gaps.test.ts tests payment matching; automated bank-row acquisition recognition not fully verified. |
| V60-0284 | 405 | * Rental receipts. | VERIFIED COMPLETE |  | src/lib/books/property.ts leaseScore/allocateReceipts/receiptKind match tenant receipts and separate deposits; src/lib/books/books.test.ts and v6-gaps.test.ts cover rent matching and deposit exclusion. |
| V60-0285 | 406 | * Security deposits. | VERIFIED COMPLETE |  | src/lib/books/property.ts leaseScore/allocateReceipts/receiptKind match tenant receipts and separate deposits; src/lib/books/books.test.ts and v6-gaps.test.ts cover rent matching and deposit exclusion. |
| V60-0286 | 407 | * Tax payments. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |
| V60-0287 | 408 | * Reimbursements. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |
| V60-0288 | 410 | Do not assume every bank debit is an expense or every credit is income. | VERIFIED COMPLETE |  | src/lib/statement-auto.ts classifyStatementLine and src/lib/statement-pipeline/classify.ts distinguish movement kinds and request confirmation; src/lib/statement-auto.test.ts and src/lib/statement-pipeline/pipeline.test.ts cover classification safeguards. |

## v6.0 — 23. Automated matching

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0289 | 412 | 23. Automated matching | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0290 | 414 | Match transactions using relevant evidence such as: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0291 | 416 | * Account identity. | PARTIAL |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use amount, date, direction, description and currency; src/lib/import-learning.ts supplies mappings; independent verification of this evidence field across all matchers incomplete. |
| V60-0292 | 417 | * Date. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use dates, amounts, direction, description tokens and currency; src/lib/statement-pipeline/pipeline.test.ts tests matching. |
| V60-0293 | 418 | * Amount. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use dates, amounts, direction, description tokens and currency; src/lib/statement-pipeline/pipeline.test.ts tests matching. |
| V60-0294 | 419 | * Direction. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use dates, amounts, direction, description tokens and currency; src/lib/statement-pipeline/pipeline.test.ts tests matching. |
| V60-0295 | 420 | * Reference. | PARTIAL |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use amount, date, direction, description and currency; src/lib/import-learning.ts supplies mappings; independent verification of this evidence field across all matchers incomplete. |
| V60-0296 | 421 | * Merchant. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use dates, amounts, direction, description tokens and currency; src/lib/statement-pipeline/pipeline.test.ts tests matching. |
| V60-0297 | 422 | * Counterparty. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use dates, amounts, direction, description tokens and currency; src/lib/statement-pipeline/pipeline.test.ts tests matching. |
| V60-0298 | 423 | * Currency. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use dates, amounts, direction, description tokens and currency; src/lib/statement-pipeline/pipeline.test.ts tests matching. |
| V60-0299 | 424 | * Related document. | PARTIAL |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use amount, date, direction, description and currency; src/lib/import-learning.ts supplies mappings; independent verification of this evidence field across all matchers incomplete. |
| V60-0300 | 425 | * Existing approved mappings. | PARTIAL |  | src/lib/statement-pipeline/match.ts scoreRecord/matchLines use amount, date, direction, description and currency; src/lib/import-learning.ts supplies mappings; independent verification of this evidence field across all matchers incomplete. |
| V60-0301 | 427 | Do not rely solely on matching amounts. | PARTIAL |  | src/lib/statement-pipeline/match.ts uses date/currency/direction/text scoring, but matchLines can select an amount/date candidate without corroborating description; no universal evidence-only match gate established. |

## v6.0 — 24. Financial reconciliation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0302 | 429 | 24. Financial reconciliation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0303 | 431 | Automatically prepare: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0304 | 433 | * Bank reconciliation. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts and src/lib/statement-crosscheck.ts prepare statement reconciliation; src/lib/statement-pipeline/pipeline.test.ts and src/lib/statement-crosscheck.test.ts cover bank/card flows. |
| V60-0305 | 434 | * Card reconciliation. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts and src/lib/statement-crosscheck.ts prepare statement reconciliation; src/lib/statement-pipeline/pipeline.test.ts and src/lib/statement-crosscheck.test.ts cover bank/card flows. |
| V60-0306 | 435 | * Loan reconciliation. | VERIFIED COMPLETE |  | src/lib/books/recon.ts loanRecon/supplierRecon/customerRecon/investmentRecon/intercompanyRecon and src/lib/gst-recon.ts; src/lib/books/recon.test.ts, recon-extra.test.ts and src/lib/gst-recon.test.ts assert reconciliation differences. |
| V60-0307 | 436 | * Supplier reconciliation. | VERIFIED COMPLETE |  | src/lib/books/recon.ts loanRecon/supplierRecon/customerRecon/investmentRecon/intercompanyRecon and src/lib/gst-recon.ts; src/lib/books/recon.test.ts, recon-extra.test.ts and src/lib/gst-recon.test.ts assert reconciliation differences. |
| V60-0308 | 437 | * Customer reconciliation. | VERIFIED COMPLETE |  | src/lib/books/recon.ts loanRecon/supplierRecon/customerRecon/investmentRecon/intercompanyRecon and src/lib/gst-recon.ts; src/lib/books/recon.test.ts, recon-extra.test.ts and src/lib/gst-recon.test.ts assert reconciliation differences. |
| V60-0309 | 438 | * Investment reconciliation. | VERIFIED COMPLETE |  | src/lib/books/recon.ts loanRecon/supplierRecon/customerRecon/investmentRecon/intercompanyRecon and src/lib/gst-recon.ts; src/lib/books/recon.test.ts, recon-extra.test.ts and src/lib/gst-recon.test.ts assert reconciliation differences. |
| V60-0310 | 439 | * Intercompany reconciliation. | VERIFIED COMPLETE |  | src/lib/books/recon.ts loanRecon/supplierRecon/customerRecon/investmentRecon/intercompanyRecon and src/lib/gst-recon.ts; src/lib/books/recon.test.ts, recon-extra.test.ts and src/lib/gst-recon.test.ts assert reconciliation differences. |
| V60-0311 | 440 | * GST reconciliation. | VERIFIED COMPLETE |  | src/lib/books/recon.ts loanRecon/supplierRecon/customerRecon/investmentRecon/intercompanyRecon and src/lib/gst-recon.ts; src/lib/books/recon.test.ts, recon-extra.test.ts and src/lib/gst-recon.test.ts assert reconciliation differences. |
| V60-0312 | 442 | Unresolved differences must enter the Financial Inbox. | PARTIAL |  | src/routes/_authenticated/inbox.tsx links reconciliation attention and src/lib/books/recon.ts prepares differences; verified routing of every reconciliation difference into Financial Inbox not established. |

## v6.0 — 25. Missing invoices

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0313 | 444 | 25. Missing invoices | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0314 | 446 | A genuine bank transaction must still be included in bank-balance reconciliation when no invoice exists. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts reconciles ledger rows independently of invoice availability; src/lib/books/books.test.ts missing-invoice ledger integrity case and statement-pipeline/pipeline.test.ts cover ledger reconciliation. |
| V60-0315 | 448 | Document status and accounting classification must remain separate. | VERIFIED COMPLETE |  | src/lib/statement-pipeline/match.ts reconciles ledger rows independently of invoice availability; src/lib/books/books.test.ts missing-invoice ledger integrity case and statement-pipeline/pipeline.test.ts cover ledger reconciliation. |
| V60-0316 | 450 | Missing invoices may still create tax, approval or audit exceptions. | PARTIAL |  | src/lib/books/tax-workpaper.ts and src/lib/books/evidence.ts flag missing support; books.test.ts covers missing invoice tax working; full approval/audit exception routing not verified. |
| V60-0317 | 454 | PART F — EXTENSIVE ASSET MANAGEMENT | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 26. Asset Management

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0318 | 456 | 26. Asset Management | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0319 | 458 | Create a dedicated Asset Management module integrated with the shared ledger. | VERIFIED COMPLETE |  | src/components/books/AssetBooks.tsx provides dedicated assets UI and shared postings via src/lib/books/assets-ledger.ts; src/lib/books/v6-gaps.test.ts covers shared depreciation entries. |

## v6.0 — 27. Automated asset registration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0320 | 460 | 27. Automated asset registration | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0321 | 462 | When an asset-related document is uploaded: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0322 | 464 | * Identify the asset. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeAsset populates extracted draft without retyping; src/lib/books/books.test.ts asset invoice proposal and asset-read.test.ts printed depreciation facts verify draft population. |
| V60-0323 | 465 | * Identify legal owner. | PARTIAL |  | src/lib/books/intake.ts AssetRead/proposeAsset, src/components/books/AssetBooks.tsx and src/lib/books/assets-ledger.ts suggestPayment provide extracted drafts and links; books.test.ts/asset-read.test.ts cover core fields, but this specific field or complete upload-to-save path lacks verification. |
| V60-0324 | 466 | * Extract purchase cost. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeAsset populates extracted draft without retyping; src/lib/books/books.test.ts asset invoice proposal and asset-read.test.ts printed depreciation facts verify draft population. |
| V60-0325 | 467 | * Determine relevant dates. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeAsset populates extracted draft without retyping; src/lib/books/books.test.ts asset invoice proposal and asset-read.test.ts printed depreciation facts verify draft population. |
| V60-0326 | 468 | * Identify supplier. | PARTIAL |  | src/lib/books/intake.ts AssetRead/proposeAsset, src/components/books/AssetBooks.tsx and src/lib/books/assets-ledger.ts suggestPayment provide extracted drafts and links; books.test.ts/asset-read.test.ts cover core fields, but this specific field or complete upload-to-save path lacks verification. |
| V60-0327 | 469 | * Identify possible linked payment. | VERIFIED COMPLETE |  | src/lib/books/assets-ledger.ts suggestPayment uses amount, date and supplier; src/lib/books/v6-gaps.test.ts tests unique linked payment suggestion. |
| V60-0328 | 470 | * Identify warranty and insurance. | PARTIAL |  | src/lib/books/intake.ts AssetRead/proposeAsset, src/components/books/AssetBooks.tsx and src/lib/books/assets-ledger.ts suggestPayment provide extracted drafts and links; books.test.ts/asset-read.test.ts cover core fields, but this specific field or complete upload-to-save path lacks verification. |
| V60-0329 | 471 | * Suggest asset category. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeAsset populates extracted draft without retyping; src/lib/books/books.test.ts asset invoice proposal and asset-read.test.ts printed depreciation facts verify draft population. |
| V60-0330 | 472 | * Prepare the asset master record. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeAsset populates extracted draft without retyping; src/lib/books/books.test.ts asset invoice proposal and asset-read.test.ts printed depreciation facts verify draft population. |
| V60-0331 | 473 | * Prepare appropriate accounting links. | PARTIAL |  | src/lib/books/intake.ts AssetRead/proposeAsset, src/components/books/AssetBooks.tsx and src/lib/books/assets-ledger.ts suggestPayment provide extracted drafts and links; books.test.ts/asset-read.test.ts cover core fields, but this specific field or complete upload-to-save path lacks verification. |
| V60-0332 | 475 | Do not require retyping extracted information. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeAsset populates extracted draft without retyping; src/lib/books/books.test.ts asset invoice proposal and asset-read.test.ts printed depreciation facts verify draft population. |
| V60-0333 | 477 | Capitalisation must follow the entity’s approved policy and applicable rules. | PARTIAL |  | src/lib/books/assets-ledger.ts capitalisation checks entity-approved limits; v6-gaps.test.ts tests limits/missing policy; universal server-side approved-policy enforcement is not established (docs/VERIFICATION_RESULTS.md notes staged preference guard). |

## v6.0 — 28. Asset lifecycle

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0334 | 479 | 28. Asset lifecycle | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0335 | 481 | Support: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0336 | 483 | * Acquisition. | PARTIAL |  | src/lib/books/types.ts AssetEventKind, src/lib/books/assets-ledger.ts applyEvent and src/components/books/AssetBooks.tsx lifecycle controls; v6-gaps.test.ts covers lifecycle changes, but every event-specific persistence path is not verified. |
| V60-0337 | 484 | * Receipt. | PARTIAL |  | src/lib/books/types.ts AssetEventKind, src/lib/books/assets-ledger.ts applyEvent and src/components/books/AssetBooks.tsx lifecycle controls; v6-gaps.test.ts covers lifecycle changes, but every event-specific persistence path is not verified. |
| V60-0338 | 485 | * Capitalisation. | PARTIAL |  | src/lib/books/types.ts AssetEventKind, src/lib/books/assets-ledger.ts applyEvent and src/components/books/AssetBooks.tsx lifecycle controls; v6-gaps.test.ts covers lifecycle changes, but every event-specific persistence path is not verified. |
| V60-0339 | 486 | * Location assignment. | VERIFIED COMPLETE |  | src/lib/books/assets-ledger.ts applyEvent/eventPostings and src/components/books/AssetBooks.tsx lifecycle controls; src/lib/books/v6-gaps.test.ts and asset-events-posting.test.ts cover register changes and write-down/disposal postings. |
| V60-0340 | 487 | * Custodian assignment. | VERIFIED COMPLETE |  | src/lib/books/assets-ledger.ts applyEvent/eventPostings and src/components/books/AssetBooks.tsx lifecycle controls; src/lib/books/v6-gaps.test.ts and asset-events-posting.test.ts cover register changes and write-down/disposal postings. |
| V60-0341 | 488 | * Maintenance. | PARTIAL |  | src/lib/books/types.ts AssetEventKind, src/lib/books/assets-ledger.ts applyEvent and src/components/books/AssetBooks.tsx lifecycle controls; v6-gaps.test.ts covers lifecycle changes, but every event-specific persistence path is not verified. |
| V60-0342 | 489 | * Transfers. | VERIFIED COMPLETE |  | src/lib/books/assets-ledger.ts applyEvent/eventPostings and src/components/books/AssetBooks.tsx lifecycle controls; src/lib/books/v6-gaps.test.ts and asset-events-posting.test.ts cover register changes and write-down/disposal postings. |
| V60-0343 | 490 | * Verification. | PARTIAL |  | src/lib/books/types.ts AssetEventKind, src/lib/books/assets-ledger.ts applyEvent and src/components/books/AssetBooks.tsx lifecycle controls; v6-gaps.test.ts covers lifecycle changes, but every event-specific persistence path is not verified. |
| V60-0344 | 491 | * Impairment/revaluation, where applicable. | VERIFIED COMPLETE |  | src/lib/books/assets-ledger.ts applyEvent/eventPostings and src/components/books/AssetBooks.tsx lifecycle controls; src/lib/books/v6-gaps.test.ts and asset-events-posting.test.ts cover register changes and write-down/disposal postings. |
| V60-0345 | 492 | * Disposal. | VERIFIED COMPLETE |  | src/lib/books/assets-ledger.ts applyEvent/eventPostings and src/components/books/AssetBooks.tsx lifecycle controls; src/lib/books/v6-gaps.test.ts and asset-events-posting.test.ts cover register changes and write-down/disposal postings. |

## v6.0 — 29. Asset documentation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0346 | 494 | 29. Asset documentation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0347 | 496 | Link: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0348 | 498 | * Purchase invoices. | PARTIAL |  | src/lib/assets.ts docId/docIds and src/components/books/AssetBooks.tsx link DocuRepo supporting documents including maintenance/photos/disposal/valuation; document-kind-specific attachment and retention verification incomplete. |
| V60-0349 | 499 | * Warranty documents. | PARTIAL |  | src/lib/assets.ts docId/docIds and src/components/books/AssetBooks.tsx link DocuRepo supporting documents including maintenance/photos/disposal/valuation; document-kind-specific attachment and retention verification incomplete. |
| V60-0350 | 500 | * Insurance. | PARTIAL |  | src/lib/assets.ts docId/docIds and src/components/books/AssetBooks.tsx link DocuRepo supporting documents including maintenance/photos/disposal/valuation; document-kind-specific attachment and retention verification incomplete. |
| V60-0351 | 501 | * Maintenance records. | PARTIAL |  | src/lib/assets.ts docId/docIds and src/components/books/AssetBooks.tsx link DocuRepo supporting documents including maintenance/photos/disposal/valuation; document-kind-specific attachment and retention verification incomplete. |
| V60-0352 | 502 | * Photographs. | PARTIAL |  | src/lib/assets.ts docId/docIds and src/components/books/AssetBooks.tsx link DocuRepo supporting documents including maintenance/photos/disposal/valuation; document-kind-specific attachment and retention verification incomplete. |
| V60-0353 | 503 | * Disposal documents. | PARTIAL |  | src/lib/assets.ts docId/docIds and src/components/books/AssetBooks.tsx link DocuRepo supporting documents including maintenance/photos/disposal/valuation; document-kind-specific attachment and retention verification incomplete. |
| V60-0354 | 504 | * Valuation reports. | PARTIAL |  | src/lib/assets.ts docId/docIds and src/components/books/AssetBooks.tsx link DocuRepo supporting documents including maintenance/photos/disposal/valuation; document-kind-specific attachment and retention verification incomplete. |
| V60-0355 | 506 | All documents remain in DocuRepo. | PARTIAL |  | src/lib/assets.ts docId/docIds and src/components/books/AssetBooks.tsx link DocuRepo supporting documents including maintenance/photos/disposal/valuation; document-kind-specific attachment and retention verification incomplete. |

## v6.0 — 30. Asset verification

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0356 | 508 | 30. Asset verification | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0357 | 510 | Support: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0358 | 512 | * Unique asset ID. | VERIFIED COMPLETE |  | src/lib/books/asset-verification.ts matchAssetLabel resolves unique asset id/tag and QR/barcode labels; src/components/books/AssetCheck.tsx; src/lib/books/asset-verification.test.ts covers exact, unknown and ambiguous labels (not device camera acceptance). |
| V60-0359 | 513 | * QR/barcode. | VERIFIED COMPLETE |  | src/lib/books/asset-verification.ts matchAssetLabel resolves unique asset id/tag and QR/barcode labels; src/components/books/AssetCheck.tsx; src/lib/books/asset-verification.test.ts covers exact, unknown and ambiguous labels (not device camera acceptance). |
| V60-0360 | 514 | * Location. | VERIFIED COMPLETE |  | src/lib/books/asset-verification.ts physicalCheck and src/lib/books/assets-ledger.ts applyEvent store location/department/custodian and check outcomes; src/lib/books/asset-verification.test.ts and v6-gaps.test.ts test physical checks and lifecycle updates. |
| V60-0361 | 515 | * Department. | VERIFIED COMPLETE |  | src/lib/books/asset-verification.ts physicalCheck and src/lib/books/assets-ledger.ts applyEvent store location/department/custodian and check outcomes; src/lib/books/asset-verification.test.ts and v6-gaps.test.ts test physical checks and lifecycle updates. |
| V60-0362 | 516 | * Custodian. | VERIFIED COMPLETE |  | src/lib/books/asset-verification.ts physicalCheck and src/lib/books/assets-ledger.ts applyEvent store location/department/custodian and check outcomes; src/lib/books/asset-verification.test.ts and v6-gaps.test.ts test physical checks and lifecycle updates. |
| V60-0363 | 517 | * Physical verification. | VERIFIED COMPLETE |  | src/lib/books/asset-verification.ts physicalCheck and src/lib/books/assets-ledger.ts applyEvent store location/department/custodian and check outcomes; src/lib/books/asset-verification.test.ts and v6-gaps.test.ts test physical checks and lifecycle updates. |
| V60-0364 | 518 | * Missing/damaged asset reporting. | VERIFIED COMPLETE |  | src/lib/books/asset-verification.ts physicalCheck and src/lib/books/assets-ledger.ts applyEvent store location/department/custodian and check outcomes; src/lib/books/asset-verification.test.ts and v6-gaps.test.ts test physical checks and lifecycle updates. |
| V60-0365 | 522 | PART G — AUTOMATIC DEPRECIATION | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 31. Separate depreciation treatments

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0366 | 524 | 31. Separate depreciation treatments | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0367 | 526 | Maintain separate: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0368 | 528 | Book depreciation | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/bookVsTax and src/lib/assets.ts taxSchedule maintain distinct book/tax methods; src/lib/books/books.test.ts asserts separate values and residual floors; src/lib/assets.test.ts tests tax schedules. |
| V60-0369 | 530 | For applicable financial reporting standards and accounting policies. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/bookVsTax and src/lib/assets.ts taxSchedule maintain distinct book/tax methods; src/lib/books/books.test.ts asserts separate values and residual floors; src/lib/assets.test.ts tests tax schedules. |
| V60-0370 | 532 | Tax depreciation | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/bookVsTax and src/lib/assets.ts taxSchedule maintain distinct book/tax methods; src/lib/books/books.test.ts asserts separate values and residual floors; src/lib/assets.test.ts tests tax schedules. |
| V60-0371 | 534 | For applicable income-tax provisions and asset/block classifications. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/bookVsTax and src/lib/assets.ts taxSchedule maintain distinct book/tax methods; src/lib/books/books.test.ts asserts separate values and residual floors; src/lib/assets.test.ts tests tax schedules. |
| V60-0372 | 536 | Do not assume the two values are identical. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/bookVsTax and src/lib/assets.ts taxSchedule maintain distinct book/tax methods; src/lib/books/books.test.ts asserts separate values and residual floors; src/lib/assets.test.ts tests tax schedules. |

## v6.0 — 32. Automatic calculation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0373 | 538 | 32. Automatic calculation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0374 | 540 | Use verified: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0375 | 542 | * Acquisition cost. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |
| V60-0376 | 543 | * Capitalisation date. | PARTIAL |  | src/lib/books/assets-ledger.ts records capitalisation events, but src/lib/books/depreciation.ts monthlyBook starts from inUse; distinct verified capitalisation-date calculation input not established. |
| V60-0377 | 544 | * Put-to-use date. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |
| V60-0378 | 545 | * Asset category. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |
| V60-0379 | 546 | * Depreciation method. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |
| V60-0380 | 547 | * Useful life. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |
| V60-0381 | 548 | * Residual value. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |
| V60-0382 | 549 | * Applicable tax rates. | PARTIAL |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule consume asset inputs; books.test.ts, asset-read.test.ts and v6-gaps.test.ts cover calculations, but verified-input provenance/approval for every field is incomplete. |
| V60-0383 | 550 | * Additions. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |
| V60-0384 | 551 | * Disposals. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |
| V60-0385 | 552 | * Relevant prior-year written-down values. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/blockSchedule and src/lib/assets.ts taxSchedule use cost, in-use date, category, methods/life/residual, additions/disposals and opening WDV; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts cover these calculations. |

## v6.0 — 33. Automated depreciation schedules

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0386 | 554 | 33. Automated depreciation schedules | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0387 | 556 | Generate: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0388 | 558 | * Monthly book depreciation. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |
| V60-0389 | 559 | * Annual book depreciation. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |
| V60-0390 | 560 | * Accumulated depreciation. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |
| V60-0391 | 561 | * Net book value. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |
| V60-0392 | 562 | * Tax depreciation. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |
| V60-0393 | 563 | * Tax written-down value. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |
| V60-0394 | 564 | * Block-wise tax schedules. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |
| V60-0395 | 565 | * Additions/disposals. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |
| V60-0396 | 566 | * Book-versus-tax reconciliation. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts monthlyBook/annualBook/blockSchedule/bookVsTax and src/lib/assets.ts taxSchedule generate schedules; src/lib/books/books.test.ts, v6-gaps.test.ts and v6-batch7.test.ts test separate depreciation, opening WDV and block disposals. |

## v6.0 — 34. Posting

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0397 | 568 | 34. Posting | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0398 | 570 | Run depreciation calculation automatically. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts prepareJournals and src/lib/books/assets-ledger.ts dueMonths/depreciationExceptions; src/lib/books/scheduled-depreciation.test.ts verifies automatic journal preparation, idempotence and closed periods. |
| V60-0399 | 572 | Prepare accounting journals and identify exceptions. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts prepareJournals and src/lib/books/assets-ledger.ts dueMonths/depreciationExceptions; src/lib/books/scheduled-depreciation.test.ts verifies automatic journal preparation, idempotence and closed periods. |
| V60-0400 | 574 | Post to an open period only under the configured approval policy. | PARTIAL |  | src/components/books/AssetBooks.tsx approval button and src/lib/books/depreciation.ts postJournals enforce open periods; v6-gaps.test.ts tests closed refusal; docs/VERIFICATION_RESULTS.md notes direct sensitive-write approval guard remains staged. |
| V60-0401 | 576 | Never silently modify a closed accounting period. | VERIFIED COMPLETE |  | src/lib/books/depreciation.ts refuses closed periods; drizzle/migrations/0083 journal/rule guards documented in docs/VERIFICATION_RESULTS.md; src/lib/books/journal-rule-guard-sql.test.ts covers closed-month posting and immutable journals. |
| V60-0402 | 580 | PART H — PROPERTY MANAGEMENT | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 35. Dedicated Property Management

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0403 | 582 | 35. Dedicated Property Management | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0404 | 584 | Create a separate module linked to Asset Management and financial accounting. | PARTIAL |  | src/components/books/PropertyPanel.tsx dedicated module links assets, shared receipts and costs; src/lib/books/property.ts and books.test.ts verify rent/occupancy, but complete accounting integration not verified. |

## v6.0 — 36. Property onboarding

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0405 | 586 | 36. Property onboarding | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0406 | 588 | Begin with: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0407 | 590 | Add Property → Upload Document | VERIFIED COMPLETE |  | src/components/books/PropertyPanel.tsx Add property from deed links /statements context property; src/lib/books/intake.ts proposeProperty and books.test.ts verify deed-generated proposal. |
| V60-0408 | 592 | Supported documents may include: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0409 | 594 | * Sale deed. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |
| V60-0410 | 595 | * Registration document. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |
| V60-0411 | 596 | * Lease agreement. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |
| V60-0412 | 597 | * Property tax document. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |
| V60-0413 | 598 | * Loan document. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |
| V60-0414 | 599 | * Insurance. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |
| V60-0415 | 600 | * Valuation report. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |
| V60-0416 | 601 | * Utility bill. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |
| V60-0417 | 603 | Automatically extract the available property information. | PARTIAL |  | src/components/books/PropertyPanel.tsx upload links and src/lib/books/intake.ts ROUTE_OF/PropertyRead support property deeds, leases, utilities and document storage; books.test.ts covers deed/lease proposals only; extraction accuracy and this document-specific routing not fully verified. |

## v6.0 — 37. Property directory

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0418 | 605 | 37. Property directory | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0419 | 607 | Support: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0420 | 609 | Owner → Property → Building → Floor → Unit | PARTIAL |  | src/lib/books/types.ts Property/PropertyLinks and src/components/books/PropertyPanel.tsx maintain owner/building/floor/unit, asset, valuation and document/loan/insurance/tax links; books.test.ts covers basic property and occupancy, but full directory-field persistence is unverified. |
| V60-0421 | 611 | Maintain: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0422 | 613 | * Property details. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeProperty and src/lib/books/types.ts Property maintain property name, owner and address; src/lib/books/books.test.ts property-deed proposal verifies identity/owner/document association. |
| V60-0423 | 614 | * Legal ownership. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeProperty and src/lib/books/types.ts Property maintain property name, owner and address; src/lib/books/books.test.ts property-deed proposal verifies identity/owner/document association. |
| V60-0424 | 615 | * Location. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeProperty and src/lib/books/types.ts Property maintain property name, owner and address; src/lib/books/books.test.ts property-deed proposal verifies identity/owner/document association. |
| V60-0425 | 616 | * Acquisition details. | PARTIAL |  | src/lib/books/intake.ts PropertyRead extracts cost/acquiredOn, but Property schema primarily retains assetId/notes; full acquisition-detail persistence and verification not established. |
| V60-0426 | 617 | * Valuation. | PARTIAL |  | src/lib/books/types.ts Property/PropertyLinks and src/components/books/PropertyPanel.tsx maintain owner/building/floor/unit, asset, valuation and document/loan/insurance/tax links; books.test.ts covers basic property and occupancy, but full directory-field persistence is unverified. |
| V60-0427 | 618 | * Associated assets. | PARTIAL |  | src/lib/books/types.ts Property/PropertyLinks and src/components/books/PropertyPanel.tsx maintain owner/building/floor/unit, asset, valuation and document/loan/insurance/tax links; books.test.ts covers basic property and occupancy, but full directory-field persistence is unverified. |
| V60-0428 | 619 | * Loans. | PARTIAL |  | src/lib/books/types.ts Property/PropertyLinks and src/components/books/PropertyPanel.tsx maintain owner/building/floor/unit, asset, valuation and document/loan/insurance/tax links; books.test.ts covers basic property and occupancy, but full directory-field persistence is unverified. |
| V60-0429 | 620 | * Insurance. | PARTIAL |  | src/lib/books/types.ts Property/PropertyLinks and src/components/books/PropertyPanel.tsx maintain owner/building/floor/unit, asset, valuation and document/loan/insurance/tax links; books.test.ts covers basic property and occupancy, but full directory-field persistence is unverified. |
| V60-0430 | 621 | * Tax records. | PARTIAL |  | src/lib/books/types.ts Property/PropertyLinks and src/components/books/PropertyPanel.tsx maintain owner/building/floor/unit, asset, valuation and document/loan/insurance/tax links; books.test.ts covers basic property and occupancy, but full directory-field persistence is unverified. |
| V60-0431 | 622 | * Documents. | PARTIAL |  | src/lib/books/types.ts Property/PropertyLinks and src/components/books/PropertyPanel.tsx maintain owner/building/floor/unit, asset, valuation and document/loan/insurance/tax links; books.test.ts covers basic property and occupancy, but full directory-field persistence is unverified. |

## v6.0 — 38. Tenant onboarding

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0432 | 624 | 38. Tenant onboarding | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0433 | 626 | Read lease agreements and automatically propose: | PARTIAL |  | src/lib/books/intake.ts LeaseRead/proposeLease populate tenant, unit, dates, rent, escalation, deposit, due/notice/payment/GST fields; books.test.ts checks core lease draft, but field-specific extraction-to-save verification incomplete. |
| V60-0434 | 628 | * Tenant details. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeLease populates lease draft; src/lib/books/books.test.ts lease extraction asserts property/unit, rent, deposit, escalation and notice terms. |
| V60-0435 | 629 | * Property/unit. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeLease populates lease draft; src/lib/books/books.test.ts lease extraction asserts property/unit, rent, deposit, escalation and notice terms. |
| V60-0436 | 630 | * Lease period. | PARTIAL |  | src/lib/books/intake.ts LeaseRead/proposeLease populate tenant, unit, dates, rent, escalation, deposit, due/notice/payment/GST fields; books.test.ts checks core lease draft, but field-specific extraction-to-save verification incomplete. |
| V60-0437 | 631 | * Monthly rent. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeLease populates lease draft; src/lib/books/books.test.ts lease extraction asserts property/unit, rent, deposit, escalation and notice terms. |
| V60-0438 | 632 | * Escalation conditions. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeLease populates lease draft; src/lib/books/books.test.ts lease extraction asserts property/unit, rent, deposit, escalation and notice terms. |
| V60-0439 | 633 | * Security deposit. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeLease populates lease draft; src/lib/books/books.test.ts lease extraction asserts property/unit, rent, deposit, escalation and notice terms. |
| V60-0440 | 634 | * Due dates. | PARTIAL |  | src/lib/books/intake.ts LeaseRead/proposeLease populate tenant, unit, dates, rent, escalation, deposit, due/notice/payment/GST fields; books.test.ts checks core lease draft, but field-specific extraction-to-save verification incomplete. |
| V60-0441 | 635 | * Notice periods. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeLease populates lease draft; src/lib/books/books.test.ts lease extraction asserts property/unit, rent, deposit, escalation and notice terms. |
| V60-0442 | 636 | * Payment terms. | PARTIAL |  | src/lib/books/intake.ts LeaseRead/proposeLease populate tenant, unit, dates, rent, escalation, deposit, due/notice/payment/GST fields; books.test.ts checks core lease draft, but field-specific extraction-to-save verification incomplete. |
| V60-0443 | 637 | * Relevant tax information. | PARTIAL |  | src/lib/books/intake.ts LeaseRead/proposeLease populate tenant, unit, dates, rent, escalation, deposit, due/notice/payment/GST fields; books.test.ts checks core lease draft, but field-specific extraction-to-save verification incomplete. |
| V60-0444 | 639 | Do not require manually duplicating lease data. | PARTIAL |  | src/lib/books/intake.ts LeaseRead/proposeLease populate tenant, unit, dates, rent, escalation, deposit, due/notice/payment/GST fields; books.test.ts checks core lease draft, but field-specific extraction-to-save verification incomplete. |

## v6.0 — 39. Automated rent reconciliation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0445 | 641 | 39. Automated rent reconciliation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0446 | 643 | Match bank receipts with expected rent. | VERIFIED COMPLETE |  | src/lib/books/property.ts allocateReceipts/tenantLedger/receiptKind classify matched rent, partial/outstanding/advance, deposit and other receipts; src/lib/books/books.test.ts, v6-gaps.test.ts, v6-batch7.test.ts and v6-final.test.ts cover rent/deposit/uncertain receipts and carried arrears. |
| V60-0447 | 645 | Recognise: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0448 | 647 | * Rent received. | VERIFIED COMPLETE |  | src/lib/books/property.ts allocateReceipts/tenantLedger/receiptKind classify matched rent, partial/outstanding/advance, deposit and other receipts; src/lib/books/books.test.ts, v6-gaps.test.ts, v6-batch7.test.ts and v6-final.test.ts cover rent/deposit/uncertain receipts and carried arrears. |
| V60-0449 | 648 | * Partial payments. | VERIFIED COMPLETE |  | src/lib/books/property.ts allocateReceipts/tenantLedger/receiptKind classify matched rent, partial/outstanding/advance, deposit and other receipts; src/lib/books/books.test.ts, v6-gaps.test.ts, v6-batch7.test.ts and v6-final.test.ts cover rent/deposit/uncertain receipts and carried arrears. |
| V60-0450 | 649 | * Outstanding rent. | VERIFIED COMPLETE |  | src/lib/books/property.ts allocateReceipts/tenantLedger/receiptKind classify matched rent, partial/outstanding/advance, deposit and other receipts; src/lib/books/books.test.ts, v6-gaps.test.ts, v6-batch7.test.ts and v6-final.test.ts cover rent/deposit/uncertain receipts and carried arrears. |
| V60-0451 | 650 | * Advance rent. | VERIFIED COMPLETE |  | src/lib/books/property.ts allocateReceipts/tenantLedger/receiptKind classify matched rent, partial/outstanding/advance, deposit and other receipts; src/lib/books/books.test.ts, v6-gaps.test.ts, v6-batch7.test.ts and v6-final.test.ts cover rent/deposit/uncertain receipts and carried arrears. |
| V60-0452 | 651 | * Security deposits. | VERIFIED COMPLETE |  | src/lib/books/property.ts allocateReceipts/tenantLedger/receiptKind classify matched rent, partial/outstanding/advance, deposit and other receipts; src/lib/books/books.test.ts, v6-gaps.test.ts, v6-batch7.test.ts and v6-final.test.ts cover rent/deposit/uncertain receipts and carried arrears. |
| V60-0453 | 652 | * Other receipts. | VERIFIED COMPLETE |  | src/lib/books/property.ts allocateReceipts/tenantLedger/receiptKind classify matched rent, partial/outstanding/advance, deposit and other receipts; src/lib/books/books.test.ts, v6-gaps.test.ts, v6-batch7.test.ts and v6-final.test.ts cover rent/deposit/uncertain receipts and carried arrears. |
| V60-0454 | 654 | Do not automatically treat security deposits as rental income. | VERIFIED COMPLETE |  | src/lib/books/property.ts allocateReceipts/tenantLedger/receiptKind classify matched rent, partial/outstanding/advance, deposit and other receipts; src/lib/books/books.test.ts, v6-gaps.test.ts, v6-batch7.test.ts and v6-final.test.ts cover rent/deposit/uncertain receipts and carried arrears. |

## v6.0 — 40. Property operations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0455 | 656 | 40. Property operations | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0456 | 658 | Support: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0457 | 660 | * Lease management. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0458 | 661 | * Renewals. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0459 | 662 | * Rent escalation. | VERIFIED COMPLETE |  | src/lib/books/property.ts rentFor/tenantLedger/allocateReceipts implement escalation, tenant ledger and collection matching; src/lib/books/books.test.ts and v6-batch7.test.ts verify escalation, receipts and carried arrears. |
| V60-0460 | 663 | * Tenant ledger. | VERIFIED COMPLETE |  | src/lib/books/property.ts rentFor/tenantLedger/allocateReceipts implement escalation, tenant ledger and collection matching; src/lib/books/books.test.ts and v6-batch7.test.ts verify escalation, receipts and carried arrears. |
| V60-0461 | 664 | * Rent collection. | VERIFIED COMPLETE |  | src/lib/books/property.ts rentFor/tenantLedger/allocateReceipts implement escalation, tenant ledger and collection matching; src/lib/books/books.test.ts and v6-batch7.test.ts verify escalation, receipts and carried arrears. |
| V60-0462 | 665 | * Maintenance. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0463 | 666 | * Utilities. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0464 | 667 | * Property expenses. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0465 | 668 | * Vendors. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0466 | 669 | * Insurance. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0467 | 670 | * Property tax records. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0468 | 671 | * Capital improvements. | PARTIAL |  | src/components/books/PropertyPanel.tsx lease controls, costs, document/transaction links and src/lib/books/property.ts leaseAlerts/costSummary/propertyFollowUps support operations; end-to-end persistence and individual operation verification incomplete. |
| V60-0469 | 672 | * Occupancy reporting. | VERIFIED COMPLETE |  | src/lib/books/property.ts occupancy counts active leases against units; src/components/books/PropertyPanel.tsx displays occupancy; src/lib/books/books.test.ts asserts occupied/total units. |

## v6.0 — 41. Property accounting

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0470 | 674 | 41. Property accounting | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0471 | 676 | Link applicable transactions to: | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0472 | 678 | * Income and expenditure. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0473 | 679 | * Receivables. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0474 | 680 | * Deposits. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0475 | 681 | * Loans. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0476 | 682 | * Assets. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0477 | 683 | * Depreciation. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0478 | 684 | * GST. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0479 | 685 | * Income tax. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0480 | 687 | Avoid duplicate property valuation between Asset Management and Property Management. | PARTIAL |  | src/components/books/PropertyPanel.tsx uses shared transactions, linked assetId, depositAccountId, loanId and GST/document links; src/lib/books/property.ts propertyValue avoids standalone fallback duplication, but complete posting/tax integration and valuation deduplication verification not established. |
| V60-0481 | 691 | PART I — INVESTMENTS & DEMAT | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 42. Demat Controls integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0482 | 693 | 42. Demat Controls integration | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0483 | 695 | Retain the previously specified Demat Controls module. | VERIFIED COMPLETE |  | src/lib/investments/demat.ts and src/lib/investments/holdings-store.ts retain Demat parsing/storage; src/lib/investments/demat.test.ts verifies holdings/trades parsing. |
| V60-0484 | 697 | Support: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0485 | 699 | * ICICI Direct statements. | PARTIAL |  | src/lib/investments/demat.ts recognises ICICI Direct and investment holdings; src/lib/investments/demat.test.ts covers parser basics; complete instrument-specific import/valuation coverage not established. |
| V60-0486 | 700 | * Stocks. | PARTIAL |  | src/lib/investments/demat.ts recognises ICICI Direct and investment holdings; src/lib/investments/demat.test.ts covers parser basics; complete instrument-specific import/valuation coverage not established. |
| V60-0487 | 701 | * Mutual funds. | PARTIAL |  | src/lib/investments/demat.ts recognises ICICI Direct and investment holdings; src/lib/investments/demat.test.ts covers parser basics; complete instrument-specific import/valuation coverage not established. |
| V60-0488 | 702 | * ETFs. | PARTIAL |  | src/lib/investments/demat.ts recognises ICICI Direct and investment holdings; src/lib/investments/demat.test.ts covers parser basics; complete instrument-specific import/valuation coverage not established. |
| V60-0489 | 703 | * Gold. | PARTIAL |  | src/lib/investments/demat.ts recognises ICICI Direct and investment holdings; src/lib/investments/demat.test.ts covers parser basics; complete instrument-specific import/valuation coverage not established. |
| V60-0490 | 704 | * Bonds. | PARTIAL |  | src/lib/investments/demat.ts recognises ICICI Direct and investment holdings; src/lib/investments/demat.test.ts covers parser basics; complete instrument-specific import/valuation coverage not established. |
| V60-0491 | 705 | * Other investments. | PARTIAL |  | src/lib/investments/demat.ts recognises ICICI Direct and investment holdings; src/lib/investments/demat.test.ts covers parser basics; complete instrument-specific import/valuation coverage not established. |
| V60-0492 | 707 | Use Statement Desk for imports. | VERIFIED COMPLETE |  | src/lib/books/intake.ts ROUTE_OF routes demat/transaction/capital-gains/mutual-fund statements to investment intake; src/lib/books/fund-statement.ts and fund-statement.test.ts verify statement holding proposals. |
| V60-0493 | 709 | Store originals in DocuRepo. | PARTIAL |  | src/lib/books/intake.ts routes originals through DocuRepo and src/lib/books/commit.ts links intake records; original-file retention for every investment format lacks end-to-end verification. |

## v6.0 — 43. Investment automation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0494 | 711 | 43. Investment automation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0495 | 713 | Automatically identify: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0496 | 715 | * Holdings. | VERIFIED COMPLETE |  | src/lib/investments/demat.ts parses holdings and buy/sell trades; src/lib/investments/demat.test.ts covers demat parsing and src/lib/books/fund-statement.test.ts verifies units/NAV and existing ISIN updates. |
| V60-0497 | 716 | * Purchases. | VERIFIED COMPLETE |  | src/lib/investments/demat.ts parses holdings and buy/sell trades; src/lib/investments/demat.test.ts covers demat parsing and src/lib/books/fund-statement.test.ts verifies units/NAV and existing ISIN updates. |
| V60-0498 | 717 | * Sales. | VERIFIED COMPLETE |  | src/lib/investments/demat.ts parses holdings and buy/sell trades; src/lib/investments/demat.test.ts covers demat parsing and src/lib/books/fund-statement.test.ts verifies units/NAV and existing ISIN updates. |
| V60-0499 | 718 | * Dividends. | PARTIAL |  | src/lib/investments/demat.ts EVENT_RE parses dividends/redemptions and src/lib/books/investment-flows.ts tracks redemption cash; investment-flows.test.ts tests cash-flow exclusion, but complete automatic event extraction/posting verification incomplete. |
| V60-0500 | 719 | * Redemptions. | PARTIAL |  | src/lib/investments/demat.ts EVENT_RE parses dividends/redemptions and src/lib/books/investment-flows.ts tracks redemption cash; investment-flows.test.ts tests cash-flow exclusion, but complete automatic event extraction/posting verification incomplete. |
| V60-0501 | 720 | * Corporate actions. | VERIFIED COMPLETE |  | src/lib/books/recon.ts and src/lib/investments/ implement corporate actions, charges and evidenced lots; src/lib/books/corp-action.test.ts and src/lib/investments/demat.test.ts cover reconciliation/imports. |
| V60-0502 | 721 | * Brokerage charges. | VERIFIED COMPLETE |  | src/lib/books/recon.ts and src/lib/investments/ implement corporate actions, charges and evidenced lots; src/lib/books/corp-action.test.ts and src/lib/investments/demat.test.ts cover reconciliation/imports. |
| V60-0503 | 722 | * Cost basis where evidenced. | VERIFIED COMPLETE |  | src/lib/books/recon.ts and src/lib/investments/ implement corporate actions, charges and evidenced lots; src/lib/books/corp-action.test.ts and src/lib/investments/demat.test.ts cover reconciliation/imports. |
| V60-0504 | 723 | * Portfolio values where verified sources exist. | VERIFIED COMPLETE |  | src/lib/books/market.ts values holdings with ownership, quote date/source and quality, omitting unpriced positions; src/lib/books/books.test.ts market/net-worth cases verify ownership and missing/stale prices. |
| V60-0505 | 725 | Do not invent acquisition costs or current prices. | VERIFIED COMPLETE |  | src/lib/books/market.ts values holdings with ownership, quote date/source and quality, omitting unpriced positions; src/lib/books/books.test.ts market/net-worth cases verify ownership and missing/stale prices. |

## v6.0 — 44. Net-worth integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0506 | 727 | 44. Net-worth integration | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0507 | 729 | Include investment valuations with: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0508 | 731 | * Ownership. | VERIFIED COMPLETE |  | src/lib/books/market.ts values holdings with ownership, quote date/source and quality, omitting unpriced positions; src/lib/books/books.test.ts market/net-worth cases verify ownership and missing/stale prices. |
| V60-0509 | 732 | * Valuation date. | VERIFIED COMPLETE |  | src/lib/books/market.ts values holdings with ownership, quote date/source and quality, omitting unpriced positions; src/lib/books/books.test.ts market/net-worth cases verify ownership and missing/stale prices. |
| V60-0510 | 733 | * Data source. | VERIFIED COMPLETE |  | src/lib/books/market.ts values holdings with ownership, quote date/source and quality, omitting unpriced positions; src/lib/books/books.test.ts market/net-worth cases verify ownership and missing/stale prices. |
| V60-0511 | 734 | * Verification status. | VERIFIED COMPLETE |  | src/lib/books/market.ts values holdings with ownership, quote date/source and quality, omitting unpriced positions; src/lib/books/books.test.ts market/net-worth cases verify ownership and missing/stale prices. |
| V60-0512 | 736 | Avoid double-counting assets and brokerage cash. | PARTIAL |  | src/lib/books/recon.ts brokerCashOverlap flags overlap (src/lib/books/recon-extra.test.ts; docs/VERIFICATION_RESULTS.md); warning does not itself exclude duplicated brokerage cash from net worth. |
| V60-0513 | 740 | PART J — TAX & GST | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 45. Multi-entity Tax & Audit Centre

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0514 | 742 | 45. Multi-entity Tax & Audit Centre | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0515 | 744 | Support applicable taxation and reporting for: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0516 | 746 | * Individuals. | PARTIAL |  | src/lib/books/tax-full.ts, regulatory.ts formFor and components/books/TaxCentre.tsx support entity-specific workings; src/lib/books/tax-regression.test.ts covers core liability, but trusts/other entities and complete applicable statutory reporting are not verified. |
| V60-0517 | 747 | * Proprietorships. | PARTIAL |  | src/lib/books/tax-full.ts, regulatory.ts formFor and components/books/TaxCentre.tsx support entity-specific workings; src/lib/books/tax-regression.test.ts covers core liability, but trusts/other entities and complete applicable statutory reporting are not verified. |
| V60-0518 | 748 | * Companies. | PARTIAL |  | src/lib/books/tax-full.ts, regulatory.ts formFor and components/books/TaxCentre.tsx support entity-specific workings; src/lib/books/tax-regression.test.ts covers core liability, but trusts/other entities and complete applicable statutory reporting are not verified. |
| V60-0519 | 749 | * LLPs. | PARTIAL |  | src/lib/books/tax-full.ts, regulatory.ts formFor and components/books/TaxCentre.tsx support entity-specific workings; src/lib/books/tax-regression.test.ts covers core liability, but trusts/other entities and complete applicable statutory reporting are not verified. |
| V60-0520 | 750 | * Partnerships. | PARTIAL |  | src/lib/books/tax-full.ts, regulatory.ts formFor and components/books/TaxCentre.tsx support entity-specific workings; src/lib/books/tax-regression.test.ts covers core liability, but trusts/other entities and complete applicable statutory reporting are not verified. |
| V60-0521 | 751 | * Trusts. | PARTIAL |  | src/lib/books/tax-full.ts, regulatory.ts formFor and components/books/TaxCentre.tsx support entity-specific workings; src/lib/books/tax-regression.test.ts covers core liability, but trusts/other entities and complete applicable statutory reporting are not verified. |
| V60-0522 | 752 | * Other supported entities. | PARTIAL |  | src/lib/books/tax-full.ts, regulatory.ts formFor and components/books/TaxCentre.tsx support entity-specific workings; src/lib/books/tax-regression.test.ts covers core liability, but trusts/other entities and complete applicable statutory reporting are not verified. |
| V60-0523 | 754 | Every entity must have its own tax profile and filing obligations. | VERIFIED COMPLETE |  | src/lib/books/entity-tax-profile.ts and compliance.ts maintain per-entity profiles/obligations; src/lib/books/compliance.test.ts and entity-accounts.test.ts verify scoping. |

## v6.0 — 46. Automated tax preparation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0524 | 756 | 46. Automated tax preparation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0525 | 758 | Use: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0526 | 760 | * Financial statements. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0527 | 761 | * Bank transactions. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0528 | 762 | * Salary documents. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0529 | 763 | * Rental income. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0530 | 764 | * Investment records. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0531 | 765 | * Loan information. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0532 | 766 | * Asset depreciation. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0533 | 767 | * Tax statements. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0534 | 768 | * Previously filed returns. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts consumes saved transactions, salary evidence, rental receipts, gains, loan interest, depreciation and filed-return losses; src/lib/books/books.test.ts and tax-workpaper.test.ts cover sourced tax workings. |
| V60-0535 | 770 | Prepare applicable tax computations and return data. | PARTIAL |  | src/lib/books/tax-full.ts computes liabilities/ITR working JSON; tax-regression.test.ts covers calculations; regulatory.ts RETURN_SCHEMAS has null hashes so official validated returns remain unavailable. |
| V60-0536 | 772 | Do not invent deductions or tax credits. | PARTIAL |  | src/lib/books/taxcomp.ts refuses assumed Chapter VI-A deductions, but tax-full.ts chapterVIA sums supplied amounts without checking documentary evidence; tax-workpaper.test.ts checks provenance, not mandatory evidence gating. |

## v6.0 — 47. GST

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0537 | 774 | 47. GST | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0538 | 776 | Support relevant GSTIN-specific: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0539 | 778 | * Invoice register. | PARTIAL | src/components/books/TaxCentre.tsx, src/lib/books/gst.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0540 | 779 | * GSTR-1 preparation. | PARTIAL | src/lib/books/gst.ts, src/lib/books/gst-special.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0541 | 780 | * GSTR-3B preparation. | PARTIAL | src/lib/books/gst.ts, src/lib/books/gst-special.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0542 | 781 | * GSTR-2B reconciliation. | VERIFIED COMPLETE |  | src/lib/books/gst.ts, gst-special.ts and compliance.ts implement GSTIN-scoped registers, GSTR workings, reconciliation, ITC and payment matching; src/lib/books/books.test.ts, compliance.test.ts, gst-special.test.ts and src/lib/gstr2b.test.ts verify rules. |
| V60-0543 | 782 | * Input tax credit review. | PARTIAL | src/lib/books/compliance.ts, src/lib/books/gst.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0544 | 783 | * GST payment matching. | VERIFIED COMPLETE |  | src/lib/books/gst.ts, gst-special.ts and compliance.ts implement GSTIN-scoped registers, GSTR workings, reconciliation, ITC and payment matching; src/lib/books/books.test.ts, compliance.test.ts, gst-special.test.ts and src/lib/gstr2b.test.ts verify rules. |
| V60-0545 | 784 | * Applicable annual returns. | PARTIAL |  | src/lib/books/gst.ts gstr9Heads provides annual working totals with tests in src/lib/books/gst-special.test.ts; complete applicable official annual return generation is not established. |
| V60-0546 | 785 | * Filing evidence. | PARTIAL | src/components/books/TaxCentre.tsx, src/lib/books/types.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0547 | 787 | Recognise the actual filing scheme and applicable obligations. | PARTIAL | src/lib/books/compliance.ts, src/components/books/TaxCentre.tsx | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |

## v6.0 — 48. Filing

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0548 | 789 | 48. Filing | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0549 | 791 | Prepare validated draft returns and supporting reports. | PARTIAL |  | src/lib/books/regulatory.ts validateReturnDraft refuses unpinned schemas; src/lib/books/itr-handoff.ts produces accountant handoff, itr-handoff.test.ts tests it; validated official drafts not implemented with pinned schemas. |
| V60-0550 | 793 | Actual statutory filing must require explicit approval and use an authorised method. | PARTIAL |  | src/lib/books/itr-handoff.ts limits output to accountant drafts (itr-handoff.test.ts); no authorised statutory submission integration or end-to-end approval/submission verification found. |
| V60-0551 | 797 | PART K — REGULATORY INTELLIGENCE | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 49. Automated government-rule monitoring

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0552 | 799 | 49. Automated government-rule monitoring | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0553 | 801 | Build a version-controlled Regulatory Intelligence Engine. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts versions rules and lists official sources; src/lib/books/rule-watch.ts fingerprints changes; rule-watch.test.ts and books.test.ts verify proposals and preserved history. |
| V60-0554 | 803 | Monitor appropriate official sources for: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0555 | 805 | * Income-tax changes. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |
| V60-0556 | 806 | * GST changes. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |
| V60-0557 | 807 | * Corporate reporting changes. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |
| V60-0558 | 808 | * Depreciation rules. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |
| V60-0559 | 809 | * Return formats. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |
| V60-0560 | 810 | * Filing schemas. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |
| V60-0561 | 811 | * Validation rules. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |
| V60-0562 | 812 | * Due dates. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |
| V60-0563 | 813 | * Relevant property-related compliance. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts OFFICIAL_SOURCES includes tax/GST/MCA/depreciation/form/property sources; rule-watch.ts classifies schema/validation/due-date headlines; rule-watch.test.ts verifies detection, not legal interpretation. |

## v6.0 — 50. Rule updates

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0564 | 815 | 50. Rule updates | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0565 | 817 | For every change: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0566 | 819 | * Preserve the source. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts RuleVersion proposals retain source/publication/effective dates; src/lib/books/books.test.ts tests rule proposals and historical windows. |
| V60-0567 | 820 | * Record publication and effective dates. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts RuleVersion proposals retain source/publication/effective dates; src/lib/books/books.test.ts tests rule proposals and historical windows. |
| V60-0568 | 821 | * Determine affected entities. | PARTIAL |  | src/lib/books/regulatory.ts preserves effective windows and rule areas; books.test.ts verifies date selection, but automatic affected-entity and period impact analysis is not established. |
| V60-0569 | 822 | * Determine affected periods. | PARTIAL |  | src/lib/books/regulatory.ts preserves effective windows and rule areas; books.test.ts verifies date selection, but automatic affected-entity and period impact analysis is not established. |
| V60-0570 | 823 | * Compare previous and new rules. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts proposeRule/validateRule/activateRule compare, test, flag ambiguity and activate approved versions; src/lib/books/books.test.ts and journal-rule-guard-sql.test.ts verify activation guards. |
| V60-0571 | 824 | * Run validation tests. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts proposeRule/validateRule/activateRule compare, test, flag ambiguity and activate approved versions; src/lib/books/books.test.ts and journal-rule-guard-sql.test.ts verify activation guards. |
| V60-0572 | 825 | * Flag ambiguity. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts proposeRule/validateRule/activateRule compare, test, flag ambiguity and activate approved versions; src/lib/books/books.test.ts and journal-rule-guard-sql.test.ts verify activation guards. |
| V60-0573 | 826 | * Obtain appropriate approval. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts proposeRule/validateRule/activateRule compare, test, flag ambiguity and activate approved versions; src/lib/books/books.test.ts and journal-rule-guard-sql.test.ts verify activation guards. |
| V60-0574 | 827 | * Activate validated changes. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts proposeRule/validateRule/activateRule compare, test, flag ambiguity and activate approved versions; src/lib/books/books.test.ts and journal-rule-guard-sql.test.ts verify activation guards. |
| V60-0575 | 829 | Do not silently alter filed returns or closed financial years. | VERIFIED COMPLETE |  | src/lib/books/periods.ts and drizzle/migrations/ safeguards freeze closed records; src/lib/books/journal-rule-guard-sql.test.ts, frozen-registers-sql.test.ts and freeze-sql.test.ts verify immutability. |

## v6.0 — 51. Automatic form generation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0576 | 831 | 51. Automatic form generation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0577 | 833 | Generate filing drafts using applicable, validated official schemas. | PARTIAL |  | src/lib/books/regulatory.ts retains FORM_VERSIONS metadata, but RETURN_SCHEMAS hashes are null and actual historical official schemas are not retained/validated; books.test.ts checks form selection only. |
| V60-0578 | 835 | Retain historical form versions. | PARTIAL |  | src/lib/books/regulatory.ts retains FORM_VERSIONS metadata, but RETURN_SCHEMAS hashes are null and actual historical official schemas are not retained/validated; books.test.ts checks form selection only. |
| V60-0579 | 837 | An automatically generated return is not a submitted return. | VERIFIED COMPLETE |  | src/lib/books/itr-handoff.ts and regulatory.ts label generated files workings, not submissions; src/lib/books/itr-handoff.test.ts verifies draft limitations. |
| V60-0580 | 841 | PART L — CONTINUOUS AUDIT | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 52. Always audit-ready

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0581 | 843 | 52. Always audit-ready | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0582 | 845 | Implement continuous checks instead of waiting until year-end. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0583 | 847 | Track: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0584 | 849 | * Unreconciled bank entries. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0585 | 850 | * Incorrect classifications. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0586 | 851 | * Missing invoices. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0587 | 852 | * Duplicate transactions. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0588 | 853 | * Asset registration gaps. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0589 | 854 | * Depreciation differences. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0590 | 855 | * Property/rent discrepancies. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0591 | 856 | * Tax mismatches. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0592 | 857 | * GST exceptions. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0593 | 858 | * Investment cost-basis gaps. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0594 | 859 | * Intercompany differences. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |
| V60-0595 | 860 | * Missing financial documents. | VERIFIED COMPLETE |  | src/lib/books/audit.ts continuousAudit combines unreconciled/classification/duplicate/assets/depreciation/property/tax/GST/cost/intercompany/document findings; src/lib/books/books.test.ts, recon-extra.test.ts and src/lib/audit-dashboard.test.ts cover underlying checks. |

## v6.0 — 53. Financial Inbox integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0596 | 862 | 53. Financial Inbox integration | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0597 | 864 | Use the existing Financial Inbox to resolve exceptions. | VERIFIED COMPLETE |  | src/lib/books/audit.ts AuditItem/groupBy and src/routes/_authenticated/inbox.tsx integrate findings into Financial Inbox with entity/account/FY/type/risk/evidence; src/lib/books/v6-final.test.ts and books.test.ts verify grouping/rules. |
| V60-0598 | 866 | Do not create competing issue queues. | VERIFIED COMPLETE |  | src/lib/books/audit.ts AuditItem/groupBy and src/routes/_authenticated/inbox.tsx integrate findings into Financial Inbox with entity/account/FY/type/risk/evidence; src/lib/books/v6-final.test.ts and books.test.ts verify grouping/rules. |
| V60-0599 | 868 | Group issues by: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0600 | 870 | * Entity. | VERIFIED COMPLETE |  | src/lib/books/audit.ts AuditItem/groupBy and src/routes/_authenticated/inbox.tsx integrate findings into Financial Inbox with entity/account/FY/type/risk/evidence; src/lib/books/v6-final.test.ts and books.test.ts verify grouping/rules. |
| V60-0601 | 871 | * Account. | VERIFIED COMPLETE |  | src/lib/books/audit.ts AuditItem/groupBy and src/routes/_authenticated/inbox.tsx integrate findings into Financial Inbox with entity/account/FY/type/risk/evidence; src/lib/books/v6-final.test.ts and books.test.ts verify grouping/rules. |
| V60-0602 | 872 | * Financial year. | VERIFIED COMPLETE |  | src/lib/books/audit.ts AuditItem/groupBy and src/routes/_authenticated/inbox.tsx integrate findings into Financial Inbox with entity/account/FY/type/risk/evidence; src/lib/books/v6-final.test.ts and books.test.ts verify grouping/rules. |
| V60-0603 | 873 | * Issue type. | VERIFIED COMPLETE |  | src/lib/books/audit.ts AuditItem/groupBy and src/routes/_authenticated/inbox.tsx integrate findings into Financial Inbox with entity/account/FY/type/risk/evidence; src/lib/books/v6-final.test.ts and books.test.ts verify grouping/rules. |
| V60-0604 | 874 | * Risk. | VERIFIED COMPLETE |  | src/lib/books/audit.ts AuditItem/groupBy and src/routes/_authenticated/inbox.tsx integrate findings into Financial Inbox with entity/account/FY/type/risk/evidence; src/lib/books/v6-final.test.ts and books.test.ts verify grouping/rules. |
| V60-0605 | 875 | * Supporting evidence. | VERIFIED COMPLETE |  | src/lib/books/audit.ts AuditItem/groupBy and src/routes/_authenticated/inbox.tsx integrate findings into Financial Inbox with entity/account/FY/type/risk/evidence; src/lib/books/v6-final.test.ts and books.test.ts verify grouping/rules. |

## v6.0 — 54. Audit-readiness dashboard

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0606 | 877 | 54. Audit-readiness dashboard | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0607 | 879 | Display: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0608 | 881 | * Reconciled accounts. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0609 | 882 | * Open exceptions. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0610 | 883 | * Missing evidence. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0611 | 884 | * Closed accounting periods. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0612 | 885 | * Draft reports. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0613 | 886 | * Pending tax preparation. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0614 | 887 | * Unverified balances. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0615 | 888 | * Required approvals. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0616 | 890 | Readiness indicators must reflect actual verified data. | VERIFIED COMPLETE |  | src/lib/books/audit.ts readinessTiles and src/routes/_authenticated/audit.tsx derive accounts, exceptions, evidence, closures, drafts, tax and approvals from saved records; src/lib/books/v6-final.test.ts and docs/VERIFICATION_RESULTS.md document dashboard/figure-source verification. |
| V60-0617 | 894 | PART M — AUTOMATION LEVELS | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 55. Automatic operations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0618 | 896 | 55. Automatic operations | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0619 | 898 | Permit safe automatic: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0620 | 900 | * Document classification. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0621 | 901 | * Data extraction. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0622 | 902 | * Merchant recognition. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0623 | 903 | * Entity matching. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0624 | 904 | * Document linking. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0625 | 905 | * Duplicate detection. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0626 | 906 | * Draft report generation. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0627 | 907 | * Reminder generation. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0628 | 908 | * Read-only regulatory monitoring. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |
| V60-0629 | 909 | * Calculation previews. | VERIFIED COMPLETE |  | src/lib/books/intake.ts, src/lib/document-extract.functions.ts, src/lib/books/rule-watch.ts and src/lib/report-centre.ts provide read-only proposals/extraction/reports; src/lib/books/books.test.ts, rule-watch.test.ts and src/lib/report-centre.test.ts cover supported automatic preparation. |

## v6.0 — 56. Confirmation-based operations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0630 | 911 | 56. Confirmation-based operations | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0631 | 913 | Require review according to an approved policy for: | PARTIAL | src/lib/store.tsx, src/lib/preference-review.ts, drizzle/migrations/0080_reviewed_preference_saves.sql | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0632 | 915 | * Opening balances. | PARTIAL |  | src/lib/books/intake.ts, src/components/DocumentIntake.tsx and src/lib/books/periods.ts provide reviewed proposals; src/lib/books/preference-approval-sql.test.ts tests server guard, but docs/VERIFICATION_RESULTS.md explicitly says sensitive direct-write guard remains staged, not installed. |
| V60-0633 | 916 | * Asset capitalisation. | PARTIAL |  | src/lib/books/intake.ts, src/components/DocumentIntake.tsx and src/lib/books/periods.ts provide reviewed proposals; src/lib/books/preference-approval-sql.test.ts tests server guard, but docs/VERIFICATION_RESULTS.md explicitly says sensitive direct-write guard remains staged, not installed. |
| V60-0634 | 917 | * Transaction reclassification. | PARTIAL |  | src/lib/books/intake.ts, src/components/DocumentIntake.tsx and src/lib/books/periods.ts provide reviewed proposals; src/lib/books/preference-approval-sql.test.ts tests server guard, but docs/VERIFICATION_RESULTS.md explicitly says sensitive direct-write guard remains staged, not installed. |
| V60-0635 | 918 | * Property and tenant associations. | PARTIAL | src/lib/preference-review.ts, src/components/books/PropertyPanel.tsx | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0636 | 919 | * Depreciation posting. | PARTIAL |  | src/lib/books/intake.ts, src/components/DocumentIntake.tsx and src/lib/books/periods.ts provide reviewed proposals; src/lib/books/preference-approval-sql.test.ts tests server guard, but docs/VERIFICATION_RESULTS.md explicitly says sensitive direct-write guard remains staged, not installed. |
| V60-0637 | 920 | * Tax treatment changes. | PARTIAL | src/lib/preference-review.ts, src/components/books/TaxCentre.tsx | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0638 | 921 | * Historical corrections. | PARTIAL |  | src/lib/books/intake.ts, src/components/DocumentIntake.tsx and src/lib/books/periods.ts provide reviewed proposals; src/lib/books/preference-approval-sql.test.ts tests server guard, but docs/VERIFICATION_RESULTS.md explicitly says sensitive direct-write guard remains staged, not installed. |
| V60-0639 | 922 | * Reimbursement settlements. | PARTIAL |  | src/lib/books/intake.ts, src/components/DocumentIntake.tsx and src/lib/books/periods.ts provide reviewed proposals; src/lib/books/preference-approval-sql.test.ts tests server guard, but docs/VERIFICATION_RESULTS.md explicitly says sensitive direct-write guard remains staged, not installed. |

## v6.0 — 57. Restricted operations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0640 | 924 | 57. Restricted operations | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0641 | 926 | Require explicit authorised approval for: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0642 | 928 | * Closed-period changes. | PARTIAL | drizzle/migrations/0081_closed_gst_amendment_guard.sql, drizzle/migrations/0069_freeze_financial_registers.sql | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0643 | 929 | * Shared database migrations. | MISSING |  | No application-level shared migration authorisation workflow found; drizzle/migrations/ contains migrations, not an enforced explicit-authorisation gate. |
| V60-0644 | 930 | * Financial statement finalisation. | PARTIAL |  | src/lib/report-status.ts distinguishes report status with report-status.test.ts; financial statement finalisation authorisation across all writers is not verified. |
| V60-0645 | 931 | * Statutory filing. | PARTIAL |  | src/lib/books/itr-handoff.ts provides draft-only handoff and no automatic filing/certification (itr-handoff.test.ts); no authorised statutory filing/certification workflow implemented. |
| V60-0646 | 932 | * Statutory certification. | PARTIAL |  | src/lib/books/itr-handoff.ts provides draft-only handoff and no automatic filing/certification (itr-handoff.test.ts); no authorised statutory filing/certification workflow implemented. |
| V60-0647 | 933 | * Production deployment. | MISSING |  | No enforced production deployment approval mechanism found in application code; docs/VERIFICATION_RESULTS.md documents publishing but does not establish a deployment approval gate. |
| V60-0648 | 937 | PART N — USER EXPERIENCE | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 58. Zero routine manual entry

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0649 | 939 | 58. Zero routine manual entry | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0650 | 941 | The default user action should be: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0651 | 943 | Upload a document. | VERIFIED COMPLETE |  | src/components/DocumentIntake.tsx and Statement Desk provide document upload as entry workflow; src/lib/books/books.test.ts and docs/IMPLEMENTATION_PROGRESS.md verify intake integration. |
| V60-0652 | 945 | Ledgerline should do the rest of the supported extraction and preparation. | PARTIAL |  | src/components/DocumentIntake.tsx and src/lib/books/intake.ts show extraction/proposals/missing fields and confirmation; books.test.ts tests pure proposals, but complete extraction/reuse across supported documents lacks real-document accuracy verification (docs/VERIFICATION_RESULTS.md). |
| V60-0653 | 947 | The user should mainly see: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0654 | 949 | * Information extracted. | PARTIAL |  | src/components/DocumentIntake.tsx and src/lib/books/intake.ts show extraction/proposals/missing fields and confirmation; books.test.ts tests pure proposals, but complete extraction/reuse across supported documents lacks real-document accuracy verification (docs/VERIFICATION_RESULTS.md). |
| V60-0655 | 950 | * Records identified. | PARTIAL |  | src/components/DocumentIntake.tsx and src/lib/books/intake.ts show extraction/proposals/missing fields and confirmation; books.test.ts tests pure proposals, but complete extraction/reuse across supported documents lacks real-document accuracy verification (docs/VERIFICATION_RESULTS.md). |
| V60-0656 | 951 | * Records proposed. | PARTIAL |  | src/components/DocumentIntake.tsx and src/lib/books/intake.ts show extraction/proposals/missing fields and confirmation; books.test.ts tests pure proposals, but complete extraction/reuse across supported documents lacks real-document accuracy verification (docs/VERIFICATION_RESULTS.md). |
| V60-0657 | 952 | * Conflicts detected. | PARTIAL |  | src/components/DocumentIntake.tsx and src/lib/books/intake.ts show extraction/proposals/missing fields and confirmation; books.test.ts tests pure proposals, but complete extraction/reuse across supported documents lacks real-document accuracy verification (docs/VERIFICATION_RESULTS.md). |
| V60-0658 | 953 | * Actions requiring approval. | PARTIAL |  | src/components/DocumentIntake.tsx and src/lib/books/intake.ts show extraction/proposals/missing fields and confirmation; books.test.ts tests pure proposals, but complete extraction/reuse across supported documents lacks real-document accuracy verification (docs/VERIFICATION_RESULTS.md). |
| V60-0659 | 955 | Do not force the user to repeatedly type information already available in verified documents. | PARTIAL |  | src/components/DocumentIntake.tsx and src/lib/books/intake.ts show extraction/proposals/missing fields and confirmation; books.test.ts tests pure proposals, but complete extraction/reuse across supported documents lacks real-document accuracy verification (docs/VERIFICATION_RESULTS.md). |

## v6.0 — 59. Missing-information handling

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0660 | 957 | 59. Missing-information handling | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0661 | 959 | When a required field cannot be extracted: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 1. Search existing trusted records.

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0662 | 961 | 1. Search existing trusted records. | PARTIAL |  | src/lib/books/intake.ts matchEntity/canonicalField/fillLeaseFromTrusted and DocumentIntake.tsx reuse trusted values/mappings and show missing fields; v6-gaps.test.ts covers matches, not the required ordered five-step fallback across all document types. |
| V60-0663 | 962 | 2. Search related documents. | PARTIAL |  | src/lib/books/intake.ts matchEntity/canonicalField/fillLeaseFromTrusted and DocumentIntake.tsx reuse trusted values/mappings and show missing fields; v6-gaps.test.ts covers matches, not the required ordered five-step fallback across all document types. |
| V60-0664 | 963 | 3. Check approved mappings. | PARTIAL |  | src/lib/books/intake.ts matchEntity/canonicalField/fillLeaseFromTrusted and DocumentIntake.tsx reuse trusted values/mappings and show missing fields; v6-gaps.test.ts covers matches, not the required ordered five-step fallback across all document types. |
| V60-0665 | 964 | 4. Identify whether the field can be derived reliably. | PARTIAL |  | src/lib/books/intake.ts matchEntity/canonicalField/fillLeaseFromTrusted and DocumentIntake.tsx reuse trusted values/mappings and show missing fields; v6-gaps.test.ts covers matches, not the required ordered five-step fallback across all document types. |
| V60-0666 | 965 | 5. Ask for the smallest possible missing piece of information. | PARTIAL |  | src/lib/books/intake.ts matchEntity/canonicalField/fillLeaseFromTrusted and DocumentIntake.tsx reuse trusted values/mappings and show missing fields; v6-gaps.test.ts covers matches, not the required ordered five-step fallback across all document types. |
| V60-0667 | 967 | Offer correction directly on the extracted field. | PARTIAL | src/lib/books/source-corrections.ts, src/components/DocumentIntake.tsx | 5 source-correction regressions PASS; printed originals retained; invalid numbers refused |
| V60-0668 | 969 | Do not invent values to avoid asking the user. | PARTIAL |  | src/lib/books/intake.ts returns missing costs/dates but proposeAsset falls back to purchaseDate for inUse and proposeGstInvoice defaults unextracted tax heads to zero; books.test.ts does not prove a universal no-invention guarantee. |

## v6.0 — 60. iPhone, iPad and desktop

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0669 | 971 | 60. iPhone, iPad and desktop | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0670 | 973 | Provide fully responsive layouts. | PARTIAL |  | src/components/DocumentIntake.tsx and authenticated layouts use responsive styling; docs/DELIVERABLES.md records phone/tablet layout checks but screenshots/physical-device verification and comprehensive control-occlusion checks are incomplete. |
| V60-0671 | 975 | On iPad landscape, prefer list-and-detail views. | PARTIAL |  | src/components/DocumentIntake.tsx and authenticated layouts use responsive styling; docs/DELIVERABLES.md records phone/tablet layout checks but screenshots/physical-device verification and comprehensive control-occlusion checks are incomplete. |
| V60-0672 | 977 | On mobile, keep confirmation actions accessible and avoid oversized tables. | PARTIAL |  | src/components/DocumentIntake.tsx and authenticated layouts use responsive styling; docs/DELIVERABLES.md records phone/tablet layout checks but screenshots/physical-device verification and comprehensive control-occlusion checks are incomplete. |
| V60-0673 | 979 | Ensure the bottom navigation never covers essential controls. | PARTIAL |  | src/components/DocumentIntake.tsx and authenticated layouts use responsive styling; docs/DELIVERABLES.md records phone/tablet layout checks but screenshots/physical-device verification and comprehensive control-occlusion checks are incomplete. |
| V60-0674 | 983 | PART O — IMPLEMENTATION PLAN | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 61. Phase 1 — Existing application audit

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0675 | 985 | 61. Phase 1 — Existing application audit | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0676 | 987 | Inspect the current Ledgerline implementation. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0677 | 989 | Identify: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0678 | 991 | * Existing Statement Desk. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0679 | 992 | * Document handling. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0680 | 993 | * Financial ledger. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0681 | 994 | * Accounts. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0682 | 995 | * Entity directory. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0683 | 996 | * Tax modules. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0684 | 997 | * Investments. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0685 | 998 | * Assets. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0686 | 999 | * Property functionality. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0687 | 1000 | * Financial Inbox. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0688 | 1001 | * Reports. | VERIFIED COMPLETE |  | Existing implementation inventory documented in .lovable/requirements/audit-2026-11-06.md and docs/IMPLEMENTATION_PROGRESS.md; existing src/lib/books/, financial ledger, inbox and authenticated routes inspected; docs/VERIFICATION_RESULTS.md records regression suite. |
| V60-0689 | 1003 | Preserve working functionality. | PARTIAL |  | docs/VERIFICATION_RESULTS.md records 1,721 passing tests; broad regression evidence exists but preserving all existing functionality cannot be concluded from suite totals alone. |

## v6.0 — 62. Phase 2 — Document foundation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0690 | 1005 | 62. Phase 2 — Document foundation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0691 | 1007 | Develop the integrated Statement Desk and DocuRepo processing system. | VERIFIED COMPLETE |  | src/components/DocumentIntake.tsx, src/lib/books/docrepo.ts and intake.ts integrate extraction/routing/evidence; src/lib/books/books.test.ts, typed-intake-sql.test.ts and docrepo-search.test.ts verify supported paths. |
| V60-0692 | 1009 | Verify automatic classification, extraction, evidence storage and routing. | VERIFIED COMPLETE |  | src/components/DocumentIntake.tsx, src/lib/books/docrepo.ts and intake.ts integrate extraction/routing/evidence; src/lib/books/books.test.ts, typed-intake-sql.test.ts and docrepo-search.test.ts verify supported paths. |

## v6.0 — 63. Phase 3 — Entity and historical onboarding

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0693 | 1011 | 63. Phase 3 — Entity and historical onboarding | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0694 | 1013 | Implement document-driven entity creation and prior-year financial statement ingestion. | VERIFIED COMPLETE |  | src/lib/books/intake.ts proposeEntity/proposeFy and fy.ts implement document-derived onboarding/openings; src/lib/books/books.test.ts cases 1–4 and opening-sql.test.ts verify drafts/guards. |

## v6.0 — 64. Phase 4 — Financial automation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0695 | 1015 | 64. Phase 4 — Financial automation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0696 | 1017 | Complete reconciliation, matching, transaction classification and continuous exception detection. | PARTIAL |  | src/lib/books/recon.ts and audit.ts plus statement-pipeline implement matching/classification/exceptions with recon.test.ts and books.test.ts; completeness across every reconciliation and incorrect classification is not established. |

## v6.0 — 65. Phase 5 — Asset and Property Management

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0697 | 1019 | 65. Phase 5 — Asset and Property Management | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0698 | 1021 | Implement extensive registers, operational workflows, document mapping and financial links. | PARTIAL |  | src/lib/books/property.ts, assets-ledger.ts and docrepo.ts implement registers/financial links; books.test.ts and asset-verification.test.ts cover key paths, not all extensive operational workflows. |

## v6.0 — 66. Phase 6 — Depreciation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0699 | 1023 | 66. Phase 6 — Depreciation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0700 | 1025 | Implement separate book and tax depreciation engines and tested schedules. | VERIFIED COMPLETE |  | src/lib/assets.ts and src/lib/books/depreciation.ts implement separate book/tax schedules; src/lib/assets.test.ts and src/lib/books/scheduled-depreciation.test.ts verify engines. |

## v6.0 — 67. Phase 7 — Tax and regulatory integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0701 | 1027 | 67. Phase 7 — Tax and regulatory integration | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0702 | 1029 | Connect Income Tax, GST, validated filing formats and official rule monitoring. | PARTIAL |  | src/lib/books/tax-full.ts, gst.ts and rule-watch.ts connect tax/GST/monitoring with tax-regression.test.ts and rule-watch.test.ts; regulatory.ts contains no pinned official return schemas. |

## v6.0 — 68. Phase 8 — Continuous auditing

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0703 | 1031 | 68. Phase 8 — Continuous auditing | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0704 | 1033 | Implement proactive checks, review workflows and period-closing evidence. | PARTIAL | src/routes/_authenticated/audit.tsx, src/components/books/PeriodEvidence.tsx, drizzle/migrations/0070_authoritative_period_close_evidence.sql, drizzle/migrations/0072_period_recovery_authority.sql, drizzle/migrations/0073_period_authority_preference_upserts.sql, src/lib/books/period-recovery-sql.test.ts | 7 PostgreSQL period-evidence tests PASS; isolated /audit close/download/reload/reopen PASS; screenshots inspected; 8 isolated PostgreSQL recovery/authority cases PASS; applied safeguards read back in Cloud; isolated Audit imported-history label/download + close/reopen PASS; backup recovery PASS |

## v6.0 — 69. Phase 9 — Verification

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0705 | 1035 | 69. Phase 9 — Verification | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0706 | 1037 | Run isolated end-to-end tests using complete document-to-report workflows. | PARTIAL |  | src/lib/books/books.test.ts mandatory matrix and SQL tests cover components; docs/VERIFICATION_RESULTS.md excludes real-document extraction and hosted write acceptance; complete isolated upload-to-report E2E not demonstrated. |

## v6.0 — 70. Phase 10 — Acceptance

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0707 | 1039 | 70. Phase 10 — Acceptance | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0708 | 1041 | Submit full implementation evidence and await explicit approval. | PARTIAL |  | docs/DELIVERABLES.md and docs/VERIFICATION_RESULTS.md submit evidence but accuracy, responsive screenshots and deployment readiness remain partial; explicit final acceptance not documented. |
| V60-0709 | 1045 | PART P — VERIFICATION REQUIREMENTS | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.0 — 71. Mandatory tests

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0710 | 1047 | 71. Mandatory tests | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0711 | 1049 | At minimum, verify: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0712 | 1051 | 1. Upload company incorporation documents and generate a draft entity profile. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0713 | 1052 | 2. Re-upload the same documents without creating duplicates. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0714 | 1053 | 3. Upload a prior-year audited balance sheet and prepare opening balances. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0715 | 1054 | 4. Detect incomplete audited schedules without fabricating missing details. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0716 | 1055 | 5. Upload an asset invoice and generate a proposed asset record. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0717 | 1056 | 6. Calculate book and tax depreciation separately. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0718 | 1057 | 7. Upload a property deed and generate a proposed property record. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0719 | 1058 | 8. Upload a lease and extract tenant, rent, deposit and escalation terms. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0720 | 1059 | 9. Match rental receipts from bank statements. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0721 | 1060 | 10. Distinguish security deposits from rental income. | PARTIAL |  | src/lib/books/books.test.ts cases 1–10 test parsed inputs, proposals, depreciation and rental rules in src/lib/books/intake.ts and src/lib/books/property.ts; tests do not upload real documents through extraction UI end to end. |
| V60-0722 | 1061 | 11. Import ICICI Direct holdings through Statement Desk. | VERIFIED COMPLETE |  | src/lib/investments/ and src/lib/books/intake.ts support ICICI holdings and deduplication; src/lib/books/books.test.ts cases 11–12 and src/lib/investments/demat.test.ts exercise reader/reimport. |
| V60-0723 | 1062 | 12. Reconcile investment holdings without duplicates. | VERIFIED COMPLETE |  | src/lib/investments/ and src/lib/books/intake.ts support ICICI holdings and deduplication; src/lib/books/books.test.ts cases 11–12 and src/lib/investments/demat.test.ts exercise reader/reimport. |
| V60-0724 | 1063 | 13. Detect a new applicable regulatory rule. | PARTIAL |  | src/lib/books/rule-watch.ts and regulatory.ts detect headlines and propose rules; rule-watch.test.ts/books.test.ts case 13 use fixtures, not demonstrated new applicable live legal-rule detection. |
| V60-0725 | 1064 | 14. Preserve historical calculations under the previous rule. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts ruleOn preserves effective historical versions; src/lib/books/books.test.ts case 14 and journal-rule-guard-sql.test.ts verify version/immutability behavior. |
| V60-0726 | 1065 | 15. Generate the correct period-specific tax form draft. | PARTIAL |  | src/lib/books/regulatory.ts formFor selects period metadata (books.test.ts case 15), but all RETURN_SCHEMAS schemaHash values are null; correct official period-specific form draft is not verified. |
| V60-0727 | 1066 | 16. Process a bank debit without an invoice. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts, src/lib/transfer-match.ts, src/lib/ledger.ts and company RLS implement these safeguards; src/lib/books/books.test.ts cases 16–19, entity-access-sql.test.ts and docs/VERIFICATION_RESULTS.md verify debit/transfer/card/access checks. |
| V60-0728 | 1067 | 17. Match internal transfers without duplicate income or expenditure. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts, src/lib/transfer-match.ts, src/lib/ledger.ts and company RLS implement these safeguards; src/lib/books/books.test.ts cases 16–19, entity-access-sql.test.ts and docs/VERIFICATION_RESULTS.md verify debit/transfer/card/access checks. |
| V60-0729 | 1068 | 18. Match credit card settlements without duplicate spending. | VERIFIED COMPLETE |  | src/lib/books/taxcomp.ts, src/lib/transfer-match.ts, src/lib/ledger.ts and company RLS implement these safeguards; src/lib/books/books.test.ts cases 16–19, entity-access-sql.test.ts and docs/VERIFICATION_RESULTS.md verify debit/transfer/card/access checks. |
| V60-0730 | 1069 | 19. Verify cross-entity access controls. | PARTIAL | drizzle/migrations/0075_entity_level_access.sql, src/components/books/CompanyAccess.tsx, src/lib/books/entity-accounts.ts (companyDocuments) | src/lib/books/entity-access-sql.test.ts 6/6: no-grant, foreign-company, personal-file, write, stranger and revoke refusals; entity-accounts.test.ts companyDocuments 2/2; Signed-in /entities panel render, no page errors (6 Nov) |
| V60-0731 | 1070 | 20. Demonstrate source-to-report traceability for every material financial figure. | PARTIAL |  | src/lib/books/evidence.ts, tax-workpaper.ts and derived-evidence.ts trace figures; books.test.ts case 20 and derived-evidence.test.ts cover examples, not every material financial figure end to end. |
| V60-0732 | 1071 | 21. Demonstrate safe failure, retry and recovery. | PARTIAL | src/components/DocumentIntake.tsx, src/lib/store.tsx, src/lib/books/runs.ts, drizzle/migrations/0071_revision_checked_document_intake.sql, drizzle/migrations/0074_typed_document_intake_validation.sql, src/lib/books/typed-intake-sql.test.ts | 7 PostgreSQL intake tests PASS; isolated /statements lost response → reload → same durable request recovery PASS; 8 typed-record SQL checks PASS; enforced validation read back in Cloud; isolated Statement Desk durable retry and Settings backup recovery PASS after safeguard changes |
| V60-0733 | 1072 | 22. Confirm all eight established financial-integrity checks. | VERIFIED COMPLETE |  | src/lib/books/runs.ts and existing ledger integrity rules provide recovery/invariants; src/lib/books/books.test.ts cases 21–22, period-recovery-sql.test.ts and src/lib/integrity.test.ts verify failures/retries and checks. |
| V60-0734 | 1074 | 72. Required deliverables | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0735 | 1076 | Lovable must provide: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0736 | 1078 | * Existing System Audit. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps existing-system audit, Statement Desk and DocuRepo reports to .lovable/requirements/audit-2026-11-06.md, src/lib/books/docrepo.ts, docrepo-search.test.ts and pipeline tests; docs/IMPLEMENTATION_PROGRESS.md records implementation verification. |
| V60-0737 | 1079 | * Statement Desk Integration Report. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps existing-system audit, Statement Desk and DocuRepo reports to .lovable/requirements/audit-2026-11-06.md, src/lib/books/docrepo.ts, docrepo-search.test.ts and pipeline tests; docs/IMPLEMENTATION_PROGRESS.md records implementation verification. |
| V60-0738 | 1080 | * DocuRepo Implementation Report. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps existing-system audit, Statement Desk and DocuRepo reports to .lovable/requirements/audit-2026-11-06.md, src/lib/books/docrepo.ts, docrepo-search.test.ts and pipeline tests; docs/IMPLEMENTATION_PROGRESS.md records implementation verification. |
| V60-0739 | 1081 | * Document Extraction Accuracy Report. | PARTIAL |  | docs/DELIVERABLES.md marks extraction accuracy Partial; src/lib/books/asset-read.test.ts and fund-statement.test.ts cover fixtures, not real-document accuracy certification. |
| V60-0740 | 1082 | * Entity Onboarding Verification. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0741 | 1083 | * Previous-Year Financial Import Verification. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0742 | 1084 | * Opening Balance Reconciliation. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0743 | 1085 | * Asset Register Verification. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0744 | 1086 | * Depreciation Verification. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0745 | 1087 | * Property Management Verification. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0746 | 1088 | * Rental Reconciliation. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0747 | 1089 | * Demat Import Verification. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0748 | 1090 | * Regulatory Intelligence Test Report. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md maps onboarding, prior-year/openings, assets, depreciation, property/rent, demat and regulatory reports to src/lib/books/intake.ts, fy.ts, property.ts, regulatory.ts and books.test.ts/opening-sql.test.ts/rule-watch.test.ts; docs/VERIFICATION_RESULTS.md records executed evidence. |
| V60-0749 | 1091 | * Tax/GST Preparation Verification. | PARTIAL |  | docs/DELIVERABLES.md cites src/lib/books/tax-regression.test.ts and compliance.test.ts for tax/GST workings; src/lib/books/regulatory.ts has unpinned schemas, so official format preparation verification remains incomplete. |
| V60-0750 | 1092 | * Continuous Audit Report. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md and docs/VERIFICATION_RESULTS.md provide continuous audit, integrity and permissions reports tied to src/lib/books/audit.ts, src/lib/ledger.ts, company RLS migrations, audit-dashboard.test.ts, integrity.test.ts and entity-access-sql.test.ts. |
| V60-0751 | 1093 | * Financial Integrity Report. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md and docs/VERIFICATION_RESULTS.md provide continuous audit, integrity and permissions reports tied to src/lib/books/audit.ts, src/lib/ledger.ts, company RLS migrations, audit-dashboard.test.ts, integrity.test.ts and entity-access-sql.test.ts. |
| V60-0752 | 1094 | * Security and Permissions Report. | VERIFIED COMPLETE |  | docs/DELIVERABLES.md and docs/VERIFICATION_RESULTS.md provide continuous audit, integrity and permissions reports tied to src/lib/books/audit.ts, src/lib/ledger.ts, company RLS migrations, audit-dashboard.test.ts, integrity.test.ts and entity-access-sql.test.ts. |
| V60-0753 | 1095 | * Responsive Design Screenshots. | PARTIAL |  | docs/DELIVERABLES.md marks Responsive Design Screenshots Partial; layout checks are documented but complete screenshot evidence and physical iPhone/iPad verification are not provided. |
| V60-0754 | 1096 | * Exception Register. | VERIFIED COMPLETE |  | docs/OPEN_BLOCKERS.md and .lovable/requirements/execution.md maintain exception register; docs/DELIVERABLES.md explicitly identifies these as exception-register evidence. |
| V60-0755 | 1097 | * Deployment Readiness Report. | PARTIAL |  | docs/DELIVERABLES.md marks deployment-readiness report Partial; docs/VERIFICATION_RESULTS.md records tests/build/security but staged approval guard and outstanding verification prevent complete readiness. |
| V60-0756 | 1101 | FINAL INSTRUCTIONS TO LOVABLE | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V60-0757 | 1103 | Build Ledgerline as a continuously audit-ready financial operating system. | PARTIAL |  | src/lib/books/audit.ts, evidence.ts and periods.ts implement ongoing audit preparation with books.test.ts/period-figures-sql.test.ts; complete document-to-report verification and statutory formats remain incomplete. |
| V60-0758 | 1105 | Statement Desk must remain the single standard document-entry point. | PARTIAL |  | src/components/DocumentIntake.tsx integrates Statement Desk intake and books.test.ts verifies proposals; separate upload/extraction paths exist in src/lib/receipt-extract.functions.ts and document-extract.functions.ts, so exclusivity of a single entry point is not established. |
| V60-0759 | 1107 | DocuRepo must be the central repository for original documents, extracted information, references and audit evidence. | VERIFIED COMPLETE |  | src/lib/books/docrepo.ts centralises document references/links and evidence; src/lib/books/docrepo-search.test.ts, entity-upload-sql.test.ts and docs/IMPLEMENTATION_PROGRESS.md verify repository integration. |
| V60-0760 | 1109 | Maximise reliable automation across all financial, tax, investment, asset and property workflows. | PARTIAL |  | src/lib/books/intake.ts, recon.ts, taxcomp.ts and DocumentIntake.tsx automate evidenced preparation with books.test.ts and recon.test.ts; real-document accuracy and complete fallback/reuse workflows remain unverified. |
| V60-0761 | 1111 | Minimise routine manual data entry. | PARTIAL |  | src/lib/books/intake.ts, recon.ts, taxcomp.ts and DocumentIntake.tsx automate evidenced preparation with books.test.ts and recon.test.ts; real-document accuracy and complete fallback/reuse workflows remain unverified. |
| V60-0762 | 1113 | Automatically identify, extract, classify, prefill, match and prepare records wherever reliable evidence exists. | PARTIAL |  | src/lib/books/intake.ts, recon.ts, taxcomp.ts and DocumentIntake.tsx automate evidenced preparation with books.test.ts and recon.test.ts; real-document accuracy and complete fallback/reuse workflows remain unverified. |
| V60-0763 | 1115 | Preserve the complete existing Ledgerline database and every original source document. | PARTIAL |  | src/lib/books/docrepo.ts retention lists without deleting and books.test.ts verifies retention; backup.ts/backup.test.ts exist, but preservation of every pre-existing database record and original document is not independently demonstrated. |
| V60-0764 | 1117 | Do not create duplicate financial records or conflicting calculation engines. | PARTIAL |  | src/lib/books/commit.ts and reconciliation readers deduplicate with books.test.ts and investment-events-sql.test.ts; brokerCashOverlap only warns and complete global duplicate/conflicting-engine absence is not verified. |
| V60-0765 | 1119 | Do not invent missing financial information. | PARTIAL |  | src/lib/books/intake.ts flags missing values and books.test.ts verifies missing schedules; asset put-to-use date and GST tax-head fallbacks preclude a verified universal no-invention guarantee. |
| V60-0766 | 1121 | Do not silently reinterpret uncertain legal requirements. | VERIFIED COMPLETE |  | src/lib/books/regulatory.ts validateRule rejects open ambiguity before activateRule; src/lib/books/books.test.ts and journal-rule-guard-sql.test.ts verify activation checks/approval. |
| V60-0767 | 1123 | Do not modify shared historical records, closed periods or database schemas without approval. | PARTIAL |  | src/lib/books/periods.ts and closed-period migrations enforce freeze/reopen (freeze-sql.test.ts, period-authority-sql.test.ts); docs/VERIFICATION_RESULTS.md says broader sensitive-write approval guard is staged, and shared-schema approval enforcement is not demonstrated. |
| V60-0768 | 1125 | Do not file statutory returns or perform statutory certifications automatically. | VERIFIED COMPLETE |  | src/lib/books/itr-handoff.ts and regulatory.ts generate labelled workings only, with no statutory submission/certification executor; itr-handoff.test.ts and docs/VERIFICATION_RESULTS.md confirm statutory approval not claimed. |
| V60-0769 | 1127 | Do not publish or deploy to the live application without explicit approval. | MISSING |  | No enforceable explicit deployment/publish approval workflow found; docs/VERIFICATION_RESULTS.md records scheduled publication, not evidence of an approval gate. |
| V60-0770 | 1129 | Implement in an isolated environment, verify the complete document-to-ledger-to-report process, submit all evidence and wait for approval. | PARTIAL |  | docs/VERIFICATION_RESULTS.md documents disposable SQL tests and controlled browser checks; docs/DELIVERABLES.md remains partial for accuracy/screenshots/readiness and complete isolated document-to-ledger-to-report acceptance plus explicit final approval is not evidenced. |

## v6.1 — Preamble

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0001 | 1 | LEDGERLINE v6.1 — LIVE MARKET DATA & DYNAMIC NET WORTH | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0002 | 3 | Integration with Demat Controls and Ledgerline v6.0 | VERIFIED COMPLETE |  | non-functional source line; no implementation required |

## v6.1 — 1. Objective

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0003 | 5 | 1. Objective | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0004 | 7 | Implement automated market-price retrieval, portfolio valuation and dynamic net-worth calculations. | PARTIAL |  | src/components/books/useBooks.ts aggregates existing accounts, demat, assets and loans; src/lib/books/books.test.ts tests valuation arithmetic, but automated NAV/intraday integration and full aggregate reconciliation are not verified. |
| V61-0005 | 9 | The module must use existing Demat holdings, investment records, bank balances, assets and liabilities. | PARTIAL |  | src/components/books/useBooks.ts aggregates existing accounts, demat, assets and loans; src/lib/books/books.test.ts tests valuation arithmetic, but automated NAV/intraday integration and full aggregate reconciliation are not verified. |
| V61-0006 | 11 | Do not create duplicate investment holdings or financial transactions. | PARTIAL |  | src/components/books/useBooks.ts suppresses manual/demat ISIN overlap; src/lib/books/fund-statement.test.ts verifies same-ISIN updates; brokerage cash overlap only warns and end-to-end no-duplicate aggregation is untested. |

## v6.1 — 2. Market-data integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0007 | 13 | 2. Market-data integration | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0008 | 15 | Support authorised providers for: | PARTIAL |  | src/routes/api/public/jobs/closing-prices.ts fetches official NSE/BSE bhavcopies; src/lib/market/bhavcopy.test.ts covers parsing; provider licensing/redistribution authorization and all requested instrument coverage are not verified. |
| V61-0009 | 17 | * NSE-listed equities. | PARTIAL |  | src/routes/api/public/jobs/closing-prices.ts fetches official NSE/BSE bhavcopies; src/lib/market/bhavcopy.test.ts covers parsing; provider licensing/redistribution authorization and all requested instrument coverage are not verified. |
| V61-0010 | 18 | * BSE-listed equities. | PARTIAL |  | src/routes/api/public/jobs/closing-prices.ts fetches official NSE/BSE bhavcopies; src/lib/market/bhavcopy.test.ts covers parsing; provider licensing/redistribution authorization and all requested instrument coverage are not verified. |
| V61-0011 | 19 | * Listed ETFs. | PARTIAL |  | src/routes/api/public/jobs/closing-prices.ts fetches official NSE/BSE bhavcopies; src/lib/market/bhavcopy.test.ts covers parsing; provider licensing/redistribution authorization and all requested instrument coverage are not verified. |
| V61-0012 | 20 | * Listed bonds and other supported securities. | PARTIAL |  | src/routes/api/public/jobs/closing-prices.ts fetches official NSE/BSE bhavcopies; src/lib/market/bhavcopy.test.ts covers parsing; provider licensing/redistribution authorization and all requested instrument coverage are not verified. |
| V61-0013 | 21 | * Mutual fund NAVs. | PARTIAL |  | src/lib/mutual-funds.functions.ts fetches mfapi.in NAVs; src/lib/mutual-funds.test.ts validates dated scheme-specific quotes; authorization/reliability of the upstream source is not documented. |
| V61-0014 | 22 | * Relevant currencies. | MISSING |  | Examined src/routes/api/public/jobs/closing-prices.ts, src/lib/mutual-funds.functions.ts and src/lib/books/market.ts: no currency-rate provider or FX valuation integration found. |
| V61-0015 | 23 | * Other supported market instruments. | PARTIAL |  | src/routes/api/public/jobs/closing-prices.ts fetches official NSE/BSE bhavcopies; src/lib/market/bhavcopy.test.ts covers parsing; provider licensing/redistribution authorization and all requested instrument coverage are not verified. |
| V61-0016 | 25 | Provider integrations must comply with their access, licensing, caching and redistribution conditions. | PARTIAL |  | src/routes/api/public/jobs/closing-prices.ts downloads public exchange files and caches market_quotes; no verified licensing, cache duration or redistribution-condition enforcement found. |
| V61-0017 | 27 | Do not use unauthorised scraping or circumvent website restrictions. | PARTIAL |  | src/routes/api/public/jobs/closing-prices.ts uses public download URLs without challenge bypass; no documented provider permission or verification of website access conditions found. |

## v6.1 — 3. Security identification

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0018 | 29 | 3. Security identification | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0019 | 31 | Match investments using: | VERIFIED COMPLETE |  | src/lib/books/market.ts quoteKey prioritizes ISIN then exchange/symbol then fund code, never name; src/lib/books/books.test.ts verifies ISIN priority and BSE symbol fallback. |
| V61-0020 | 33 | * ISIN. | VERIFIED COMPLETE |  | src/lib/books/market.ts quoteKey prioritizes ISIN then exchange/symbol then fund code, never name; src/lib/books/books.test.ts verifies ISIN priority and BSE symbol fallback. |
| V61-0021 | 34 | * Exchange. | VERIFIED COMPLETE |  | src/lib/market/bhavcopy.ts pickClose and src/components/books/useBooks.ts select the requested exchange; src/lib/market/exchange-close.test.ts verifies NSE/BSE separation and no cross-exchange fallback. |
| V61-0022 | 35 | * Symbol. | VERIFIED COMPLETE |  | src/lib/books/market.ts quoteKey prioritizes ISIN then exchange/symbol then fund code, never name; src/lib/books/books.test.ts verifies ISIN priority and BSE symbol fallback. |
| V61-0023 | 36 | * Instrument type. | PARTIAL |  | src/lib/books/market.ts valueHolding implements NAV versus exchange-type guards, physical gold and broker cash rules; src/lib/books/trading-status.test.ts tests suspended/delisted securities and broker cash, but NAV/type mismatch and all requested instrument combinations lack direct test coverage. |
| V61-0024 | 37 | * Relevant fund identifiers. | VERIFIED COMPLETE |  | src/lib/mutual-funds.ts parseFundQuote checks schemeCode; src/lib/mutual-funds.test.ts rejects a different scheme; src/lib/books/market.ts quoteKey supports fund-code fallback. |
| V61-0025 | 39 | Do not rely solely on security names. | VERIFIED COMPLETE |  | src/lib/books/market.ts quoteKey prioritizes ISIN then exchange/symbol then fund code, never name; src/lib/books/books.test.ts verifies ISIN priority and BSE symbol fallback. |

## v6.1 — 4. Automatic valuation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0026 | 41 | 4. Automatic valuation | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0027 | 43 | Calculate: | PARTIAL |  | src/lib/books/market.ts valueHolding and dynamicNetWorth implement quantity-price/share and totals (src/lib/books/books.test.ts); src/components/books/useBooks.ts adds investment-account balances and demat, but verified-quantity gating and broker cash/account deduplication are not enforced end-to-end. |
| V61-0028 | 45 | Holding Value = Verified Quantity × Applicable Market Price | PARTIAL |  | src/lib/books/market.ts valueHolding and dynamicNetWorth implement quantity-price/share and totals (src/lib/books/books.test.ts); src/components/books/useBooks.ts adds investment-account balances and demat, but verified-quantity gating and broker cash/account deduplication are not enforced end-to-end. |
| V61-0029 | 47 | Portfolio Value = Sum of Recognised Holding Values + Applicable Investment-Account Cash | PARTIAL |  | src/lib/books/market.ts valueHolding and dynamicNetWorth implement quantity-price/share and totals (src/lib/books/books.test.ts); src/components/books/useBooks.ts adds investment-account balances and demat, but verified-quantity gating and broker cash/account deduplication are not enforced end-to-end. |
| V61-0030 | 49 | Use appropriate instrument-specific valuation rules. | PARTIAL |  | src/lib/books/market.ts valueHolding implements NAV versus exchange-type guards, physical gold and broker cash rules; src/lib/books/trading-status.test.ts tests suspended/delisted securities and broker cash, but NAV/type mismatch and all requested instrument combinations lack direct test coverage. |
| V61-0031 | 51 | Do not double-count investment cash or securities appearing in multiple account statements. | PARTIAL |  | src/lib/books/market.ts valueHolding and dynamicNetWorth implement quantity-price/share and totals (src/lib/books/books.test.ts); src/components/books/useBooks.ts adds investment-account balances and demat, but verified-quantity gating and broker cash/account deduplication are not enforced end-to-end. |

## v6.1 — 5. Market status

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0032 | 53 | 5. Market status | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0033 | 55 | For every instrument, display: | PARTIAL |  | src/components/books/MarketPanel.tsx displays manual holding exchange, quote price/date/provider/freshness/refreshedAt/staleness; src/lib/market/exchange-close.test.ts and src/lib/books/trading-status.test.ts cover underlying data, but demat rows show only quantity/basis/value, not all per-instrument fields, and UI coverage is incomplete. |
| V61-0034 | 57 | * Exchange. | PARTIAL |  | src/components/books/MarketPanel.tsx displays manual holding exchange, quote price/date/provider/freshness/refreshedAt/staleness; src/lib/market/exchange-close.test.ts and src/lib/books/trading-status.test.ts cover underlying data, but demat rows show only quantity/basis/value, not all per-instrument fields, and UI coverage is incomplete. |
| V61-0035 | 58 | * Trading status. | PARTIAL |  | src/components/books/MarketPanel.tsx displays manual holding exchange, quote price/date/provider/freshness/refreshedAt/staleness; src/lib/market/exchange-close.test.ts and src/lib/books/trading-status.test.ts cover underlying data, but demat rows show only quantity/basis/value, not all per-instrument fields, and UI coverage is incomplete. |
| V61-0036 | 59 | * Last available price. | PARTIAL |  | src/components/books/MarketPanel.tsx displays manual holding exchange, quote price/date/provider/freshness/refreshedAt/staleness; src/lib/market/exchange-close.test.ts and src/lib/books/trading-status.test.ts cover underlying data, but demat rows show only quantity/basis/value, not all per-instrument fields, and UI coverage is incomplete. |
| V61-0037 | 60 | * Price date and time. | PARTIAL |  | src/components/books/MarketPanel.tsx displays manual holding exchange, quote price/date/provider/freshness/refreshedAt/staleness; src/lib/market/exchange-close.test.ts and src/lib/books/trading-status.test.ts cover underlying data, but demat rows show only quantity/basis/value, not all per-instrument fields, and UI coverage is incomplete. |
| V61-0038 | 61 | * Data provider. | PARTIAL |  | src/components/books/MarketPanel.tsx displays manual holding exchange, quote price/date/provider/freshness/refreshedAt/staleness; src/lib/market/exchange-close.test.ts and src/lib/books/trading-status.test.ts cover underlying data, but demat rows show only quantity/basis/value, not all per-instrument fields, and UI coverage is incomplete. |
| V61-0039 | 62 | * Live/delayed/end-of-day status. | PARTIAL |  | src/components/books/MarketPanel.tsx displays manual holding exchange, quote price/date/provider/freshness/refreshedAt/staleness; src/lib/market/exchange-close.test.ts and src/lib/books/trading-status.test.ts cover underlying data, but demat rows show only quantity/basis/value, not all per-instrument fields, and UI coverage is incomplete. |
| V61-0040 | 63 | * Last successful refresh. | PARTIAL | src/lib/market/bhavcopy.ts, src/components/books/useBooks.ts | actual per-exchange fetched_at regression PASS |
| V61-0041 | 64 | * Staleness indicator. | PARTIAL |  | src/components/books/MarketPanel.tsx displays manual holding exchange, quote price/date/provider/freshness/refreshedAt/staleness; src/lib/market/exchange-close.test.ts and src/lib/books/trading-status.test.ts cover underlying data, but demat rows show only quantity/basis/value, not all per-instrument fields, and UI coverage is incomplete. |
| V61-0042 | 66 | Do not label delayed or previous-close data as live. | VERIFIED COMPLETE |  | src/components/books/useBooks.ts closeQuote sets eod and src/lib/books/market.ts preserves freshness labels; src/lib/books/books.test.ts asserts end-of-day quotes are not upgraded to live; no live source is configured. |

## v6.1 — 6. Automatic updates

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0043 | 68 | 6. Automatic updates | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0044 | 70 | During market hours, refresh eligible securities according to the authorised feed’s capabilities and permitted frequency. | BLOCKED |  | docs/OPEN_BLOCKERS.md: licensed intraday NSE/BSE provider and credentials deferred by owner; src/routes/api/public/jobs/closing-prices.ts supplies end-of-day closes only, not market-hours refresh. |
| V61-0045 | 72 | Outside market hours, retain the latest valid closing or available price with its timestamp. | VERIFIED COMPLETE |  | src/lib/books/market.ts recordFailure preserves quote and flags failedAt; upsertQuote rejects zero and older prices; src/lib/books/books.test.ts verifies preserved failed values, staleness and null missing values; closing-prices job does not delete prior closes on failure. |
| V61-0046 | 74 | If a market-data request fails, preserve the previous valid value and mark it stale. | VERIFIED COMPLETE |  | src/lib/books/market.ts recordFailure preserves quote and flags failedAt; upsertQuote rejects zero and older prices; src/lib/books/books.test.ts verifies preserved failed values, staleness and null missing values; closing-prices job does not delete prior closes on failure. |
| V61-0047 | 76 | Do not substitute zero for missing prices. | VERIFIED COMPLETE |  | src/lib/books/market.ts recordFailure preserves quote and flags failedAt; upsertQuote rejects zero and older prices; src/lib/books/books.test.ts verifies preserved failed values, staleness and null missing values; closing-prices job does not delete prior closes on failure. |

## v6.1 — 7. Mutual fund NAV

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0048 | 78 | 7. Mutual fund NAV | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0049 | 80 | Use an authorised, reliable NAV source. | PARTIAL |  | src/lib/mutual-funds.functions.ts fetches mfapi.in NAVs; src/lib/mutual-funds.test.ts validates dated scheme-specific quotes; authorization/reliability of the upstream source is not documented. |
| V61-0050 | 82 | Recognise that ordinary mutual fund NAVs are generally published for a valuation day rather than changing continuously like exchange-traded shares. | VERIFIED COMPLETE |  | src/lib/mutual-funds.ts retains published NAV date; src/lib/mutual-funds.test.ts verifies non-trading-day publication date; src/components/books/MarketPanel.tsx displays quote price date and Latest NAV label. |
| V61-0051 | 84 | Refresh NAVs when newly published. | PARTIAL |  | src/components/books/MarketPanel.tsx refreshNavs fetches latest NAV on button press; src/lib/mutual-funds.test.ts verifies published date, but no publication-triggered/scheduled NAV refresh or successful adapter integration test found. |
| V61-0052 | 86 | Show the NAV date. | VERIFIED COMPLETE |  | src/lib/mutual-funds.ts retains published NAV date; src/lib/mutual-funds.test.ts verifies non-trading-day publication date; src/components/books/MarketPanel.tsx displays quote price date and Latest NAV label. |

## v6.1 — 8. Gold

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0053 | 88 | 8. Gold | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0054 | 90 | Maintain separate valuations for: | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding separates physical gold weight/purity/configured rate from exchange instruments; src/components/books/MarketPanel.tsx exposes gold ETF/SGB/physical types; src/lib/books/books.test.ts verifies physical gold ignores ETF quotes and computes purity-adjusted value. |
| V61-0055 | 92 | * Gold ETFs. | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding separates physical gold weight/purity/configured rate from exchange instruments; src/components/books/MarketPanel.tsx exposes gold ETF/SGB/physical types; src/lib/books/books.test.ts verifies physical gold ignores ETF quotes and computes purity-adjusted value. |
| V61-0056 | 93 | * Sovereign Gold Bonds. | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding separates physical gold weight/purity/configured rate from exchange instruments; src/components/books/MarketPanel.tsx exposes gold ETF/SGB/physical types; src/lib/books/books.test.ts verifies physical gold ignores ETF quotes and computes purity-adjusted value. |
| V61-0057 | 94 | * Physical gold. | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding separates physical gold weight/purity/configured rate from exchange instruments; src/components/books/MarketPanel.tsx exposes gold ETF/SGB/physical types; src/lib/books/books.test.ts verifies physical gold ignores ETF quotes and computes purity-adjusted value. |
| V61-0058 | 96 | Gold ETFs may use appropriate exchange-traded prices. | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding separates physical gold weight/purity/configured rate from exchange instruments; src/components/books/MarketPanel.tsx exposes gold ETF/SGB/physical types; src/lib/books/books.test.ts verifies physical gold ignores ETF quotes and computes purity-adjusted value. |
| V61-0059 | 98 | Physical gold requires a configured valuation method, purity and weight. | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding separates physical gold weight/purity/configured rate from exchange instruments; src/components/books/MarketPanel.tsx exposes gold ETF/SGB/physical types; src/lib/books/books.test.ts verifies physical gold ignores ETF quotes and computes purity-adjusted value. |
| V61-0060 | 100 | Do not automatically treat an exchange-traded gold security’s price as the value of physical gold. | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding separates physical gold weight/purity/configured rate from exchange instruments; src/components/books/MarketPanel.tsx exposes gold ETF/SGB/physical types; src/lib/books/books.test.ts verifies physical gold ignores ETF quotes and computes purity-adjusted value. |

## v6.1 — 9. Dynamic net worth

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0061 | 102 | 9. Dynamic net worth | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0062 | 104 | Recalculate net worth using: | PARTIAL |  | src/components/books/useBooks.ts aggregates recorded bank balances, holdings, assets and standalone loans; src/lib/books/books.test.ts verifies share-aware arithmetic and src/lib/books/loan-balances.test.ts loan evidence; full ownership, latest reconciled bank balance and cash overlap integration remain unverified. |
| V61-0063 | 106 | * Latest reliable bank balances. | PARTIAL |  | src/components/books/useBooks.ts aggregates recorded bank balances, holdings, assets and standalone loans; src/lib/books/books.test.ts verifies share-aware arithmetic and src/lib/books/loan-balances.test.ts loan evidence; full ownership, latest reconciled bank balance and cash overlap integration remain unverified. |
| V61-0064 | 107 | * Current investment valuations. | PARTIAL |  | src/components/books/useBooks.ts aggregates recorded bank balances, holdings, assets and standalone loans; src/lib/books/books.test.ts verifies share-aware arithmetic and src/lib/books/loan-balances.test.ts loan evidence; full ownership, latest reconciled bank balance and cash overlap integration remain unverified. |
| V61-0065 | 108 | * Other recognised assets. | PARTIAL |  | src/components/books/useBooks.ts aggregates recorded bank balances, holdings, assets and standalone loans; src/lib/books/books.test.ts verifies share-aware arithmetic and src/lib/books/loan-balances.test.ts loan evidence; full ownership, latest reconciled bank balance and cash overlap integration remain unverified. |
| V61-0066 | 109 | * Outstanding liabilities. | PARTIAL |  | src/components/books/useBooks.ts aggregates recorded bank balances, holdings, assets and standalone loans; src/lib/books/books.test.ts verifies share-aware arithmetic and src/lib/books/loan-balances.test.ts loan evidence; full ownership, latest reconciled bank balance and cash overlap integration remain unverified. |
| V61-0067 | 110 | * Correct legal ownership. | PARTIAL |  | src/components/books/useBooks.ts aggregates recorded bank balances, holdings, assets and standalone loans; src/lib/books/books.test.ts verifies share-aware arithmetic and src/lib/books/loan-balances.test.ts loan evidence; full ownership, latest reconciled bank balance and cash overlap integration remain unverified. |
| V61-0068 | 112 | Net Worth = Recognised Assets − Recognised Liabilities | VERIFIED COMPLETE |  | src/lib/books/market.ts dynamicNetWorth subtracts liabilities, separates valuation bases and never labels overall net worth live; src/lib/books/books.test.ts verifies net/quality and src/lib/market/exchange-close.test.ts verifies component as-of dates; MarketPanel.tsx renders component bases/dates. |
| V61-0069 | 114 | Distinguish market-valued assets from bank-verified cash and manually valued assets. | VERIFIED COMPLETE |  | src/lib/books/market.ts dynamicNetWorth subtracts liabilities, separates valuation bases and never labels overall net worth live; src/lib/books/books.test.ts verifies net/quality and src/lib/market/exchange-close.test.ts verifies component as-of dates; MarketPanel.tsx renders component bases/dates. |

## v6.1 — 10. Net-worth freshness

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0070 | 116 | 10. Net-worth freshness | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0071 | 118 | Display a valuation timestamp and data-quality summary. | VERIFIED COMPLETE |  | src/lib/books/market.ts dynamicNetWorth subtracts liabilities, separates valuation bases and never labels overall net worth live; src/lib/books/books.test.ts verifies net/quality and src/lib/market/exchange-close.test.ts verifies component as-of dates; MarketPanel.tsx renders component bases/dates. |
| V61-0072 | 120 | For example: | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0073 | 122 | * Listed investments: Market price as of current trading session. | VERIFIED COMPLETE |  | src/lib/books/market.ts dynamicNetWorth subtracts liabilities, separates valuation bases and never labels overall net worth live; src/lib/books/books.test.ts verifies net/quality and src/lib/market/exchange-close.test.ts verifies component as-of dates; MarketPanel.tsx renders component bases/dates. |
| V61-0074 | 123 | * Mutual funds: Latest published NAV. | VERIFIED COMPLETE |  | src/lib/books/market.ts dynamicNetWorth subtracts liabilities, separates valuation bases and never labels overall net worth live; src/lib/books/books.test.ts verifies net/quality and src/lib/market/exchange-close.test.ts verifies component as-of dates; MarketPanel.tsx renders component bases/dates. |
| V61-0075 | 124 | * Bank accounts: Latest reconciled statement or authorised bank feed. | PARTIAL |  | src/components/books/useBooks.ts uses recorded account entries and latest transaction date for bank basis; no guarantee this is latest reconciled statement or authorized feed; src/lib/market/exchange-close.test.ts tests dates only. |
| V61-0076 | 125 | * Property: Latest dated valuation. | VERIFIED COMPLETE |  | src/lib/books/market.ts dynamicNetWorth subtracts liabilities, separates valuation bases and never labels overall net worth live; src/lib/books/books.test.ts verifies net/quality and src/lib/market/exchange-close.test.ts verifies component as-of dates; MarketPanel.tsx renders component bases/dates. |
| V61-0077 | 126 | * Loans: Latest verified outstanding balance. | PARTIAL | src/lib/books/loan-balances.ts, src/components/books/LoanBalanceReview.tsx, src/components/books/useBooks.ts | 6 Nov: printed outstanding prefill from lender statement fields (proposePrintedBalance), 3 tests7 loan-balance rules PASS; controlled signed-in Wealth source confirmation/save/reload PASS, mobile screenshot inspected; hosted writes blocked |
| V61-0078 | 128 | Do not label overall net worth as fully live when important components are not live. | VERIFIED COMPLETE |  | src/lib/books/market.ts dynamicNetWorth subtracts liabilities, separates valuation bases and never labels overall net worth live; src/lib/books/books.test.ts verifies net/quality and src/lib/market/exchange-close.test.ts verifies component as-of dates; MarketPanel.tsx renders component bases/dates. |

## v6.1 — 11. Home integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0079 | 130 | 11. Home integration | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0080 | 132 | Add a dynamic Net Worth summary to the Ledgerline Home page. | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0081 | 134 | Show: | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0082 | 136 | * Net worth. | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0083 | 137 | * Investment portfolio value. | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0084 | 138 | * Investment movement. | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0085 | 139 | * Liquid balances. | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0086 | 140 | * Liabilities. | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0087 | 141 | * Last update. | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0088 | 142 | * Data freshness. | PARTIAL |  | src/components/books/NetWorthCard.tsx rendered by src/routes/_authenticated/dashboard.tsx shows net worth, portfolio/movement/liquid/liabilities/record dates and quality; src/lib/books/books.test.ts and investment-flows.test.ts test underlying math, but Home-specific rendering and aggregate verification are absent. |
| V61-0089 | 144 | Provide a tap-through to the full Financial Position and Investments modules. | PARTIAL |  | src/components/books/NetWorthCard.tsx links to /wealth where src/routes/_authenticated/wealth.tsx renders MarketPanel; no distinct Investments tap-through or navigation test found. |

## v6.1 — 12. Historical valuations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0090 | 146 | 12. Historical valuations | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0091 | 148 | Maintain dated valuation snapshots for: | VERIFIED COMPLETE |  | src/lib/books/market.ts addSnapshot keeps dated daily snapshots; src/components/books/MarketPanel.tsx saves portfolio/netWorth through preferences only; src/lib/books/books.test.ts verifies daily replacement and no ledger API is used by snapshot path. |
| V61-0092 | 150 | * Portfolio history. | VERIFIED COMPLETE |  | src/lib/books/market.ts addSnapshot keeps dated daily snapshots; src/components/books/MarketPanel.tsx saves portfolio/netWorth through preferences only; src/lib/books/books.test.ts verifies daily replacement and no ledger API is used by snapshot path. |
| V61-0093 | 151 | * Net-worth history. | VERIFIED COMPLETE |  | src/lib/books/market.ts addSnapshot keeps dated daily snapshots; src/components/books/MarketPanel.tsx saves portfolio/netWorth through preferences only; src/lib/books/books.test.ts verifies daily replacement and no ledger API is used by snapshot path. |
| V61-0094 | 152 | * Investment performance. | PARTIAL | src/lib/books/investment-flows.ts, src/components/books/useBooks.ts, src/components/books/MarketPanel.tsx, src/lib/books/market.ts | 6 signed-flow tests PASS; 2 movement-alert tests PASS |
| V61-0095 | 153 | * Asset allocation changes. | PARTIAL | src/components/books/MarketPanel.tsx | Demat allocation included; full suite PASS |
| V61-0096 | 155 | Snapshots must not create new ledger transactions. | VERIFIED COMPLETE |  | src/lib/books/market.ts addSnapshot keeps dated daily snapshots; src/components/books/MarketPanel.tsx saves portfolio/netWorth through preferences only; src/lib/books/books.test.ts verifies daily replacement and no ledger API is used by snapshot path. |

## v6.1 — 13. Alerts

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0097 | 157 | 13. Alerts | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0098 | 159 | Support: | PARTIAL |  | src/lib/books/market.ts valuationAlerts and MarketPanel.tsx provide configurable alerts; investment-alerts.test.ts and flow-alerts.test.ts cover actions/movement, but missing-price, stale-NAV and quantity-mismatch alert configuration is not fully tested. |
| V61-0099 | 161 | * Significant portfolio changes. | VERIFIED COMPLETE |  | src/lib/books/market.ts valuationAlerts excludes contributions/withdrawals from portfolio moves; src/lib/books/flow-alerts.test.ts and v6-batch7.test.ts verify significant market movement alerts. |
| V61-0100 | 162 | * Missing market prices. | PARTIAL |  | src/lib/books/market.ts valuationAlerts implements missing-price, stale-NAV, quantity discrepancy, unusual valuation thresholds; MarketPanel.tsx exposes settings, but direct tests for these alert branches and complete configurability were not found (NAV staleness itself tested in books.test.ts). |
| V61-0101 | 163 | * Stale NAVs. | PARTIAL |  | src/lib/books/market.ts valuationAlerts implements missing-price, stale-NAV, quantity discrepancy, unusual valuation thresholds; MarketPanel.tsx exposes settings, but direct tests for these alert branches and complete configurability were not found (NAV staleness itself tested in books.test.ts). |
| V61-0102 | 164 | * Corporate actions requiring reconciliation. | VERIFIED COMPLETE |  | src/lib/books/investment-alerts.ts statementActionAlerts and MarketPanel.tsx surface retained corporate actions; src/lib/books/investment-alerts.test.ts verifies source retention, deduplication and configurable action alerts. |
| V61-0103 | 165 | * Holding quantity discrepancies. | PARTIAL |  | src/lib/books/market.ts valuationAlerts implements missing-price, stale-NAV, quantity discrepancy, unusual valuation thresholds; MarketPanel.tsx exposes settings, but direct tests for these alert branches and complete configurability were not found (NAV staleness itself tested in books.test.ts). |
| V61-0104 | 166 | * Unusual valuation differences. | PARTIAL |  | src/lib/books/market.ts valuationAlerts implements missing-price, stale-NAV, quantity discrepancy, unusual valuation thresholds; MarketPanel.tsx exposes settings, but direct tests for these alert branches and complete configurability were not found (NAV staleness itself tested in books.test.ts). |
| V61-0105 | 168 | Alerts must be configurable. | PARTIAL |  | src/lib/books/market.ts valuationAlerts implements missing-price, stale-NAV, quantity discrepancy, unusual valuation thresholds; MarketPanel.tsx exposes settings, but direct tests for these alert branches and complete configurability were not found (NAV staleness itself tested in books.test.ts). |

## v6.1 — 14. Testing

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0106 | 170 | 14. Testing | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0107 | 172 | Verify: | PARTIAL |  | src/lib/books/books.test.ts covers several numbered market cases, exchange-close.test.ts covers exchanges and dates, fund-statement.test.ts covers duplicate ISINs; automatic refresh, full aggregation, and device responsiveness verification remain incomplete. |
| V61-0108 | 174 | 1. Correct ISIN-to-security matching. | VERIFIED COMPLETE |  | src/lib/books/market.ts quoteKey prioritizes ISIN then exchange/symbol then fund code, never name; src/lib/books/books.test.ts verifies ISIN priority and BSE symbol fallback. |
| V61-0109 | 175 | 2. Different exchanges and instrument types. | PARTIAL |  | src/lib/books/market.ts valueHolding implements NAV versus exchange-type guards, physical gold and broker cash rules; src/lib/books/trading-status.test.ts tests suspended/delisted securities and broker cash, but NAV/type mismatch and all requested instrument combinations lack direct test coverage. |
| V61-0110 | 176 | 3. Real-time versus delayed price labels. | VERIFIED COMPLETE |  | src/components/books/useBooks.ts closeQuote sets eod and src/lib/books/market.ts preserves freshness labels; src/lib/books/books.test.ts asserts end-of-day quotes are not upgraded to live; no live source is configured. |
| V61-0111 | 177 | 4. Market-open and market-closed behaviour. | PARTIAL |  | src/lib/books/market.ts marketOpen and src/lib/books/books.test.ts plus v6-final.test.ts verify session hours/holidays; actual open/closed automatic refresh and adapter behavior is not integration-tested. |
| V61-0112 | 178 | 5. Latest NAV updates. | PARTIAL |  | src/components/books/MarketPanel.tsx refreshNavs fetches latest NAV on button press; src/lib/mutual-funds.test.ts verifies published date, but no publication-triggered/scheduled NAV refresh or successful adapter integration test found. |
| V61-0113 | 179 | 6. Market-data feed failures. | VERIFIED COMPLETE |  | src/lib/books/market.ts recordFailure preserves quote and flags failedAt; upsertQuote rejects zero and older prices; src/lib/books/books.test.ts verifies preserved failed values, staleness and null missing values; closing-prices job does not delete prior closes on failure. |
| V61-0114 | 180 | 7. Stale valuations. | VERIFIED COMPLETE |  | src/lib/books/market.ts isStale marks failed/aged quotes; src/lib/books/books.test.ts verifies failure and NAV staleness; src/lib/books/v6-final.test.ts verifies holiday-aware trading-day logic. |
| V61-0115 | 181 | 8. Duplicate holding prevention. | VERIFIED COMPLETE |  | src/lib/books/fund-statement.ts preserves same-ISIN holding identity; src/lib/books/fund-statement.test.ts verifies updates rather than duplicates; src/lib/investments/demat.test.ts covers statement merge deduplication. |
| V61-0116 | 182 | 9. Brokerage cash reconciliation. | PARTIAL |  | src/lib/books/recon.ts brokerCashOverlap and src/lib/books/recon-extra.test.ts flag broker cash/account overlap; src/lib/books/trading-status.test.ts verifies cash arithmetic, but reconciliation resolution and no-double-count valuation are unverified. |
| V61-0117 | 183 | 10. Portfolio valuation accuracy. | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding and dynamicNetWorth; src/lib/books/books.test.ts verifies 50% ownership valuation, missing prices and assets minus liabilities; full UI aggregation is outside these pure-function tests. |
| V61-0118 | 184 | 11. Ownership-aware net worth. | VERIFIED COMPLETE |  | src/lib/books/market.ts valueHolding and dynamicNetWorth; src/lib/books/books.test.ts verifies 50% ownership valuation, missing prices and assets minus liabilities; full UI aggregation is outside these pure-function tests. |
| V61-0119 | 185 | 12. No duplicate ledger postings. | PARTIAL |  | src/lib/books/market.ts snapshot/quote functions are pure and MarketPanel.tsx writes preferences only; books.test.ts tests snapshot replacement, but no dedicated integration assertion proves zero duplicate ledger postings across refresh/snapshot paths. |
| V61-0120 | 186 | 13. iPhone/iPad/desktop responsiveness. | BLOCKED |  | NetWorthCard.tsx and MarketPanel.tsx use responsive layouts, but docs/VERIFICATION_RESULTS.md explicitly says real-device behavior not verified; iPhone/iPad device acceptance unavailable, desktop market-specific coverage also incomplete. |
| V61-0121 | 188 | 15. Restrictions | VERIFIED COMPLETE |  | non-functional source line; no implementation required |
| V61-0122 | 190 | Preserve existing Demat, investment and financial records. | PARTIAL |  | src/components/books/MarketPanel.tsx refreshNavs patches quotes only and closing-prices.ts writes market_quotes, leaving holdings/costBasis untouched; books.test.ts verifies pure quote behavior, but end-to-end existing-record and purchase-cost preservation checks were not found. |
| V61-0123 | 192 | Do not invent current prices. | VERIFIED COMPLETE |  | src/lib/books/market.ts refuses zero/missing quotes and src/components/books/useBooks.ts uses saved closes/statement values with explicit basis; src/lib/books/books.test.ts verifies missing prices remain null and zero upserts throw. |
| V61-0124 | 194 | Do not claim market data is real-time without an authorised real-time source. | VERIFIED COMPLETE |  | src/components/books/useBooks.ts closeQuote sets eod and src/lib/books/market.ts preserves freshness labels; src/lib/books/books.test.ts asserts end-of-day quotes are not upgraded to live; no live source is configured. |
| V61-0125 | 196 | Do not alter historical purchase costs from market-price updates. | PARTIAL |  | src/components/books/MarketPanel.tsx refreshNavs patches quotes only and closing-prices.ts writes market_quotes, leaving holdings/costBasis untouched; books.test.ts verifies pure quote behavior, but end-to-end existing-record and purchase-cost preservation checks were not found. |
| V61-0126 | 198 | Do not execute trades. | PARTIAL |  | Examined src/components/books/MarketPanel.tsx, src/lib/mutual-funds.functions.ts and closing-prices.ts: valuation/read adapters only, no trade execution found; no dedicated restriction test or documented verification found. |
| V61-0127 | 200 | Do not modify shared financial data or database schemas without approval. | PARTIAL |  | docs/OPEN_BLOCKERS.md requires explicit approval for production; market code includes shared market_quotes writes and schema migrations exist, but per-change schema/shared-data approvals and production nondeployment audit evidence are not established by implementation/tests. |
| V61-0128 | 202 | Do not deploy to production without explicit approval. | PARTIAL |  | docs/OPEN_BLOCKERS.md requires explicit approval for production; market code includes shared market_quotes writes and schema migrations exist, but per-change schema/shared-data approvals and production nondeployment audit evidence are not established by implementation/tests. |
| V61-0129 | 204 | Implement in isolation and submit market-data source verification, valuation calculations, screenshots and test evidence for approval. | PARTIAL |  | Market rules isolated in src/lib/books/market.ts with books.test.ts, exchange-close.test.ts and bhavcopy.test.ts; docs/OPEN_BLOCKERS.md records licensed feed gap; no complete market-source authorization, market screenshots and submitted approval package found. |
