# Verification results (executed evidence only)

| Date | Requirement | Check | Result |
|---|---|---|---|
| 2026-11-06 | V60-0162, V60-0730 company access | `bunx vitest run src/lib/books/entity-access-sql.test.ts` (disposable PostgreSQL) | 6/6 pass: no grant → nothing; other company → refused; personal untagged file → refused; member write/self-grant → refused; stranger → nothing; revoke → immediate loss |
| 2026-11-06 | Company document suggestions | `entity-accounts.test.ts` companyDocuments | 2/2 pass |
| 2026-11-06 | Company access panel | Signed-in browser, /entities | Panel renders on 5 companies, no page errors. No grant was created against real data |
| 2026-11-06 | V61-0077 loan balance prefill | `loan-balances.test.ts` | 10/10 pass |
| 2026-11-06 | Full suite (prior run) | `bunx vitest run` | 1,595 pass |

Not verified: hosted two-account access, real-device behaviour, real-document extraction accuracy, statutory approval.
| 2026-11-06 | V60-0719 cross-entity access, member uploads | `entity-upload-sql.test.ts`, `entity-transactions-sql.test.ts` (disposable PostgreSQL) | 12/12 pass: edit-grant upload allowed into owner prefix; view-only/other-company/stranger refused; revocation immediate; members cannot retag to another company or personal |
| 2026-11-06 | Shared company view exports | `shared-company.test.ts` | 7/7 pass: company-only CSV/PDF rows, search, formula-injection safety |
| 2026-11-06 | Document intake server approval (migration 0079) | `intake-revision-sql.test.ts`, `typed-intake-sql.test.ts` | 17/17 pass: unreviewed payload refused, altered payload/lock refused, committed retry replays after run removal, typed validation intact |
| 2026-11-06 | Broker cash vs account double-count | `recon-extra.test.ts` broker-cash cases | 4/4 pass: broker-name overlap flagged; liabilities, archived and generic-word matches silent |
| 2026-11-06 | Field-level provenance to reports | `tax-workpaper.test.ts` provenance cases | 3/3 pass: printed originals kept for corrections, per-taxpayer scoping, personal section entry-based |
| 2026-11-06 | V60 §71 all 22 mandatory cases | `books.test.ts` acceptance matrix | 37/37 pass, cases 1–22 each asserted |
| 2026-11-06 | Full suite | `bunx vitest run` | 1,629 pass (before matrix additions); matrix re-run green after |

## 6 Nov 2026 (evening session)
- Full suite: 215 files / 1,663 tests pass; typecheck clean.
- New: price overrides (3), report-status (3), asset event postings (3), figure sources (4), GST notes/amendments (6), opening fixed assets (2), invoice allocation (3).
- Browser (signed in, writes blocked): Required reports page, Wealth manual prices section, Audit Figure sources. Not browser-checked: GST note form, asset write-down posting.

## 6 Nov 2026 — Priority 3 continuation
- Full suite: 219 files / 1,680 tests passed after GST export/RCM/advance integration; preview build OK.
- Approval: 4 disposable PostgreSQL checks for direct-write rejection, policy disabling, explicit confirmation, stale revision, altered retry, owner isolation and confirmed recovery. 2 client rules checks. Direct-write enforcement is staged, NOT active in Cloud; published old-client compatibility is the reason, not a claim of completion.
- Installed: owner-only approval audit/reviewed-save RPC (`0080`, `0082`); closed GST amendment trigger (`0081`). Read-only database inventory confirms all three exist. No real record writes.
- Closed GST: 5 disposable PostgreSQL checks including no-session bypass, removing the target in the same update, allowed open-period note, already-reopened original and wrong-company/nonexistent targets.
- Source tracking: 2 new tests for salary/tax proof, missing linked entry and investment quantities/costs; no source labels are treated as retained documents.
- GST: current-only register regression; 3 special-treatment tests assert LUT exports excluded from domestic supply, RCM payable in cash despite other ITC, payment-gated credit, service-advance adjustment and non-taxable goods advance.
- `scripts/browser/test_priority_gst.py`: signed-in real Tax page with isolated preference/RPC responses; no write before approval, one invoice save, amendment displays one current row, advance saved, read-back after reload, no page errors. All external writes blocked. Screenshots inspected. This is NOT hosted write acceptance or real-document evidence.
- Outstanding: P3 direct-write rollout/journal transitions; P7 annual/payment/late-credit consistency; P2 derived dependencies; P12 other derived facts; individual audit of remaining NOT AUDITED clauses.

- Follow-up: 219 files / 1,681 tests pass; late RCM credit is counted only in the payment month, annual liability includes RCM, and monthly payment projections include service advances. Controlled GST browser rerun passed after these changes; build OK.
