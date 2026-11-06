# Ledgerline v6.0 + v6.1 master requirements register

Generated from `.lovable/requirements/register.json`; edit the register, then run `python3 scripts/requirements/render_docs.py`.
Status rule: VERIFIED COMPLETE only with connected code, enforced security, executed tests and recorded evidence. NOT AUDITED means the individual clause has not yet been assessed; MISSING means an audit found no implementation. PARTIAL retains the remaining development or verification work.

| Status | Count |
|---|---|
| NOT AUDITED | 880 |
| PARTIAL | 19 |


## v6.0 — Preamble

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0001 | 1 | LEDGERLINE v6.0 | NOT AUDITED |  |  |
| V60-0002 | 3 | Autonomous Financial Operating System — Final Consolidated Development Specification | NOT AUDITED |  |  |
| V60-0003 | 5 | Date: 4 November 2026 | NOT AUDITED |  |  |
| V60-0004 | 6 | Platform: Lovable | NOT AUDITED |  |  |
| V60-0005 | 7 | Application: Ledgerline | NOT AUDITED |  |  |
| V60-0006 | 8 | Version: 6.0 | NOT AUDITED |  |  |
| V60-0007 | 9 | Development status: Proposed implementation | NOT AUDITED |  |  |
| V60-0008 | 10 | Environment: Development and isolated testing only | NOT AUDITED |  |  |
| V60-0009 | 11 | Production deployment: Not authorised | NOT AUDITED |  |  |

## v6.0 — 1. VISION

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0010 | 15 | 1. VISION | NOT AUDITED |  |  |
| V60-0011 | 17 | Develop Ledgerline into an intelligent, document-driven financial operating system that maintains continuously audit-ready accounts for individuals, families, p | NOT AUDITED |  |  |
| V60-0012 | 19 | The system must manage: | NOT AUDITED |  |  |

## v6.0 — 1. Financial accounting.

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0013 | 21 | 1. Financial accounting. | NOT AUDITED |  |  |
| V60-0014 | 22 | 2. Bank and credit card statements. | NOT AUDITED |  |  |
| V60-0015 | 23 | 3. Income and expenses. | NOT AUDITED |  |  |
| V60-0016 | 24 | 4. Financial reconciliation. | NOT AUDITED |  |  |
| V60-0017 | 25 | 5. Investments and Demat holdings. | NOT AUDITED |  |  |
| V60-0018 | 26 | 6. Assets and depreciation. | NOT AUDITED |  |  |
| V60-0019 | 27 | 7. Properties and rental management. | NOT AUDITED |  |  |
| V60-0020 | 28 | 8. Loans and liabilities. | NOT AUDITED |  |  |
| V60-0021 | 29 | 9. GST. | NOT AUDITED |  |  |
| V60-0022 | 30 | 10. Income tax. | NOT AUDITED |  |  |
| V60-0023 | 31 | 11. Statutory compliance preparation. | NOT AUDITED |  |  |
| V60-0024 | 32 | 12. Continuous auditing. | NOT AUDITED |  |  |
| V60-0025 | 33 | 13. Historical financial records. | NOT AUDITED |  |  |
| V60-0026 | 34 | 14. Financial reporting. | NOT AUDITED |  |  |
| V60-0027 | 35 | 15. Financial forecasting. | NOT AUDITED |  |  |
| V60-0028 | 36 | 16. Documents and evidence. | NOT AUDITED |  |  |
| V60-0029 | 38 | The design objective is zero routine manual data entry. | NOT AUDITED |  |  |
| V60-0030 | 40 | All supported information should be derived from uploaded documents, previously verified records, approved mappings and validated integrations. | NOT AUDITED |  |  |
| V60-0031 | 42 | Manual intervention should normally be limited to exceptions, approvals and information unavailable from reliable sources. | NOT AUDITED |  |  |
| V60-0032 | 44 | Do not fabricate missing information. | NOT AUDITED |  |  |
| V60-0033 | 48 | PART A — FUNDAMENTAL ARCHITECTURE | NOT AUDITED |  |  |

## v6.0 — 2. Statement Desk — single intake point

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0034 | 50 | 2. Statement Desk — single intake point | NOT AUDITED |  |  |
| V60-0035 | 52 | The existing Statement Desk must remain Ledgerline’s single standard entry point for financial documents and information. | NOT AUDITED |  |  |
| V60-0036 | 54 | Do not build competing upload centres within individual modules. | NOT AUDITED |  |  |
| V60-0037 | 56 | Instead, every module’s Upload or Add from Document action must open Statement Desk with the relevant context already selected. | NOT AUDITED |  |  |
| V60-0038 | 58 | Statement Desk must support: | NOT AUDITED |  |  |
| V60-0039 | 60 | * Bank statements. | NOT AUDITED |  |  |
| V60-0040 | 61 | * Credit card statements. | NOT AUDITED |  |  |
| V60-0041 | 62 | * Company incorporation documents. | NOT AUDITED |  |  |
| V60-0042 | 63 | * PAN and GST registration documents. | NOT AUDITED |  |  |
| V60-0043 | 64 | * Audited financial statements. | NOT AUDITED |  |  |
| V60-0044 | 65 | * Trial balances. | NOT AUDITED |  |  |
| V60-0045 | 66 | * Tax returns. | NOT AUDITED |  |  |
| V60-0046 | 67 | * GST returns. | NOT AUDITED |  |  |
| V60-0047 | 68 | * Invoices. | NOT AUDITED |  |  |
| V60-0048 | 69 | * Receipts. | NOT AUDITED |  |  |
| V60-0049 | 70 | * Contracts. | NOT AUDITED |  |  |
| V60-0050 | 71 | * Investment statements. | NOT AUDITED |  |  |
| V60-0051 | 72 | * ICICI Direct statements. | NOT AUDITED |  |  |
| V60-0052 | 73 | * Demat holdings. | NOT AUDITED |  |  |
| V60-0053 | 74 | * Mutual fund statements. | NOT AUDITED |  |  |
| V60-0054 | 75 | * Loan statements. | NOT AUDITED |  |  |
| V60-0055 | 76 | * Property deeds. | NOT AUDITED |  |  |
| V60-0056 | 77 | * Lease agreements. | NOT AUDITED |  |  |
| V60-0057 | 78 | * Insurance documents. | NOT AUDITED |  |  |
| V60-0058 | 79 | * Asset purchase invoices. | NOT AUDITED |  |  |
| V60-0059 | 80 | * Depreciation schedules. | NOT AUDITED |  |  |
| V60-0060 | 81 | * Utility bills. | NOT AUDITED |  |  |
| V60-0061 | 82 | * Maintenance documents. | NOT AUDITED |  |  |
| V60-0062 | 83 | * Other supported financial and legal records. | NOT AUDITED |  |  |
| V60-0063 | 85 | The user should not need to select the document category if the system can identify it reliably. | NOT AUDITED |  |  |

## v6.0 — 3. Statement Desk processing sequence

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0064 | 87 | 3. Statement Desk processing sequence | NOT AUDITED |  |  |
| V60-0065 | 89 | Every uploaded document must follow: | NOT AUDITED |  |  |
| V60-0066 | 91 | Upload → Identify → Extract → Validate → Match → Classify → Prepare Records → Confirm Where Required → Save → Reconcile → Audit | NOT AUDITED |  |  |
| V60-0067 | 93 | The process must be traceable. | NOT AUDITED |  |  |
| V60-0068 | 95 | A failed step must not silently create partially completed financial records. | NOT AUDITED |  |  |

## v6.0 — 4. No duplicated upload workflows

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0069 | 97 | 4. No duplicated upload workflows | NOT AUDITED |  |  |
| V60-0070 | 99 | The user must be able to initiate an upload from any module, but the file must be processed through Statement Desk. | NOT AUDITED |  |  |
| V60-0071 | 101 | Examples: | NOT AUDITED |  |  |
| V60-0072 | 103 | * Upload from Investments opens Statement Desk. | NOT AUDITED |  |  |
| V60-0073 | 104 | * Upload from Property Management opens Statement Desk. | NOT AUDITED |  |  |
| V60-0074 | 105 | * Upload from Asset Management opens Statement Desk. | NOT AUDITED |  |  |
| V60-0075 | 106 | * Upload from Tax & Audit opens Statement Desk. | NOT AUDITED |  |  |
| V60-0076 | 108 | All use the same intake, extraction, deduplication and evidence services. | NOT AUDITED |  |  |
| V60-0077 | 112 | PART B — DOCUREPO | NOT AUDITED |  |  |

## v6.0 — 5. Dedicated DocuRepo module

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0078 | 114 | 5. Dedicated DocuRepo module | NOT AUDITED |  |  |
| V60-0079 | 116 | Create: | NOT AUDITED |  |  |
| V60-0080 | 118 | More → DocuRepo | NOT AUDITED |  |  |
| V60-0081 | 120 | DocuRepo must be Ledgerline’s central document repository and evidence-management system. | NOT AUDITED |  |  |
| V60-0082 | 122 | Every document processed through Statement Desk must be stored in DocuRepo with appropriate access controls. | NOT AUDITED |  |  |
| V60-0083 | 124 | Do not create separate disconnected document stores for individual modules. | NOT AUDITED |  |  |

## v6.0 — 6. Automatic document classification

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0084 | 126 | 6. Automatic document classification | NOT AUDITED |  |  |
| V60-0085 | 128 | Identify: | NOT AUDITED |  |  |
| V60-0086 | 130 | * Document type. | NOT AUDITED |  |  |
| V60-0087 | 131 | * Legal entity. | NOT AUDITED |  |  |
| V60-0088 | 132 | * Relevant individual. | NOT AUDITED |  |  |
| V60-0089 | 133 | * Organisation. | NOT AUDITED |  |  |
| V60-0090 | 134 | * Financial year. | NOT AUDITED |  |  |
| V60-0091 | 135 | * Reporting period. | NOT AUDITED |  |  |
| V60-0092 | 136 | * Account. | NOT AUDITED |  |  |
| V60-0093 | 137 | * Related asset. | NOT AUDITED |  |  |
| V60-0094 | 138 | * Related property. | NOT AUDITED |  |  |
| V60-0095 | 139 | * Related investment. | NOT AUDITED |  |  |
| V60-0096 | 140 | * Related loan. | NOT AUDITED |  |  |
| V60-0097 | 141 | * Related transaction. | NOT AUDITED |  |  |
| V60-0098 | 142 | * Applicable tax registration. | NOT AUDITED |  |  |
| V60-0099 | 143 | * Expiry or renewal date. | NOT AUDITED |  |  |
| V60-0100 | 144 | * Relevant monetary values. | NOT AUDITED |  |  |
| V60-0101 | 146 | Automatically suggest a logical classification. | NOT AUDITED |  |  |
| V60-0102 | 148 | Only ask for confirmation when identity or classification is uncertain. | NOT AUDITED |  |  |

## v6.0 — 7. Intelligent document extraction

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0103 | 150 | 7. Intelligent document extraction | NOT AUDITED |  |  |
| V60-0104 | 152 | Extract available: | NOT AUDITED |  |  |
| V60-0105 | 154 | * Names. | NOT AUDITED |  |  |
| V60-0106 | 155 | * Addresses. | NOT AUDITED |  |  |
| V60-0107 | 156 | * Registration identifiers. | NOT AUDITED |  |  |
| V60-0108 | 157 | * Dates. | NOT AUDITED |  |  |
| V60-0109 | 158 | * Monetary amounts. | NOT AUDITED |  |  |
| V60-0110 | 159 | * Tax amounts. | NOT AUDITED |  |  |
| V60-0111 | 160 | * Account references. | NOT AUDITED |  |  |
| V60-0112 | 161 | * Asset details. | NOT AUDITED |  |  |
| V60-0113 | 162 | * Contract conditions. | NOT AUDITED |  |  |
| V60-0114 | 163 | * Payment terms. | NOT AUDITED |  |  |
| V60-0115 | 164 | * Interest rates. | NOT AUDITED |  |  |
| V60-0116 | 165 | * Depreciation information. | NOT AUDITED |  |  |
| V60-0117 | 166 | * Investment holdings. | NOT AUDITED |  |  |
| V60-0118 | 167 | * Financial statement values. | NOT AUDITED |  |  |
| V60-0119 | 168 | * Relevant obligations. | NOT AUDITED |  |  |
| V60-0120 | 170 | Every extracted field must retain: | NOT AUDITED |  |  |
| V60-0121 | 172 | * Source document. | NOT AUDITED |  |  |
| V60-0122 | 173 | * Page or section. | NOT AUDITED |  |  |
| V60-0123 | 174 | * Original extracted value. | NOT AUDITED |  |  |
| V60-0124 | 175 | * Normalised value. | NOT AUDITED |  |  |
| V60-0125 | 176 | * Confidence. | NOT AUDITED |  |  |
| V60-0126 | 177 | * Verification status. | NOT AUDITED |  |  |

## v6.0 — 8. Document relationships

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0127 | 179 | 8. Document relationships | NOT AUDITED |  |  |
| V60-0128 | 181 | A document may relate to multiple records. | NOT AUDITED |  |  |
| V60-0129 | 183 | For example, a vehicle purchase invoice may link to: | NOT AUDITED |  |  |
| V60-0130 | 185 | * Asset register. | NOT AUDITED |  |  |
| V60-0131 | 186 | * Supplier. | NOT AUDITED |  |  |
| V60-0132 | 187 | * Bank/card payment. | NOT AUDITED |  |  |
| V60-0133 | 188 | * Loan. | NOT AUDITED |  |  |
| V60-0134 | 189 | * Insurance. | NOT AUDITED |  |  |
| V60-0135 | 190 | * Depreciation schedule. | NOT AUDITED |  |  |
| V60-0136 | 191 | * Organisation. | NOT AUDITED |  |  |
| V60-0137 | 192 | * Tax treatment. | NOT AUDITED |  |  |
| V60-0138 | 194 | Create one document identity with multiple authorised links. | NOT AUDITED |  |  |
| V60-0139 | 196 | Do not duplicate the underlying file merely because several modules use it. | NOT AUDITED |  |  |

## v6.0 — 9. Automatic naming and organisation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0140 | 198 | 9. Automatic naming and organisation | NOT AUDITED |  |  |
| V60-0141 | 200 | Generate descriptive document names and searchable metadata. | NOT AUDITED |  |  |
| V60-0142 | 202 | Example: | NOT AUDITED |  |  |
| V60-0143 | 204 | Entity / Financial Year / Document Type / Relevant Identifier | NOT AUDITED |  |  |
| V60-0144 | 206 | Preserve the original filename and unmodified document. | NOT AUDITED |  |  |
| V60-0145 | 208 | Allow logical folder views without requiring a rigid physical folder hierarchy. | NOT AUDITED |  |  |

## v6.0 — 10. Search

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0146 | 210 | 10. Search | NOT AUDITED |  |  |
| V60-0147 | 212 | Provide intelligent document search by: | NOT AUDITED |  |  |
| V60-0148 | 214 | * Natural-language query. | NOT AUDITED |  |  |
| V60-0149 | 215 | * Company. | NOT AUDITED |  |  |
| V60-0150 | 216 | * Property. | NOT AUDITED |  |  |
| V60-0151 | 217 | * Asset. | NOT AUDITED |  |  |
| V60-0152 | 218 | * Account. | NOT AUDITED |  |  |
| V60-0153 | 219 | * Transaction. | NOT AUDITED |  |  |
| V60-0154 | 220 | * Date. | NOT AUDITED |  |  |
| V60-0155 | 221 | * Amount. | NOT AUDITED |  |  |
| V60-0156 | 222 | * Financial year. | NOT AUDITED |  |  |
| V60-0157 | 223 | * Document type. | NOT AUDITED |  |  |
| V60-0158 | 224 | * Registration number. | NOT AUDITED |  |  |
| V60-0159 | 225 | * Merchant. | NOT AUDITED |  |  |
| V60-0160 | 226 | * Tenant. | NOT AUDITED |  |  |
| V60-0161 | 227 | * Supplier. | NOT AUDITED |  |  |
| V60-0162 | 229 | Search results must respect entity-level permissions. | PARTIAL | drizzle/migrations/0075_entity_level_access.sql, src/components/books/CompanyAccess.tsx, src/lib/books/entity-accounts.ts (companyDocuments) | src/lib/books/entity-access-sql.test.ts 6/6: no-grant, foreign-company, personal-file, write, stranger and revoke refusals; entity-accounts.test.ts companyDocuments 2/2; Signed-in /entities panel render, no page errors (6 Nov) |

## v6.0 — 11. Document lifecycle

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0163 | 231 | 11. Document lifecycle | NOT AUDITED |  |  |
| V60-0164 | 233 | Support: | NOT AUDITED |  |  |
| V60-0165 | 235 | * Version history. | NOT AUDITED |  |  |
| V60-0166 | 236 | * Replacement documents. | NOT AUDITED |  |  |
| V60-0167 | 237 | * Expiry reminders. | NOT AUDITED |  |  |
| V60-0168 | 238 | * Renewal tracking. | NOT AUDITED |  |  |
| V60-0169 | 239 | * Duplicate identification. | NOT AUDITED |  |  |
| V60-0170 | 240 | * Original file preservation. | NOT AUDITED |  |  |
| V60-0171 | 241 | * Audit evidence. | NOT AUDITED |  |  |
| V60-0172 | 242 | * Retention policies. | NOT AUDITED |  |  |
| V60-0173 | 243 | * Controlled export. | NOT AUDITED |  |  |
| V60-0174 | 245 | A replacement document must not erase the original evidence. | NOT AUDITED |  |  |
| V60-0175 | 249 | PART C — AUTOMATED ENTITY ONBOARDING | NOT AUDITED |  |  |

## v6.0 — 12. Document-based company creation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0176 | 251 | 12. Document-based company creation | NOT AUDITED |  |  |
| V60-0177 | 253 | Creating a new company or organisation must begin with: | NOT AUDITED |  |  |
| V60-0178 | 255 | Add Entity → Upload Documents | NOT AUDITED |  |  |
| V60-0179 | 257 | Do not require users to complete a large blank registration form. | NOT AUDITED |  |  |
| V60-0180 | 259 | Use Statement Desk to process the documents. | NOT AUDITED |  |  |

## v6.0 — 13. Supported onboarding documents

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0181 | 261 | 13. Supported onboarding documents | NOT AUDITED |  |  |
| V60-0182 | 263 | Where applicable: | NOT AUDITED |  |  |
| V60-0183 | 265 | * Certificate of Incorporation. | NOT AUDITED |  |  |
| V60-0184 | 266 | * PAN document. | NOT AUDITED |  |  |
| V60-0185 | 267 | * GST registration certificate. | NOT AUDITED |  |  |
| V60-0186 | 268 | * Memorandum of Association. | NOT AUDITED |  |  |
| V60-0187 | 269 | * Articles of Association. | NOT AUDITED |  |  |
| V60-0188 | 270 | * LLP agreement. | NOT AUDITED |  |  |
| V60-0189 | 271 | * Partnership deed. | NOT AUDITED |  |  |
| V60-0190 | 272 | * Trust deed. | NOT AUDITED |  |  |
| V60-0191 | 273 | * Registration certificates. | NOT AUDITED |  |  |
| V60-0192 | 274 | * Relevant bank documents. | NOT AUDITED |  |  |
| V60-0193 | 275 | * Prior-year audited statements. | NOT AUDITED |  |  |

## v6.0 — 14. Automatic entity profile

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0194 | 277 | 14. Automatic entity profile | NOT AUDITED |  |  |
| V60-0195 | 279 | Extract and propose: | NOT AUDITED |  |  |
| V60-0196 | 281 | * Legal name. | NOT AUDITED |  |  |
| V60-0197 | 282 | * Entity type. | NOT AUDITED |  |  |
| V60-0198 | 283 | * Registration numbers. | NOT AUDITED |  |  |
| V60-0199 | 284 | * PAN. | NOT AUDITED |  |  |
| V60-0200 | 285 | * GSTINs. | NOT AUDITED |  |  |
| V60-0201 | 286 | * Incorporation date. | NOT AUDITED |  |  |
| V60-0202 | 287 | * Registered address. | NOT AUDITED |  |  |
| V60-0203 | 288 | * Directors/partners/trustees where available. | NOT AUDITED |  |  |
| V60-0204 | 289 | * Shareholding information where available. | NOT AUDITED |  |  |
| V60-0205 | 290 | * Financial year. | NOT AUDITED |  |  |
| V60-0206 | 291 | * Tax registrations. | NOT AUDITED |  |  |
| V60-0207 | 292 | * Related entities. | NOT AUDITED |  |  |
| V60-0208 | 293 | * Registered business activities. | NOT AUDITED |  |  |
| V60-0209 | 294 | * Authorised persons where supported. | NOT AUDITED |  |  |
| V60-0210 | 296 | The user should review the extracted profile rather than type every field. | NOT AUDITED |  |  |

## v6.0 — 15. Intelligent schema mapping

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0211 | 298 | 15. Intelligent schema mapping | NOT AUDITED |  |  |
| V60-0212 | 300 | If an uploaded document contains a relevant field not currently represented in Ledgerline: | NOT AUDITED |  |  |

## v6.0 — 1. Identify the field.

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0213 | 302 | 1. Identify the field. | NOT AUDITED |  |  |
| V60-0214 | 303 | 2. Determine whether an equivalent canonical field already exists. | NOT AUDITED |  |  |
| V60-0215 | 304 | 3. Map it where possible. | NOT AUDITED |  |  |
| V60-0216 | 305 | 4. Propose a controlled schema extension when genuinely necessary. | NOT AUDITED |  |  |
| V60-0217 | 306 | 5. Test data migration and compatibility. | NOT AUDITED |  |  |
| V60-0218 | 307 | 6. Require approval before shared-schema changes. | NOT AUDITED |  |  |
| V60-0219 | 309 | Do not automatically generate uncontrolled database columns from arbitrary text. | NOT AUDITED |  |  |

## v6.0 — 16. Entity recognition

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0220 | 311 | 16. Entity recognition | NOT AUDITED |  |  |
| V60-0221 | 313 | When later documents are uploaded, automatically match them to an existing entity using verified identifiers. | NOT AUDITED |  |  |
| V60-0222 | 315 | Avoid creating duplicate companies because of spelling variations or abbreviations. | NOT AUDITED |  |  |
| V60-0223 | 319 | PART D — PREVIOUS-YEAR AUDITED RECORDS | NOT AUDITED |  |  |

## v6.0 — 17. Financial Year Onboarding

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0224 | 321 | 17. Financial Year Onboarding | NOT AUDITED |  |  |
| V60-0225 | 323 | Create: | NOT AUDITED |  |  |
| V60-0226 | 325 | Tax & Audit → Financial Year Onboarding | NOT AUDITED |  |  |
| V60-0227 | 327 | Allow historical records to be imported for multiple years. | NOT AUDITED |  |  |

## v6.0 — 18. Automatic audited statement extraction

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0228 | 329 | 18. Automatic audited statement extraction | NOT AUDITED |  |  |
| V60-0229 | 331 | Process: | NOT AUDITED |  |  |
| V60-0230 | 333 | * Balance sheets. | NOT AUDITED |  |  |
| V60-0231 | 334 | * Profit and loss statements. | NOT AUDITED |  |  |
| V60-0232 | 335 | * Trial balances. | NOT AUDITED |  |  |
| V60-0233 | 336 | * Cash flow statements. | NOT AUDITED |  |  |
| V60-0234 | 337 | * Notes to accounts. | NOT AUDITED |  |  |
| V60-0235 | 338 | * Auditor reports. | NOT AUDITED |  |  |
| V60-0236 | 339 | * Fixed asset registers. | NOT AUDITED |  |  |
| V60-0237 | 340 | * Depreciation schedules. | NOT AUDITED |  |  |
| V60-0238 | 341 | * Loan schedules. | NOT AUDITED |  |  |
| V60-0239 | 342 | * Receivables. | NOT AUDITED |  |  |
| V60-0240 | 343 | * Payables. | NOT AUDITED |  |  |
| V60-0241 | 344 | * Investment schedules. | NOT AUDITED |  |  |
| V60-0242 | 345 | * Tax computations. | NOT AUDITED |  |  |
| V60-0243 | 346 | * GST reconciliation statements. | NOT AUDITED |  |  |

## v6.0 — 19. Proposed opening balances

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0244 | 348 | 19. Proposed opening balances | NOT AUDITED |  |  |
| V60-0245 | 350 | Automatically prepare: | NOT AUDITED |  |  |
| V60-0246 | 352 | * Bank opening balances. | NOT AUDITED |  |  |
| V60-0247 | 353 | * Cash balances. | NOT AUDITED |  |  |
| V60-0248 | 354 | * Investments. | NOT AUDITED |  |  |
| V60-0249 | 355 | * Fixed assets. | NOT AUDITED |  |  |
| V60-0250 | 356 | * Accumulated depreciation. | NOT AUDITED |  |  |
| V60-0251 | 357 | * Capital and reserves. | NOT AUDITED |  |  |
| V60-0252 | 358 | * Loans. | NOT AUDITED |  |  |
| V60-0253 | 359 | * Receivables. | NOT AUDITED |  |  |
| V60-0254 | 360 | * Payables. | NOT AUDITED |  |  |
| V60-0255 | 361 | * Tax balances. | NOT AUDITED |  |  |
| V60-0256 | 362 | * Other recognised balances. | NOT AUDITED |  |  |
| V60-0257 | 364 | Compare the proposed opening trial balance against audited closing values. | NOT AUDITED |  |  |
| V60-0258 | 366 | Do not force reconciliation through unexplained adjustments. | NOT AUDITED |  |  |

## v6.0 — 20. Previous-year history

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0259 | 368 | 20. Previous-year history | NOT AUDITED |  |  |
| V60-0260 | 370 | Maintain: | NOT AUDITED |  |  |
| V60-0261 | 372 | * Financial statements. | NOT AUDITED |  |  |
| V60-0262 | 373 | * Audit qualifications. | NOT AUDITED |  |  |
| V60-0263 | 374 | * Opening/closing balances. | NOT AUDITED |  |  |
| V60-0264 | 375 | * Filed returns. | NOT AUDITED |  |  |
| V60-0265 | 376 | * Tax losses and applicable carry-forwards. | NOT AUDITED |  |  |
| V60-0266 | 377 | * Depreciation history. | NOT AUDITED |  |  |
| V60-0267 | 378 | * Investment history. | NOT AUDITED |  |  |
| V60-0268 | 379 | * Property records. | NOT AUDITED |  |  |
| V60-0269 | 380 | * Loan balances. | NOT AUDITED |  |  |
| V60-0270 | 382 | Historical source data must remain accessible even after future corrections. | NOT AUDITED |  |  |
| V60-0271 | 386 | PART E — AUTOMATED FINANCIAL ACCOUNTING | NOT AUDITED |  |  |

## v6.0 — 21. Shared financial ledger

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0272 | 388 | 21. Shared financial ledger | NOT AUDITED |  |  |
| V60-0273 | 390 | Continue using the existing Ledgerline financial ledger and Universal Expense Entry. | NOT AUDITED |  |  |
| V60-0274 | 392 | Do not create a second ledger for tax, assets, property or investments. | NOT AUDITED |  |  |

## v6.0 — 22. Automated transaction recognition

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0275 | 394 | 22. Automated transaction recognition | NOT AUDITED |  |  |
| V60-0276 | 396 | Use uploaded statements and verified records to identify: | NOT AUDITED |  |  |
| V60-0277 | 398 | * Income. | NOT AUDITED |  |  |
| V60-0278 | 399 | * Expenses. | NOT AUDITED |  |  |
| V60-0279 | 400 | * Transfers. | NOT AUDITED |  |  |
| V60-0280 | 401 | * Credit card settlements. | NOT AUDITED |  |  |
| V60-0281 | 402 | * Loans. | NOT AUDITED |  |  |
| V60-0282 | 403 | * Investment transactions. | NOT AUDITED |  |  |
| V60-0283 | 404 | * Asset acquisitions. | NOT AUDITED |  |  |
| V60-0284 | 405 | * Rental receipts. | NOT AUDITED |  |  |
| V60-0285 | 406 | * Security deposits. | NOT AUDITED |  |  |
| V60-0286 | 407 | * Tax payments. | NOT AUDITED |  |  |
| V60-0287 | 408 | * Reimbursements. | NOT AUDITED |  |  |
| V60-0288 | 410 | Do not assume every bank debit is an expense or every credit is income. | NOT AUDITED |  |  |

## v6.0 — 23. Automated matching

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0289 | 412 | 23. Automated matching | NOT AUDITED |  |  |
| V60-0290 | 414 | Match transactions using relevant evidence such as: | NOT AUDITED |  |  |
| V60-0291 | 416 | * Account identity. | NOT AUDITED |  |  |
| V60-0292 | 417 | * Date. | NOT AUDITED |  |  |
| V60-0293 | 418 | * Amount. | NOT AUDITED |  |  |
| V60-0294 | 419 | * Direction. | NOT AUDITED |  |  |
| V60-0295 | 420 | * Reference. | NOT AUDITED |  |  |
| V60-0296 | 421 | * Merchant. | NOT AUDITED |  |  |
| V60-0297 | 422 | * Counterparty. | NOT AUDITED |  |  |
| V60-0298 | 423 | * Currency. | NOT AUDITED |  |  |
| V60-0299 | 424 | * Related document. | NOT AUDITED |  |  |
| V60-0300 | 425 | * Existing approved mappings. | NOT AUDITED |  |  |
| V60-0301 | 427 | Do not rely solely on matching amounts. | NOT AUDITED |  |  |

## v6.0 — 24. Financial reconciliation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0302 | 429 | 24. Financial reconciliation | NOT AUDITED |  |  |
| V60-0303 | 431 | Automatically prepare: | NOT AUDITED |  |  |
| V60-0304 | 433 | * Bank reconciliation. | NOT AUDITED |  |  |
| V60-0305 | 434 | * Card reconciliation. | NOT AUDITED |  |  |
| V60-0306 | 435 | * Loan reconciliation. | NOT AUDITED |  |  |
| V60-0307 | 436 | * Supplier reconciliation. | NOT AUDITED |  |  |
| V60-0308 | 437 | * Customer reconciliation. | NOT AUDITED |  |  |
| V60-0309 | 438 | * Investment reconciliation. | NOT AUDITED |  |  |
| V60-0310 | 439 | * Intercompany reconciliation. | NOT AUDITED |  |  |
| V60-0311 | 440 | * GST reconciliation. | NOT AUDITED |  |  |
| V60-0312 | 442 | Unresolved differences must enter the Financial Inbox. | NOT AUDITED |  |  |

## v6.0 — 25. Missing invoices

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0313 | 444 | 25. Missing invoices | NOT AUDITED |  |  |
| V60-0314 | 446 | A genuine bank transaction must still be included in bank-balance reconciliation when no invoice exists. | NOT AUDITED |  |  |
| V60-0315 | 448 | Document status and accounting classification must remain separate. | NOT AUDITED |  |  |
| V60-0316 | 450 | Missing invoices may still create tax, approval or audit exceptions. | NOT AUDITED |  |  |
| V60-0317 | 454 | PART F — EXTENSIVE ASSET MANAGEMENT | NOT AUDITED |  |  |

## v6.0 — 26. Asset Management

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0318 | 456 | 26. Asset Management | NOT AUDITED |  |  |
| V60-0319 | 458 | Create a dedicated Asset Management module integrated with the shared ledger. | NOT AUDITED |  |  |

## v6.0 — 27. Automated asset registration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0320 | 460 | 27. Automated asset registration | NOT AUDITED |  |  |
| V60-0321 | 462 | When an asset-related document is uploaded: | NOT AUDITED |  |  |
| V60-0322 | 464 | * Identify the asset. | NOT AUDITED |  |  |
| V60-0323 | 465 | * Identify legal owner. | NOT AUDITED |  |  |
| V60-0324 | 466 | * Extract purchase cost. | NOT AUDITED |  |  |
| V60-0325 | 467 | * Determine relevant dates. | NOT AUDITED |  |  |
| V60-0326 | 468 | * Identify supplier. | NOT AUDITED |  |  |
| V60-0327 | 469 | * Identify possible linked payment. | NOT AUDITED |  |  |
| V60-0328 | 470 | * Identify warranty and insurance. | NOT AUDITED |  |  |
| V60-0329 | 471 | * Suggest asset category. | NOT AUDITED |  |  |
| V60-0330 | 472 | * Prepare the asset master record. | NOT AUDITED |  |  |
| V60-0331 | 473 | * Prepare appropriate accounting links. | NOT AUDITED |  |  |
| V60-0332 | 475 | Do not require retyping extracted information. | NOT AUDITED |  |  |
| V60-0333 | 477 | Capitalisation must follow the entity’s approved policy and applicable rules. | NOT AUDITED |  |  |

## v6.0 — 28. Asset lifecycle

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0334 | 479 | 28. Asset lifecycle | NOT AUDITED |  |  |
| V60-0335 | 481 | Support: | NOT AUDITED |  |  |
| V60-0336 | 483 | * Acquisition. | NOT AUDITED |  |  |
| V60-0337 | 484 | * Receipt. | NOT AUDITED |  |  |
| V60-0338 | 485 | * Capitalisation. | NOT AUDITED |  |  |
| V60-0339 | 486 | * Location assignment. | NOT AUDITED |  |  |
| V60-0340 | 487 | * Custodian assignment. | NOT AUDITED |  |  |
| V60-0341 | 488 | * Maintenance. | NOT AUDITED |  |  |
| V60-0342 | 489 | * Transfers. | NOT AUDITED |  |  |
| V60-0343 | 490 | * Verification. | NOT AUDITED |  |  |
| V60-0344 | 491 | * Impairment/revaluation, where applicable. | NOT AUDITED |  |  |
| V60-0345 | 492 | * Disposal. | NOT AUDITED |  |  |

## v6.0 — 29. Asset documentation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0346 | 494 | 29. Asset documentation | NOT AUDITED |  |  |
| V60-0347 | 496 | Link: | NOT AUDITED |  |  |
| V60-0348 | 498 | * Purchase invoices. | NOT AUDITED |  |  |
| V60-0349 | 499 | * Warranty documents. | NOT AUDITED |  |  |
| V60-0350 | 500 | * Insurance. | NOT AUDITED |  |  |
| V60-0351 | 501 | * Maintenance records. | NOT AUDITED |  |  |
| V60-0352 | 502 | * Photographs. | NOT AUDITED |  |  |
| V60-0353 | 503 | * Disposal documents. | NOT AUDITED |  |  |
| V60-0354 | 504 | * Valuation reports. | NOT AUDITED |  |  |
| V60-0355 | 506 | All documents remain in DocuRepo. | NOT AUDITED |  |  |

## v6.0 — 30. Asset verification

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0356 | 508 | 30. Asset verification | NOT AUDITED |  |  |
| V60-0357 | 510 | Support: | NOT AUDITED |  |  |
| V60-0358 | 512 | * Unique asset ID. | NOT AUDITED |  |  |
| V60-0359 | 513 | * QR/barcode. | NOT AUDITED |  |  |
| V60-0360 | 514 | * Location. | NOT AUDITED |  |  |
| V60-0361 | 515 | * Department. | NOT AUDITED |  |  |
| V60-0362 | 516 | * Custodian. | NOT AUDITED |  |  |
| V60-0363 | 517 | * Physical verification. | NOT AUDITED |  |  |
| V60-0364 | 518 | * Missing/damaged asset reporting. | NOT AUDITED |  |  |
| V60-0365 | 522 | PART G — AUTOMATIC DEPRECIATION | NOT AUDITED |  |  |

## v6.0 — 31. Separate depreciation treatments

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0366 | 524 | 31. Separate depreciation treatments | NOT AUDITED |  |  |
| V60-0367 | 526 | Maintain separate: | NOT AUDITED |  |  |
| V60-0368 | 528 | Book depreciation | NOT AUDITED |  |  |
| V60-0369 | 530 | For applicable financial reporting standards and accounting policies. | NOT AUDITED |  |  |
| V60-0370 | 532 | Tax depreciation | NOT AUDITED |  |  |
| V60-0371 | 534 | For applicable income-tax provisions and asset/block classifications. | NOT AUDITED |  |  |
| V60-0372 | 536 | Do not assume the two values are identical. | NOT AUDITED |  |  |

## v6.0 — 32. Automatic calculation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0373 | 538 | 32. Automatic calculation | NOT AUDITED |  |  |
| V60-0374 | 540 | Use verified: | NOT AUDITED |  |  |
| V60-0375 | 542 | * Acquisition cost. | NOT AUDITED |  |  |
| V60-0376 | 543 | * Capitalisation date. | NOT AUDITED |  |  |
| V60-0377 | 544 | * Put-to-use date. | NOT AUDITED |  |  |
| V60-0378 | 545 | * Asset category. | NOT AUDITED |  |  |
| V60-0379 | 546 | * Depreciation method. | NOT AUDITED |  |  |
| V60-0380 | 547 | * Useful life. | NOT AUDITED |  |  |
| V60-0381 | 548 | * Residual value. | NOT AUDITED |  |  |
| V60-0382 | 549 | * Applicable tax rates. | NOT AUDITED |  |  |
| V60-0383 | 550 | * Additions. | NOT AUDITED |  |  |
| V60-0384 | 551 | * Disposals. | NOT AUDITED |  |  |
| V60-0385 | 552 | * Relevant prior-year written-down values. | NOT AUDITED |  |  |

## v6.0 — 33. Automated depreciation schedules

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0386 | 554 | 33. Automated depreciation schedules | NOT AUDITED |  |  |
| V60-0387 | 556 | Generate: | NOT AUDITED |  |  |
| V60-0388 | 558 | * Monthly book depreciation. | NOT AUDITED |  |  |
| V60-0389 | 559 | * Annual book depreciation. | NOT AUDITED |  |  |
| V60-0390 | 560 | * Accumulated depreciation. | NOT AUDITED |  |  |
| V60-0391 | 561 | * Net book value. | NOT AUDITED |  |  |
| V60-0392 | 562 | * Tax depreciation. | NOT AUDITED |  |  |
| V60-0393 | 563 | * Tax written-down value. | NOT AUDITED |  |  |
| V60-0394 | 564 | * Block-wise tax schedules. | NOT AUDITED |  |  |
| V60-0395 | 565 | * Additions/disposals. | NOT AUDITED |  |  |
| V60-0396 | 566 | * Book-versus-tax reconciliation. | NOT AUDITED |  |  |

## v6.0 — 34. Posting

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0397 | 568 | 34. Posting | NOT AUDITED |  |  |
| V60-0398 | 570 | Run depreciation calculation automatically. | NOT AUDITED |  |  |
| V60-0399 | 572 | Prepare accounting journals and identify exceptions. | NOT AUDITED |  |  |
| V60-0400 | 574 | Post to an open period only under the configured approval policy. | NOT AUDITED |  |  |
| V60-0401 | 576 | Never silently modify a closed accounting period. | NOT AUDITED |  |  |
| V60-0402 | 580 | PART H — PROPERTY MANAGEMENT | NOT AUDITED |  |  |

## v6.0 — 35. Dedicated Property Management

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0403 | 582 | 35. Dedicated Property Management | NOT AUDITED |  |  |
| V60-0404 | 584 | Create a separate module linked to Asset Management and financial accounting. | NOT AUDITED |  |  |

## v6.0 — 36. Property onboarding

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0405 | 586 | 36. Property onboarding | NOT AUDITED |  |  |
| V60-0406 | 588 | Begin with: | NOT AUDITED |  |  |
| V60-0407 | 590 | Add Property → Upload Document | NOT AUDITED |  |  |
| V60-0408 | 592 | Supported documents may include: | NOT AUDITED |  |  |
| V60-0409 | 594 | * Sale deed. | NOT AUDITED |  |  |
| V60-0410 | 595 | * Registration document. | NOT AUDITED |  |  |
| V60-0411 | 596 | * Lease agreement. | NOT AUDITED |  |  |
| V60-0412 | 597 | * Property tax document. | NOT AUDITED |  |  |
| V60-0413 | 598 | * Loan document. | NOT AUDITED |  |  |
| V60-0414 | 599 | * Insurance. | NOT AUDITED |  |  |
| V60-0415 | 600 | * Valuation report. | NOT AUDITED |  |  |
| V60-0416 | 601 | * Utility bill. | NOT AUDITED |  |  |
| V60-0417 | 603 | Automatically extract the available property information. | NOT AUDITED |  |  |

## v6.0 — 37. Property directory

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0418 | 605 | 37. Property directory | NOT AUDITED |  |  |
| V60-0419 | 607 | Support: | NOT AUDITED |  |  |
| V60-0420 | 609 | Owner → Property → Building → Floor → Unit | NOT AUDITED |  |  |
| V60-0421 | 611 | Maintain: | NOT AUDITED |  |  |
| V60-0422 | 613 | * Property details. | NOT AUDITED |  |  |
| V60-0423 | 614 | * Legal ownership. | NOT AUDITED |  |  |
| V60-0424 | 615 | * Location. | NOT AUDITED |  |  |
| V60-0425 | 616 | * Acquisition details. | NOT AUDITED |  |  |
| V60-0426 | 617 | * Valuation. | NOT AUDITED |  |  |
| V60-0427 | 618 | * Associated assets. | NOT AUDITED |  |  |
| V60-0428 | 619 | * Loans. | NOT AUDITED |  |  |
| V60-0429 | 620 | * Insurance. | NOT AUDITED |  |  |
| V60-0430 | 621 | * Tax records. | NOT AUDITED |  |  |
| V60-0431 | 622 | * Documents. | NOT AUDITED |  |  |

## v6.0 — 38. Tenant onboarding

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0432 | 624 | 38. Tenant onboarding | NOT AUDITED |  |  |
| V60-0433 | 626 | Read lease agreements and automatically propose: | NOT AUDITED |  |  |
| V60-0434 | 628 | * Tenant details. | NOT AUDITED |  |  |
| V60-0435 | 629 | * Property/unit. | NOT AUDITED |  |  |
| V60-0436 | 630 | * Lease period. | NOT AUDITED |  |  |
| V60-0437 | 631 | * Monthly rent. | NOT AUDITED |  |  |
| V60-0438 | 632 | * Escalation conditions. | NOT AUDITED |  |  |
| V60-0439 | 633 | * Security deposit. | NOT AUDITED |  |  |
| V60-0440 | 634 | * Due dates. | NOT AUDITED |  |  |
| V60-0441 | 635 | * Notice periods. | NOT AUDITED |  |  |
| V60-0442 | 636 | * Payment terms. | NOT AUDITED |  |  |
| V60-0443 | 637 | * Relevant tax information. | NOT AUDITED |  |  |
| V60-0444 | 639 | Do not require manually duplicating lease data. | NOT AUDITED |  |  |

## v6.0 — 39. Automated rent reconciliation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0445 | 641 | 39. Automated rent reconciliation | NOT AUDITED |  |  |
| V60-0446 | 643 | Match bank receipts with expected rent. | NOT AUDITED |  |  |
| V60-0447 | 645 | Recognise: | NOT AUDITED |  |  |
| V60-0448 | 647 | * Rent received. | NOT AUDITED |  |  |
| V60-0449 | 648 | * Partial payments. | NOT AUDITED |  |  |
| V60-0450 | 649 | * Outstanding rent. | NOT AUDITED |  |  |
| V60-0451 | 650 | * Advance rent. | NOT AUDITED |  |  |
| V60-0452 | 651 | * Security deposits. | NOT AUDITED |  |  |
| V60-0453 | 652 | * Other receipts. | NOT AUDITED |  |  |
| V60-0454 | 654 | Do not automatically treat security deposits as rental income. | NOT AUDITED |  |  |

## v6.0 — 40. Property operations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0455 | 656 | 40. Property operations | NOT AUDITED |  |  |
| V60-0456 | 658 | Support: | NOT AUDITED |  |  |
| V60-0457 | 660 | * Lease management. | NOT AUDITED |  |  |
| V60-0458 | 661 | * Renewals. | NOT AUDITED |  |  |
| V60-0459 | 662 | * Rent escalation. | NOT AUDITED |  |  |
| V60-0460 | 663 | * Tenant ledger. | NOT AUDITED |  |  |
| V60-0461 | 664 | * Rent collection. | NOT AUDITED |  |  |
| V60-0462 | 665 | * Maintenance. | NOT AUDITED |  |  |
| V60-0463 | 666 | * Utilities. | NOT AUDITED |  |  |
| V60-0464 | 667 | * Property expenses. | NOT AUDITED |  |  |
| V60-0465 | 668 | * Vendors. | NOT AUDITED |  |  |
| V60-0466 | 669 | * Insurance. | NOT AUDITED |  |  |
| V60-0467 | 670 | * Property tax records. | NOT AUDITED |  |  |
| V60-0468 | 671 | * Capital improvements. | NOT AUDITED |  |  |
| V60-0469 | 672 | * Occupancy reporting. | NOT AUDITED |  |  |

## v6.0 — 41. Property accounting

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0470 | 674 | 41. Property accounting | NOT AUDITED |  |  |
| V60-0471 | 676 | Link applicable transactions to: | NOT AUDITED |  |  |
| V60-0472 | 678 | * Income and expenditure. | NOT AUDITED |  |  |
| V60-0473 | 679 | * Receivables. | NOT AUDITED |  |  |
| V60-0474 | 680 | * Deposits. | NOT AUDITED |  |  |
| V60-0475 | 681 | * Loans. | NOT AUDITED |  |  |
| V60-0476 | 682 | * Assets. | NOT AUDITED |  |  |
| V60-0477 | 683 | * Depreciation. | NOT AUDITED |  |  |
| V60-0478 | 684 | * GST. | NOT AUDITED |  |  |
| V60-0479 | 685 | * Income tax. | NOT AUDITED |  |  |
| V60-0480 | 687 | Avoid duplicate property valuation between Asset Management and Property Management. | NOT AUDITED |  |  |
| V60-0481 | 691 | PART I — INVESTMENTS & DEMAT | NOT AUDITED |  |  |

## v6.0 — 42. Demat Controls integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0482 | 693 | 42. Demat Controls integration | NOT AUDITED |  |  |
| V60-0483 | 695 | Retain the previously specified Demat Controls module. | NOT AUDITED |  |  |
| V60-0484 | 697 | Support: | NOT AUDITED |  |  |
| V60-0485 | 699 | * ICICI Direct statements. | NOT AUDITED |  |  |
| V60-0486 | 700 | * Stocks. | NOT AUDITED |  |  |
| V60-0487 | 701 | * Mutual funds. | NOT AUDITED |  |  |
| V60-0488 | 702 | * ETFs. | NOT AUDITED |  |  |
| V60-0489 | 703 | * Gold. | NOT AUDITED |  |  |
| V60-0490 | 704 | * Bonds. | NOT AUDITED |  |  |
| V60-0491 | 705 | * Other investments. | NOT AUDITED |  |  |
| V60-0492 | 707 | Use Statement Desk for imports. | NOT AUDITED |  |  |
| V60-0493 | 709 | Store originals in DocuRepo. | NOT AUDITED |  |  |

## v6.0 — 43. Investment automation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0494 | 711 | 43. Investment automation | NOT AUDITED |  |  |
| V60-0495 | 713 | Automatically identify: | NOT AUDITED |  |  |
| V60-0496 | 715 | * Holdings. | NOT AUDITED |  |  |
| V60-0497 | 716 | * Purchases. | NOT AUDITED |  |  |
| V60-0498 | 717 | * Sales. | NOT AUDITED |  |  |
| V60-0499 | 718 | * Dividends. | NOT AUDITED |  |  |
| V60-0500 | 719 | * Redemptions. | NOT AUDITED |  |  |
| V60-0501 | 720 | * Corporate actions. | NOT AUDITED |  |  |
| V60-0502 | 721 | * Brokerage charges. | NOT AUDITED |  |  |
| V60-0503 | 722 | * Cost basis where evidenced. | NOT AUDITED |  |  |
| V60-0504 | 723 | * Portfolio values where verified sources exist. | NOT AUDITED |  |  |
| V60-0505 | 725 | Do not invent acquisition costs or current prices. | NOT AUDITED |  |  |

## v6.0 — 44. Net-worth integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0506 | 727 | 44. Net-worth integration | NOT AUDITED |  |  |
| V60-0507 | 729 | Include investment valuations with: | NOT AUDITED |  |  |
| V60-0508 | 731 | * Ownership. | NOT AUDITED |  |  |
| V60-0509 | 732 | * Valuation date. | NOT AUDITED |  |  |
| V60-0510 | 733 | * Data source. | NOT AUDITED |  |  |
| V60-0511 | 734 | * Verification status. | NOT AUDITED |  |  |
| V60-0512 | 736 | Avoid double-counting assets and brokerage cash. | NOT AUDITED |  |  |
| V60-0513 | 740 | PART J — TAX & GST | NOT AUDITED |  |  |

## v6.0 — 45. Multi-entity Tax & Audit Centre

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0514 | 742 | 45. Multi-entity Tax & Audit Centre | NOT AUDITED |  |  |
| V60-0515 | 744 | Support applicable taxation and reporting for: | NOT AUDITED |  |  |
| V60-0516 | 746 | * Individuals. | NOT AUDITED |  |  |
| V60-0517 | 747 | * Proprietorships. | NOT AUDITED |  |  |
| V60-0518 | 748 | * Companies. | NOT AUDITED |  |  |
| V60-0519 | 749 | * LLPs. | NOT AUDITED |  |  |
| V60-0520 | 750 | * Partnerships. | NOT AUDITED |  |  |
| V60-0521 | 751 | * Trusts. | NOT AUDITED |  |  |
| V60-0522 | 752 | * Other supported entities. | NOT AUDITED |  |  |
| V60-0523 | 754 | Every entity must have its own tax profile and filing obligations. | NOT AUDITED |  |  |

## v6.0 — 46. Automated tax preparation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0524 | 756 | 46. Automated tax preparation | NOT AUDITED |  |  |
| V60-0525 | 758 | Use: | NOT AUDITED |  |  |
| V60-0526 | 760 | * Financial statements. | NOT AUDITED |  |  |
| V60-0527 | 761 | * Bank transactions. | NOT AUDITED |  |  |
| V60-0528 | 762 | * Salary documents. | NOT AUDITED |  |  |
| V60-0529 | 763 | * Rental income. | NOT AUDITED |  |  |
| V60-0530 | 764 | * Investment records. | NOT AUDITED |  |  |
| V60-0531 | 765 | * Loan information. | NOT AUDITED |  |  |
| V60-0532 | 766 | * Asset depreciation. | NOT AUDITED |  |  |
| V60-0533 | 767 | * Tax statements. | NOT AUDITED |  |  |
| V60-0534 | 768 | * Previously filed returns. | NOT AUDITED |  |  |
| V60-0535 | 770 | Prepare applicable tax computations and return data. | NOT AUDITED |  |  |
| V60-0536 | 772 | Do not invent deductions or tax credits. | NOT AUDITED |  |  |

## v6.0 — 47. GST

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0537 | 774 | 47. GST | NOT AUDITED |  |  |
| V60-0538 | 776 | Support relevant GSTIN-specific: | NOT AUDITED |  |  |
| V60-0539 | 778 | * Invoice register. | PARTIAL | src/components/books/TaxCentre.tsx, src/lib/books/gst.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0540 | 779 | * GSTR-1 preparation. | PARTIAL | src/lib/books/gst.ts, src/lib/books/gst-special.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0541 | 780 | * GSTR-3B preparation. | PARTIAL | src/lib/books/gst.ts, src/lib/books/gst-special.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0542 | 781 | * GSTR-2B reconciliation. | NOT AUDITED |  |  |
| V60-0543 | 782 | * Input tax credit review. | PARTIAL | src/lib/books/compliance.ts, src/lib/books/gst.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0544 | 783 | * GST payment matching. | NOT AUDITED |  |  |
| V60-0545 | 784 | * Applicable annual returns. | NOT AUDITED |  |  |
| V60-0546 | 785 | * Filing evidence. | PARTIAL | src/components/books/TaxCentre.tsx, src/lib/books/types.ts | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0547 | 787 | Recognise the actual filing scheme and applicable obligations. | PARTIAL | src/lib/books/compliance.ts, src/components/books/TaxCentre.tsx | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |

## v6.0 — 48. Filing

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0548 | 789 | 48. Filing | NOT AUDITED |  |  |
| V60-0549 | 791 | Prepare validated draft returns and supporting reports. | NOT AUDITED |  |  |
| V60-0550 | 793 | Actual statutory filing must require explicit approval and use an authorised method. | NOT AUDITED |  |  |
| V60-0551 | 797 | PART K — REGULATORY INTELLIGENCE | NOT AUDITED |  |  |

## v6.0 — 49. Automated government-rule monitoring

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0552 | 799 | 49. Automated government-rule monitoring | NOT AUDITED |  |  |
| V60-0553 | 801 | Build a version-controlled Regulatory Intelligence Engine. | NOT AUDITED |  |  |
| V60-0554 | 803 | Monitor appropriate official sources for: | NOT AUDITED |  |  |
| V60-0555 | 805 | * Income-tax changes. | NOT AUDITED |  |  |
| V60-0556 | 806 | * GST changes. | NOT AUDITED |  |  |
| V60-0557 | 807 | * Corporate reporting changes. | NOT AUDITED |  |  |
| V60-0558 | 808 | * Depreciation rules. | NOT AUDITED |  |  |
| V60-0559 | 809 | * Return formats. | NOT AUDITED |  |  |
| V60-0560 | 810 | * Filing schemas. | NOT AUDITED |  |  |
| V60-0561 | 811 | * Validation rules. | NOT AUDITED |  |  |
| V60-0562 | 812 | * Due dates. | NOT AUDITED |  |  |
| V60-0563 | 813 | * Relevant property-related compliance. | NOT AUDITED |  |  |

## v6.0 — 50. Rule updates

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0564 | 815 | 50. Rule updates | NOT AUDITED |  |  |
| V60-0565 | 817 | For every change: | NOT AUDITED |  |  |
| V60-0566 | 819 | * Preserve the source. | NOT AUDITED |  |  |
| V60-0567 | 820 | * Record publication and effective dates. | NOT AUDITED |  |  |
| V60-0568 | 821 | * Determine affected entities. | NOT AUDITED |  |  |
| V60-0569 | 822 | * Determine affected periods. | NOT AUDITED |  |  |
| V60-0570 | 823 | * Compare previous and new rules. | NOT AUDITED |  |  |
| V60-0571 | 824 | * Run validation tests. | NOT AUDITED |  |  |
| V60-0572 | 825 | * Flag ambiguity. | NOT AUDITED |  |  |
| V60-0573 | 826 | * Obtain appropriate approval. | NOT AUDITED |  |  |
| V60-0574 | 827 | * Activate validated changes. | NOT AUDITED |  |  |
| V60-0575 | 829 | Do not silently alter filed returns or closed financial years. | NOT AUDITED |  |  |

## v6.0 — 51. Automatic form generation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0576 | 831 | 51. Automatic form generation | NOT AUDITED |  |  |
| V60-0577 | 833 | Generate filing drafts using applicable, validated official schemas. | NOT AUDITED |  |  |
| V60-0578 | 835 | Retain historical form versions. | NOT AUDITED |  |  |
| V60-0579 | 837 | An automatically generated return is not a submitted return. | NOT AUDITED |  |  |
| V60-0580 | 841 | PART L — CONTINUOUS AUDIT | NOT AUDITED |  |  |

## v6.0 — 52. Always audit-ready

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0581 | 843 | 52. Always audit-ready | NOT AUDITED |  |  |
| V60-0582 | 845 | Implement continuous checks instead of waiting until year-end. | NOT AUDITED |  |  |
| V60-0583 | 847 | Track: | NOT AUDITED |  |  |
| V60-0584 | 849 | * Unreconciled bank entries. | NOT AUDITED |  |  |
| V60-0585 | 850 | * Incorrect classifications. | NOT AUDITED |  |  |
| V60-0586 | 851 | * Missing invoices. | NOT AUDITED |  |  |
| V60-0587 | 852 | * Duplicate transactions. | NOT AUDITED |  |  |
| V60-0588 | 853 | * Asset registration gaps. | NOT AUDITED |  |  |
| V60-0589 | 854 | * Depreciation differences. | NOT AUDITED |  |  |
| V60-0590 | 855 | * Property/rent discrepancies. | NOT AUDITED |  |  |
| V60-0591 | 856 | * Tax mismatches. | NOT AUDITED |  |  |
| V60-0592 | 857 | * GST exceptions. | NOT AUDITED |  |  |
| V60-0593 | 858 | * Investment cost-basis gaps. | NOT AUDITED |  |  |
| V60-0594 | 859 | * Intercompany differences. | NOT AUDITED |  |  |
| V60-0595 | 860 | * Missing financial documents. | NOT AUDITED |  |  |

## v6.0 — 53. Financial Inbox integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0596 | 862 | 53. Financial Inbox integration | NOT AUDITED |  |  |
| V60-0597 | 864 | Use the existing Financial Inbox to resolve exceptions. | NOT AUDITED |  |  |
| V60-0598 | 866 | Do not create competing issue queues. | NOT AUDITED |  |  |
| V60-0599 | 868 | Group issues by: | NOT AUDITED |  |  |
| V60-0600 | 870 | * Entity. | NOT AUDITED |  |  |
| V60-0601 | 871 | * Account. | NOT AUDITED |  |  |
| V60-0602 | 872 | * Financial year. | NOT AUDITED |  |  |
| V60-0603 | 873 | * Issue type. | NOT AUDITED |  |  |
| V60-0604 | 874 | * Risk. | NOT AUDITED |  |  |
| V60-0605 | 875 | * Supporting evidence. | NOT AUDITED |  |  |

## v6.0 — 54. Audit-readiness dashboard

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0606 | 877 | 54. Audit-readiness dashboard | NOT AUDITED |  |  |
| V60-0607 | 879 | Display: | NOT AUDITED |  |  |
| V60-0608 | 881 | * Reconciled accounts. | NOT AUDITED |  |  |
| V60-0609 | 882 | * Open exceptions. | NOT AUDITED |  |  |
| V60-0610 | 883 | * Missing evidence. | NOT AUDITED |  |  |
| V60-0611 | 884 | * Closed accounting periods. | NOT AUDITED |  |  |
| V60-0612 | 885 | * Draft reports. | NOT AUDITED |  |  |
| V60-0613 | 886 | * Pending tax preparation. | NOT AUDITED |  |  |
| V60-0614 | 887 | * Unverified balances. | NOT AUDITED |  |  |
| V60-0615 | 888 | * Required approvals. | NOT AUDITED |  |  |
| V60-0616 | 890 | Readiness indicators must reflect actual verified data. | NOT AUDITED |  |  |
| V60-0617 | 894 | PART M — AUTOMATION LEVELS | NOT AUDITED |  |  |

## v6.0 — 55. Automatic operations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0618 | 896 | 55. Automatic operations | NOT AUDITED |  |  |
| V60-0619 | 898 | Permit safe automatic: | NOT AUDITED |  |  |
| V60-0620 | 900 | * Document classification. | NOT AUDITED |  |  |
| V60-0621 | 901 | * Data extraction. | NOT AUDITED |  |  |
| V60-0622 | 902 | * Merchant recognition. | NOT AUDITED |  |  |
| V60-0623 | 903 | * Entity matching. | NOT AUDITED |  |  |
| V60-0624 | 904 | * Document linking. | NOT AUDITED |  |  |
| V60-0625 | 905 | * Duplicate detection. | NOT AUDITED |  |  |
| V60-0626 | 906 | * Draft report generation. | NOT AUDITED |  |  |
| V60-0627 | 907 | * Reminder generation. | NOT AUDITED |  |  |
| V60-0628 | 908 | * Read-only regulatory monitoring. | NOT AUDITED |  |  |
| V60-0629 | 909 | * Calculation previews. | NOT AUDITED |  |  |

## v6.0 — 56. Confirmation-based operations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0630 | 911 | 56. Confirmation-based operations | NOT AUDITED |  |  |
| V60-0631 | 913 | Require review according to an approved policy for: | PARTIAL | src/lib/store.tsx, src/lib/preference-review.ts, drizzle/migrations/0080_reviewed_preference_saves.sql | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0632 | 915 | * Opening balances. | NOT AUDITED |  |  |
| V60-0633 | 916 | * Asset capitalisation. | NOT AUDITED |  |  |
| V60-0634 | 917 | * Transaction reclassification. | NOT AUDITED |  |  |
| V60-0635 | 918 | * Property and tenant associations. | PARTIAL | src/lib/preference-review.ts, src/components/books/PropertyPanel.tsx | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0636 | 919 | * Depreciation posting. | NOT AUDITED |  |  |
| V60-0637 | 920 | * Tax treatment changes. | PARTIAL | src/lib/preference-review.ts, src/components/books/TaxCentre.tsx | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0638 | 921 | * Historical corrections. | NOT AUDITED |  |  |
| V60-0639 | 922 | * Reimbursement settlements. | NOT AUDITED |  |  |

## v6.0 — 57. Restricted operations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0640 | 924 | 57. Restricted operations | NOT AUDITED |  |  |
| V60-0641 | 926 | Require explicit authorised approval for: | NOT AUDITED |  |  |
| V60-0642 | 928 | * Closed-period changes. | PARTIAL | drizzle/migrations/0081_closed_gst_amendment_guard.sql, drizzle/migrations/0069_freeze_financial_registers.sql | docs/VERIFICATION_RESULTS.md; src/lib/books/preference-approval-sql.test.ts; src/lib/books/closed-gst-amendments-sql.test.ts; src/lib/books/gst-special.test.ts |
| V60-0643 | 929 | * Shared database migrations. | NOT AUDITED |  |  |
| V60-0644 | 930 | * Financial statement finalisation. | NOT AUDITED |  |  |
| V60-0645 | 931 | * Statutory filing. | NOT AUDITED |  |  |
| V60-0646 | 932 | * Statutory certification. | NOT AUDITED |  |  |
| V60-0647 | 933 | * Production deployment. | NOT AUDITED |  |  |
| V60-0648 | 937 | PART N — USER EXPERIENCE | NOT AUDITED |  |  |

## v6.0 — 58. Zero routine manual entry

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0649 | 939 | 58. Zero routine manual entry | NOT AUDITED |  |  |
| V60-0650 | 941 | The default user action should be: | NOT AUDITED |  |  |
| V60-0651 | 943 | Upload a document. | NOT AUDITED |  |  |
| V60-0652 | 945 | Ledgerline should do the rest of the supported extraction and preparation. | NOT AUDITED |  |  |
| V60-0653 | 947 | The user should mainly see: | NOT AUDITED |  |  |
| V60-0654 | 949 | * Information extracted. | NOT AUDITED |  |  |
| V60-0655 | 950 | * Records identified. | NOT AUDITED |  |  |
| V60-0656 | 951 | * Records proposed. | NOT AUDITED |  |  |
| V60-0657 | 952 | * Conflicts detected. | NOT AUDITED |  |  |
| V60-0658 | 953 | * Actions requiring approval. | NOT AUDITED |  |  |
| V60-0659 | 955 | Do not force the user to repeatedly type information already available in verified documents. | NOT AUDITED |  |  |

## v6.0 — 59. Missing-information handling

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0660 | 957 | 59. Missing-information handling | NOT AUDITED |  |  |
| V60-0661 | 959 | When a required field cannot be extracted: | NOT AUDITED |  |  |

## v6.0 — 1. Search existing trusted records.

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0662 | 961 | 1. Search existing trusted records. | NOT AUDITED |  |  |
| V60-0663 | 962 | 2. Search related documents. | NOT AUDITED |  |  |
| V60-0664 | 963 | 3. Check approved mappings. | NOT AUDITED |  |  |
| V60-0665 | 964 | 4. Identify whether the field can be derived reliably. | NOT AUDITED |  |  |
| V60-0666 | 965 | 5. Ask for the smallest possible missing piece of information. | NOT AUDITED |  |  |
| V60-0667 | 967 | Offer correction directly on the extracted field. | PARTIAL | src/lib/books/source-corrections.ts, src/components/DocumentIntake.tsx | 5 source-correction regressions PASS; printed originals retained; invalid numbers refused |
| V60-0668 | 969 | Do not invent values to avoid asking the user. | NOT AUDITED |  |  |

## v6.0 — 60. iPhone, iPad and desktop

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0669 | 971 | 60. iPhone, iPad and desktop | NOT AUDITED |  |  |
| V60-0670 | 973 | Provide fully responsive layouts. | NOT AUDITED |  |  |
| V60-0671 | 975 | On iPad landscape, prefer list-and-detail views. | NOT AUDITED |  |  |
| V60-0672 | 977 | On mobile, keep confirmation actions accessible and avoid oversized tables. | NOT AUDITED |  |  |
| V60-0673 | 979 | Ensure the bottom navigation never covers essential controls. | NOT AUDITED |  |  |
| V60-0674 | 983 | PART O — IMPLEMENTATION PLAN | NOT AUDITED |  |  |

## v6.0 — 61. Phase 1 — Existing application audit

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0675 | 985 | 61. Phase 1 — Existing application audit | NOT AUDITED |  |  |
| V60-0676 | 987 | Inspect the current Ledgerline implementation. | NOT AUDITED |  |  |
| V60-0677 | 989 | Identify: | NOT AUDITED |  |  |
| V60-0678 | 991 | * Existing Statement Desk. | NOT AUDITED |  |  |
| V60-0679 | 992 | * Document handling. | NOT AUDITED |  |  |
| V60-0680 | 993 | * Financial ledger. | NOT AUDITED |  |  |
| V60-0681 | 994 | * Accounts. | NOT AUDITED |  |  |
| V60-0682 | 995 | * Entity directory. | NOT AUDITED |  |  |
| V60-0683 | 996 | * Tax modules. | NOT AUDITED |  |  |
| V60-0684 | 997 | * Investments. | NOT AUDITED |  |  |
| V60-0685 | 998 | * Assets. | NOT AUDITED |  |  |
| V60-0686 | 999 | * Property functionality. | NOT AUDITED |  |  |
| V60-0687 | 1000 | * Financial Inbox. | NOT AUDITED |  |  |
| V60-0688 | 1001 | * Reports. | NOT AUDITED |  |  |
| V60-0689 | 1003 | Preserve working functionality. | NOT AUDITED |  |  |

## v6.0 — 62. Phase 2 — Document foundation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0690 | 1005 | 62. Phase 2 — Document foundation | NOT AUDITED |  |  |
| V60-0691 | 1007 | Develop the integrated Statement Desk and DocuRepo processing system. | NOT AUDITED |  |  |
| V60-0692 | 1009 | Verify automatic classification, extraction, evidence storage and routing. | NOT AUDITED |  |  |

## v6.0 — 63. Phase 3 — Entity and historical onboarding

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0693 | 1011 | 63. Phase 3 — Entity and historical onboarding | NOT AUDITED |  |  |
| V60-0694 | 1013 | Implement document-driven entity creation and prior-year financial statement ingestion. | NOT AUDITED |  |  |

## v6.0 — 64. Phase 4 — Financial automation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0695 | 1015 | 64. Phase 4 — Financial automation | NOT AUDITED |  |  |
| V60-0696 | 1017 | Complete reconciliation, matching, transaction classification and continuous exception detection. | NOT AUDITED |  |  |

## v6.0 — 65. Phase 5 — Asset and Property Management

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0697 | 1019 | 65. Phase 5 — Asset and Property Management | NOT AUDITED |  |  |
| V60-0698 | 1021 | Implement extensive registers, operational workflows, document mapping and financial links. | NOT AUDITED |  |  |

## v6.0 — 66. Phase 6 — Depreciation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0699 | 1023 | 66. Phase 6 — Depreciation | NOT AUDITED |  |  |
| V60-0700 | 1025 | Implement separate book and tax depreciation engines and tested schedules. | NOT AUDITED |  |  |

## v6.0 — 67. Phase 7 — Tax and regulatory integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0701 | 1027 | 67. Phase 7 — Tax and regulatory integration | NOT AUDITED |  |  |
| V60-0702 | 1029 | Connect Income Tax, GST, validated filing formats and official rule monitoring. | NOT AUDITED |  |  |

## v6.0 — 68. Phase 8 — Continuous auditing

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0703 | 1031 | 68. Phase 8 — Continuous auditing | NOT AUDITED |  |  |
| V60-0704 | 1033 | Implement proactive checks, review workflows and period-closing evidence. | PARTIAL | src/routes/_authenticated/audit.tsx, src/components/books/PeriodEvidence.tsx, drizzle/migrations/0070_authoritative_period_close_evidence.sql, drizzle/migrations/0072_period_recovery_authority.sql, drizzle/migrations/0073_period_authority_preference_upserts.sql, src/lib/books/period-recovery-sql.test.ts | 7 PostgreSQL period-evidence tests PASS; isolated /audit close/download/reload/reopen PASS; screenshots inspected; 8 isolated PostgreSQL recovery/authority cases PASS; applied safeguards read back in Cloud; isolated Audit imported-history label/download + close/reopen PASS; backup recovery PASS |

## v6.0 — 69. Phase 9 — Verification

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0705 | 1035 | 69. Phase 9 — Verification | NOT AUDITED |  |  |
| V60-0706 | 1037 | Run isolated end-to-end tests using complete document-to-report workflows. | NOT AUDITED |  |  |

## v6.0 — 70. Phase 10 — Acceptance

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0707 | 1039 | 70. Phase 10 — Acceptance | NOT AUDITED |  |  |
| V60-0708 | 1041 | Submit full implementation evidence and await explicit approval. | NOT AUDITED |  |  |
| V60-0709 | 1045 | PART P — VERIFICATION REQUIREMENTS | NOT AUDITED |  |  |

## v6.0 — 71. Mandatory tests

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V60-0710 | 1047 | 71. Mandatory tests | NOT AUDITED |  |  |
| V60-0711 | 1049 | At minimum, verify: | NOT AUDITED |  |  |
| V60-0712 | 1051 | 1. Upload company incorporation documents and generate a draft entity profile. | NOT AUDITED |  |  |
| V60-0713 | 1052 | 2. Re-upload the same documents without creating duplicates. | NOT AUDITED |  |  |
| V60-0714 | 1053 | 3. Upload a prior-year audited balance sheet and prepare opening balances. | NOT AUDITED |  |  |
| V60-0715 | 1054 | 4. Detect incomplete audited schedules without fabricating missing details. | NOT AUDITED |  |  |
| V60-0716 | 1055 | 5. Upload an asset invoice and generate a proposed asset record. | NOT AUDITED |  |  |
| V60-0717 | 1056 | 6. Calculate book and tax depreciation separately. | NOT AUDITED |  |  |
| V60-0718 | 1057 | 7. Upload a property deed and generate a proposed property record. | NOT AUDITED |  |  |
| V60-0719 | 1058 | 8. Upload a lease and extract tenant, rent, deposit and escalation terms. | NOT AUDITED |  |  |
| V60-0720 | 1059 | 9. Match rental receipts from bank statements. | NOT AUDITED |  |  |
| V60-0721 | 1060 | 10. Distinguish security deposits from rental income. | NOT AUDITED |  |  |
| V60-0722 | 1061 | 11. Import ICICI Direct holdings through Statement Desk. | NOT AUDITED |  |  |
| V60-0723 | 1062 | 12. Reconcile investment holdings without duplicates. | NOT AUDITED |  |  |
| V60-0724 | 1063 | 13. Detect a new applicable regulatory rule. | NOT AUDITED |  |  |
| V60-0725 | 1064 | 14. Preserve historical calculations under the previous rule. | NOT AUDITED |  |  |
| V60-0726 | 1065 | 15. Generate the correct period-specific tax form draft. | NOT AUDITED |  |  |
| V60-0727 | 1066 | 16. Process a bank debit without an invoice. | NOT AUDITED |  |  |
| V60-0728 | 1067 | 17. Match internal transfers without duplicate income or expenditure. | NOT AUDITED |  |  |
| V60-0729 | 1068 | 18. Match credit card settlements without duplicate spending. | NOT AUDITED |  |  |
| V60-0730 | 1069 | 19. Verify cross-entity access controls. | PARTIAL | drizzle/migrations/0075_entity_level_access.sql, src/components/books/CompanyAccess.tsx, src/lib/books/entity-accounts.ts (companyDocuments) | src/lib/books/entity-access-sql.test.ts 6/6: no-grant, foreign-company, personal-file, write, stranger and revoke refusals; entity-accounts.test.ts companyDocuments 2/2; Signed-in /entities panel render, no page errors (6 Nov) |
| V60-0731 | 1070 | 20. Demonstrate source-to-report traceability for every material financial figure. | NOT AUDITED |  |  |
| V60-0732 | 1071 | 21. Demonstrate safe failure, retry and recovery. | PARTIAL | src/components/DocumentIntake.tsx, src/lib/store.tsx, src/lib/books/runs.ts, drizzle/migrations/0071_revision_checked_document_intake.sql, drizzle/migrations/0074_typed_document_intake_validation.sql, src/lib/books/typed-intake-sql.test.ts | 7 PostgreSQL intake tests PASS; isolated /statements lost response → reload → same durable request recovery PASS; 8 typed-record SQL checks PASS; enforced validation read back in Cloud; isolated Statement Desk durable retry and Settings backup recovery PASS after safeguard changes |
| V60-0733 | 1072 | 22. Confirm all eight established financial-integrity checks. | NOT AUDITED |  |  |
| V60-0734 | 1074 | 72. Required deliverables | NOT AUDITED |  |  |
| V60-0735 | 1076 | Lovable must provide: | NOT AUDITED |  |  |
| V60-0736 | 1078 | * Existing System Audit. | NOT AUDITED |  |  |
| V60-0737 | 1079 | * Statement Desk Integration Report. | NOT AUDITED |  |  |
| V60-0738 | 1080 | * DocuRepo Implementation Report. | NOT AUDITED |  |  |
| V60-0739 | 1081 | * Document Extraction Accuracy Report. | NOT AUDITED |  |  |
| V60-0740 | 1082 | * Entity Onboarding Verification. | NOT AUDITED |  |  |
| V60-0741 | 1083 | * Previous-Year Financial Import Verification. | NOT AUDITED |  |  |
| V60-0742 | 1084 | * Opening Balance Reconciliation. | NOT AUDITED |  |  |
| V60-0743 | 1085 | * Asset Register Verification. | NOT AUDITED |  |  |
| V60-0744 | 1086 | * Depreciation Verification. | NOT AUDITED |  |  |
| V60-0745 | 1087 | * Property Management Verification. | NOT AUDITED |  |  |
| V60-0746 | 1088 | * Rental Reconciliation. | NOT AUDITED |  |  |
| V60-0747 | 1089 | * Demat Import Verification. | NOT AUDITED |  |  |
| V60-0748 | 1090 | * Regulatory Intelligence Test Report. | NOT AUDITED |  |  |
| V60-0749 | 1091 | * Tax/GST Preparation Verification. | NOT AUDITED |  |  |
| V60-0750 | 1092 | * Continuous Audit Report. | NOT AUDITED |  |  |
| V60-0751 | 1093 | * Financial Integrity Report. | NOT AUDITED |  |  |
| V60-0752 | 1094 | * Security and Permissions Report. | NOT AUDITED |  |  |
| V60-0753 | 1095 | * Responsive Design Screenshots. | NOT AUDITED |  |  |
| V60-0754 | 1096 | * Exception Register. | NOT AUDITED |  |  |
| V60-0755 | 1097 | * Deployment Readiness Report. | NOT AUDITED |  |  |
| V60-0756 | 1101 | FINAL INSTRUCTIONS TO LOVABLE | NOT AUDITED |  |  |
| V60-0757 | 1103 | Build Ledgerline as a continuously audit-ready financial operating system. | NOT AUDITED |  |  |
| V60-0758 | 1105 | Statement Desk must remain the single standard document-entry point. | NOT AUDITED |  |  |
| V60-0759 | 1107 | DocuRepo must be the central repository for original documents, extracted information, references and audit evidence. | NOT AUDITED |  |  |
| V60-0760 | 1109 | Maximise reliable automation across all financial, tax, investment, asset and property workflows. | NOT AUDITED |  |  |
| V60-0761 | 1111 | Minimise routine manual data entry. | NOT AUDITED |  |  |
| V60-0762 | 1113 | Automatically identify, extract, classify, prefill, match and prepare records wherever reliable evidence exists. | NOT AUDITED |  |  |
| V60-0763 | 1115 | Preserve the complete existing Ledgerline database and every original source document. | NOT AUDITED |  |  |
| V60-0764 | 1117 | Do not create duplicate financial records or conflicting calculation engines. | NOT AUDITED |  |  |
| V60-0765 | 1119 | Do not invent missing financial information. | NOT AUDITED |  |  |
| V60-0766 | 1121 | Do not silently reinterpret uncertain legal requirements. | NOT AUDITED |  |  |
| V60-0767 | 1123 | Do not modify shared historical records, closed periods or database schemas without approval. | NOT AUDITED |  |  |
| V60-0768 | 1125 | Do not file statutory returns or perform statutory certifications automatically. | NOT AUDITED |  |  |
| V60-0769 | 1127 | Do not publish or deploy to the live application without explicit approval. | NOT AUDITED |  |  |
| V60-0770 | 1129 | Implement in an isolated environment, verify the complete document-to-ledger-to-report process, submit all evidence and wait for approval. | NOT AUDITED |  |  |

## v6.1 — Preamble

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0001 | 1 | LEDGERLINE v6.1 — LIVE MARKET DATA & DYNAMIC NET WORTH | NOT AUDITED |  |  |
| V61-0002 | 3 | Integration with Demat Controls and Ledgerline v6.0 | NOT AUDITED |  |  |

## v6.1 — 1. Objective

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0003 | 5 | 1. Objective | NOT AUDITED |  |  |
| V61-0004 | 7 | Implement automated market-price retrieval, portfolio valuation and dynamic net-worth calculations. | NOT AUDITED |  |  |
| V61-0005 | 9 | The module must use existing Demat holdings, investment records, bank balances, assets and liabilities. | NOT AUDITED |  |  |
| V61-0006 | 11 | Do not create duplicate investment holdings or financial transactions. | NOT AUDITED |  |  |

## v6.1 — 2. Market-data integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0007 | 13 | 2. Market-data integration | NOT AUDITED |  |  |
| V61-0008 | 15 | Support authorised providers for: | NOT AUDITED |  |  |
| V61-0009 | 17 | * NSE-listed equities. | NOT AUDITED |  |  |
| V61-0010 | 18 | * BSE-listed equities. | NOT AUDITED |  |  |
| V61-0011 | 19 | * Listed ETFs. | NOT AUDITED |  |  |
| V61-0012 | 20 | * Listed bonds and other supported securities. | NOT AUDITED |  |  |
| V61-0013 | 21 | * Mutual fund NAVs. | NOT AUDITED |  |  |
| V61-0014 | 22 | * Relevant currencies. | NOT AUDITED |  |  |
| V61-0015 | 23 | * Other supported market instruments. | NOT AUDITED |  |  |
| V61-0016 | 25 | Provider integrations must comply with their access, licensing, caching and redistribution conditions. | NOT AUDITED |  |  |
| V61-0017 | 27 | Do not use unauthorised scraping or circumvent website restrictions. | NOT AUDITED |  |  |

## v6.1 — 3. Security identification

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0018 | 29 | 3. Security identification | NOT AUDITED |  |  |
| V61-0019 | 31 | Match investments using: | NOT AUDITED |  |  |
| V61-0020 | 33 | * ISIN. | NOT AUDITED |  |  |
| V61-0021 | 34 | * Exchange. | NOT AUDITED |  |  |
| V61-0022 | 35 | * Symbol. | NOT AUDITED |  |  |
| V61-0023 | 36 | * Instrument type. | NOT AUDITED |  |  |
| V61-0024 | 37 | * Relevant fund identifiers. | NOT AUDITED |  |  |
| V61-0025 | 39 | Do not rely solely on security names. | NOT AUDITED |  |  |

## v6.1 — 4. Automatic valuation

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0026 | 41 | 4. Automatic valuation | NOT AUDITED |  |  |
| V61-0027 | 43 | Calculate: | NOT AUDITED |  |  |
| V61-0028 | 45 | Holding Value = Verified Quantity × Applicable Market Price | NOT AUDITED |  |  |
| V61-0029 | 47 | Portfolio Value = Sum of Recognised Holding Values + Applicable Investment-Account Cash | NOT AUDITED |  |  |
| V61-0030 | 49 | Use appropriate instrument-specific valuation rules. | NOT AUDITED |  |  |
| V61-0031 | 51 | Do not double-count investment cash or securities appearing in multiple account statements. | NOT AUDITED |  |  |

## v6.1 — 5. Market status

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0032 | 53 | 5. Market status | NOT AUDITED |  |  |
| V61-0033 | 55 | For every instrument, display: | NOT AUDITED |  |  |
| V61-0034 | 57 | * Exchange. | NOT AUDITED |  |  |
| V61-0035 | 58 | * Trading status. | NOT AUDITED |  |  |
| V61-0036 | 59 | * Last available price. | NOT AUDITED |  |  |
| V61-0037 | 60 | * Price date and time. | NOT AUDITED |  |  |
| V61-0038 | 61 | * Data provider. | NOT AUDITED |  |  |
| V61-0039 | 62 | * Live/delayed/end-of-day status. | NOT AUDITED |  |  |
| V61-0040 | 63 | * Last successful refresh. | PARTIAL | src/lib/market/bhavcopy.ts, src/components/books/useBooks.ts | actual per-exchange fetched_at regression PASS |
| V61-0041 | 64 | * Staleness indicator. | NOT AUDITED |  |  |
| V61-0042 | 66 | Do not label delayed or previous-close data as live. | NOT AUDITED |  |  |

## v6.1 — 6. Automatic updates

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0043 | 68 | 6. Automatic updates | NOT AUDITED |  |  |
| V61-0044 | 70 | During market hours, refresh eligible securities according to the authorised feed’s capabilities and permitted frequency. | NOT AUDITED |  |  |
| V61-0045 | 72 | Outside market hours, retain the latest valid closing or available price with its timestamp. | NOT AUDITED |  |  |
| V61-0046 | 74 | If a market-data request fails, preserve the previous valid value and mark it stale. | NOT AUDITED |  |  |
| V61-0047 | 76 | Do not substitute zero for missing prices. | NOT AUDITED |  |  |

## v6.1 — 7. Mutual fund NAV

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0048 | 78 | 7. Mutual fund NAV | NOT AUDITED |  |  |
| V61-0049 | 80 | Use an authorised, reliable NAV source. | NOT AUDITED |  |  |
| V61-0050 | 82 | Recognise that ordinary mutual fund NAVs are generally published for a valuation day rather than changing continuously like exchange-traded shares. | NOT AUDITED |  |  |
| V61-0051 | 84 | Refresh NAVs when newly published. | NOT AUDITED |  |  |
| V61-0052 | 86 | Show the NAV date. | NOT AUDITED |  |  |

## v6.1 — 8. Gold

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0053 | 88 | 8. Gold | NOT AUDITED |  |  |
| V61-0054 | 90 | Maintain separate valuations for: | NOT AUDITED |  |  |
| V61-0055 | 92 | * Gold ETFs. | NOT AUDITED |  |  |
| V61-0056 | 93 | * Sovereign Gold Bonds. | NOT AUDITED |  |  |
| V61-0057 | 94 | * Physical gold. | NOT AUDITED |  |  |
| V61-0058 | 96 | Gold ETFs may use appropriate exchange-traded prices. | NOT AUDITED |  |  |
| V61-0059 | 98 | Physical gold requires a configured valuation method, purity and weight. | NOT AUDITED |  |  |
| V61-0060 | 100 | Do not automatically treat an exchange-traded gold security’s price as the value of physical gold. | NOT AUDITED |  |  |

## v6.1 — 9. Dynamic net worth

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0061 | 102 | 9. Dynamic net worth | NOT AUDITED |  |  |
| V61-0062 | 104 | Recalculate net worth using: | NOT AUDITED |  |  |
| V61-0063 | 106 | * Latest reliable bank balances. | NOT AUDITED |  |  |
| V61-0064 | 107 | * Current investment valuations. | NOT AUDITED |  |  |
| V61-0065 | 108 | * Other recognised assets. | NOT AUDITED |  |  |
| V61-0066 | 109 | * Outstanding liabilities. | NOT AUDITED |  |  |
| V61-0067 | 110 | * Correct legal ownership. | NOT AUDITED |  |  |
| V61-0068 | 112 | Net Worth = Recognised Assets − Recognised Liabilities | NOT AUDITED |  |  |
| V61-0069 | 114 | Distinguish market-valued assets from bank-verified cash and manually valued assets. | NOT AUDITED |  |  |

## v6.1 — 10. Net-worth freshness

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0070 | 116 | 10. Net-worth freshness | NOT AUDITED |  |  |
| V61-0071 | 118 | Display a valuation timestamp and data-quality summary. | NOT AUDITED |  |  |
| V61-0072 | 120 | For example: | NOT AUDITED |  |  |
| V61-0073 | 122 | * Listed investments: Market price as of current trading session. | NOT AUDITED |  |  |
| V61-0074 | 123 | * Mutual funds: Latest published NAV. | NOT AUDITED |  |  |
| V61-0075 | 124 | * Bank accounts: Latest reconciled statement or authorised bank feed. | NOT AUDITED |  |  |
| V61-0076 | 125 | * Property: Latest dated valuation. | NOT AUDITED |  |  |
| V61-0077 | 126 | * Loans: Latest verified outstanding balance. | PARTIAL | src/lib/books/loan-balances.ts, src/components/books/LoanBalanceReview.tsx, src/components/books/useBooks.ts | 6 Nov: printed outstanding prefill from lender statement fields (proposePrintedBalance), 3 tests7 loan-balance rules PASS; controlled signed-in Wealth source confirmation/save/reload PASS, mobile screenshot inspected; hosted writes blocked |
| V61-0078 | 128 | Do not label overall net worth as fully live when important components are not live. | NOT AUDITED |  |  |

## v6.1 — 11. Home integration

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0079 | 130 | 11. Home integration | NOT AUDITED |  |  |
| V61-0080 | 132 | Add a dynamic Net Worth summary to the Ledgerline Home page. | NOT AUDITED |  |  |
| V61-0081 | 134 | Show: | NOT AUDITED |  |  |
| V61-0082 | 136 | * Net worth. | NOT AUDITED |  |  |
| V61-0083 | 137 | * Investment portfolio value. | NOT AUDITED |  |  |
| V61-0084 | 138 | * Investment movement. | NOT AUDITED |  |  |
| V61-0085 | 139 | * Liquid balances. | NOT AUDITED |  |  |
| V61-0086 | 140 | * Liabilities. | NOT AUDITED |  |  |
| V61-0087 | 141 | * Last update. | NOT AUDITED |  |  |
| V61-0088 | 142 | * Data freshness. | NOT AUDITED |  |  |
| V61-0089 | 144 | Provide a tap-through to the full Financial Position and Investments modules. | NOT AUDITED |  |  |

## v6.1 — 12. Historical valuations

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0090 | 146 | 12. Historical valuations | NOT AUDITED |  |  |
| V61-0091 | 148 | Maintain dated valuation snapshots for: | NOT AUDITED |  |  |
| V61-0092 | 150 | * Portfolio history. | NOT AUDITED |  |  |
| V61-0093 | 151 | * Net-worth history. | NOT AUDITED |  |  |
| V61-0094 | 152 | * Investment performance. | PARTIAL | src/lib/books/investment-flows.ts, src/components/books/useBooks.ts, src/components/books/MarketPanel.tsx, src/lib/books/market.ts | 6 signed-flow tests PASS; 2 movement-alert tests PASS |
| V61-0095 | 153 | * Asset allocation changes. | PARTIAL | src/components/books/MarketPanel.tsx | Demat allocation included; full suite PASS |
| V61-0096 | 155 | Snapshots must not create new ledger transactions. | NOT AUDITED |  |  |

## v6.1 — 13. Alerts

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0097 | 157 | 13. Alerts | NOT AUDITED |  |  |
| V61-0098 | 159 | Support: | NOT AUDITED |  |  |
| V61-0099 | 161 | * Significant portfolio changes. | NOT AUDITED |  |  |
| V61-0100 | 162 | * Missing market prices. | NOT AUDITED |  |  |
| V61-0101 | 163 | * Stale NAVs. | NOT AUDITED |  |  |
| V61-0102 | 164 | * Corporate actions requiring reconciliation. | NOT AUDITED |  |  |
| V61-0103 | 165 | * Holding quantity discrepancies. | NOT AUDITED |  |  |
| V61-0104 | 166 | * Unusual valuation differences. | NOT AUDITED |  |  |
| V61-0105 | 168 | Alerts must be configurable. | NOT AUDITED |  |  |

## v6.1 — 14. Testing

| ID | Line | Requirement | Status | Code | Tests / evidence |
|---|---|---|---|---|---|
| V61-0106 | 170 | 14. Testing | NOT AUDITED |  |  |
| V61-0107 | 172 | Verify: | NOT AUDITED |  |  |
| V61-0108 | 174 | 1. Correct ISIN-to-security matching. | NOT AUDITED |  |  |
| V61-0109 | 175 | 2. Different exchanges and instrument types. | NOT AUDITED |  |  |
| V61-0110 | 176 | 3. Real-time versus delayed price labels. | NOT AUDITED |  |  |
| V61-0111 | 177 | 4. Market-open and market-closed behaviour. | NOT AUDITED |  |  |
| V61-0112 | 178 | 5. Latest NAV updates. | NOT AUDITED |  |  |
| V61-0113 | 179 | 6. Market-data feed failures. | NOT AUDITED |  |  |
| V61-0114 | 180 | 7. Stale valuations. | NOT AUDITED |  |  |
| V61-0115 | 181 | 8. Duplicate holding prevention. | NOT AUDITED |  |  |
| V61-0116 | 182 | 9. Brokerage cash reconciliation. | NOT AUDITED |  |  |
| V61-0117 | 183 | 10. Portfolio valuation accuracy. | NOT AUDITED |  |  |
| V61-0118 | 184 | 11. Ownership-aware net worth. | NOT AUDITED |  |  |
| V61-0119 | 185 | 12. No duplicate ledger postings. | NOT AUDITED |  |  |
| V61-0120 | 186 | 13. iPhone/iPad/desktop responsiveness. | NOT AUDITED |  |  |
| V61-0121 | 188 | 15. Restrictions | NOT AUDITED |  |  |
| V61-0122 | 190 | Preserve existing Demat, investment and financial records. | NOT AUDITED |  |  |
| V61-0123 | 192 | Do not invent current prices. | NOT AUDITED |  |  |
| V61-0124 | 194 | Do not claim market data is real-time without an authorised real-time source. | NOT AUDITED |  |  |
| V61-0125 | 196 | Do not alter historical purchase costs from market-price updates. | NOT AUDITED |  |  |
| V61-0126 | 198 | Do not execute trades. | NOT AUDITED |  |  |
| V61-0127 | 200 | Do not modify shared financial data or database schemas without approval. | NOT AUDITED |  |  |
| V61-0128 | 202 | Do not deploy to production without explicit approval. | NOT AUDITED |  |  |
| V61-0129 | 204 | Implement in isolation and submit market-data source verification, valuation calculations, screenshots and test evidence for approval. | NOT AUDITED |  |  |
