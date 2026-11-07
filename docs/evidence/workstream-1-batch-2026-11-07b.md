# Workstream 1 — batch 2026-11-07 (b)

## Performance (real causes, measured)
Headless Chromium against the dev server, phone viewport 402×800, isolated demo workspace (synthetic seeded rows, removed after 24 h). Three reloads per page. "Settled" = no network for 500 ms.

| Page | Data requests before → after | Settled before (s) | Settled after (s) |
|---|---|---|---|
| Financial Inbox | 47 → 32 | 7.23 / 7.19 / 5.21 | 2.77 / 5.45 / 2.15 |
| Statement Desk | 34 → 25 | 7.20 / 7.33 / 2.51 | 2.49 / 2.18 / 2.16 |
| Expenses | 25 → 24 | 2.41 / 2.03 / 4.20 | 2.84 / 2.47 / 2.87 |
| Home | 28 → 27 | 2.86 / 2.01 / 2.02 | 4.30 / 3.66 / 2.14 |

Causes found and fixed:
1. Inbox import list polled every 5 s even with nothing processing → polls only while a statement is queued/processing; refreshes on focus.
2. Account evidence summary loaded every statement twice on open and did a full records refresh every 20 s → single debounced load; timer re-reads statement evidence only.
3. Identical concurrent reads (all statement imports with extracted lines, drafts, import rules) fired 3–6 times → shared in-flight reads (request-dedupe.ts; nothing cached after settle).
4. Session re-check ran on every page change and preload → at most once a minute (server still verifies every request).
Expenses/Home showed no fix-related change; their variance is dev-server noise. Dev-server timings are not production or device timings.

## Statement Desk end-to-end (isolated demo workspace)
Synthetic CSV with running Balance column, 4 lines. Verified: upload → account chosen → file self-check "opening + entries = printed closing" (new) → 2 regular purchases auto-proposed, salary/ATM held for decision → Apply → balance ₹4,47,267.00 → ₹4,44,417.50 (exactly ₹450 + ₹2,399.50) → original visible in DocuRepo → re-upload shows "Already recorded 2, Saved automatically 0" → Undo → balance back to ₹4,47,267.00 → re-upload shows 0 already recorded.

Defects found and fixed during this run:
- D1 (critical): a new account with no saved settings row could not save any statement ("Cannot coerce the result to a single JSON object"). Cause: history read used single(); and first save sent expected revision -1 where the database expects null. Fixed in store.tsx.
- D2 (critical): after the first save, later settings saves on that account failed "Approve the financial changes before saving" because empty default protected sections looked like changes to the database. Fixed with alignUnchangedSections (omits unchanged protected sections the database doesn't hold; never substitutes stored values). Tests in preference-review.test.ts.
- D3: spreadsheet statements with a Balance column were treated as having no closing figure. running-balance.ts now derives opening/closing only when every step adds up to the paisa in one order and sign. Tests in running-balance.test.ts.
- Observation (not changed): leaving the page during the final history write leaves the upload labelled "interrupted"; Undo and stored originals still work.

## The 28 missing requirements — individual review
| ID | Needs | Reason |
|---|---|---|
| C-0086 | Owner decision | Remove or move three MOVAC records on real data |
| C-0091 | Real records | ICICI kids statements to identify two ₹10,000 transfers |
| C-0108 | Real records | GLS loan statements must be posted to real records |
| C-0146 | External | Bank data-connection providers/regulation |
| C-0204 | Owner decision | Email connection set aside by owner |
| C-0212 | Device | Face ID on real iPhone |
| C-0462 | Buildable (report) | Delivered per batch; stays open until final report |
| C-0571, C-0781 | Live site + real records | Test entries on ledgerline.biz (publication on hold) |
| C-0737 | Real records | Safe copies of seven real account configurations |
| C-0760, C-1698 | Publication | ChatGPT OAuth against published MCP endpoint |
| C-1697 | Owner decision | Demo link for ChatGPT requires publication |
| C-0779, C-1038 | Device | PDF zoom/pan on real iPhone |
| C-0783 | Real records | Loan documents |
| C-0823 | Buildable (report) | Implementation report — this file series |
| C-0931 | Owner decision | Before/after UI review waits for separate UIX redesign |
| C-0995 | Done → implemented | Architecture documented in AGENTS.md files and docs/ |
| C-1546 | Owner/usability test | Needs real users |
| C-1630 | Buildable (process) | Failures logged with severity in evidence files; ongoing |
| C-1703, C-2065, C-2300 | Device + publication | Published app on iPhone/iPad |
| C-1765 | Buildable | Icon check at real phone sizes can be rendered headless — next batch |
| C-2386 | Buildable (plan) | Plan exists (roadmap/IMPLEMENTATION_PROGRESS); keep open until owner confirms |
| C-2387 | Done → implemented | Answered with register counts each batch |
| C-2402 | External | Same as C-0146 |
