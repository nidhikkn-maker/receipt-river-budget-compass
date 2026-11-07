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

## 6 Nov 2026 — 0083 journal/rule/closed-event guards
- Installed in Cloud (trigger confirmed present). 8 disposable PostgreSQL tests: closed-month posting refused, open posting allowed only as prepared, posted journals immutable, closed financial asset events frozen, physical checks allowed, rule activation needs approval date + passing checks, approved rules immutable/undeletable. Books suite 369/369 pass. No real records changed.

## 6 Nov 2026 — P3 compatibility matrix + P12 derived-figure snapshots (0084)
- Writer audit: every finance_preferences write path enumerated (RPC saves, document intake, period close/reopen, depreciation cron, finance_operation, claim inserts, erasing deletes, backup restore). Only restore needed the staged rewrite; all others already comply.
- preference-approval-sql.test.ts extended to 12 tests: with the staged guard active, intake exemption, period-close writes, cron journal preparation and finance_operation upserts all pass; direct sensitive writes stay blocked.
- 0084 installed in Cloud: change_accounting_period gains optional _figures (version-1 shape validated), freezes derivedFigures + SHA-256 figureRevision + owner-only account snapshot into close evidence; old 6-arg calls still resolve (backward compatible, verified by PGlite test).
- period-figures.ts: 7 pure tests (in-period totals, credit-note/amendment handling, drift detection, reproducibility from evidence, parsing). period-figures-sql.test.ts: 4 PGlite tests (figures frozen, 6-arg compat, malformed rejected, replay immutable).
- Full suite 222 files / 1,704 tests pass; typecheck clean; build OK. No real records changed; staged trigger still NOT installed (awaits owner-approved publish).

## 6 Nov 2026 (cont.) — P7 advance/annual working, P4 nested intake validation (0085), P2 derived chains
- gst-special.ts: adjustments may under-claim but never over-claim the advance's pro-rata tax rate; advanceCrossProblems blocks adjustments that together exceed the invoice they settle; both enforced at GstAdvances save. 2 new tests.
- gst.ts gstr9Heads: per-head (IGST/CGST/SGST/cess) annual output, credit claimed, reverse-charge cash, advance tax and year-end carry, with per-head held-credit reviews; shown under the GSTR-9 working in Tax Centre. 2 new tests.
- 0085 installed: validate_intake_records now validates nested fyRecords structures — schedule lines (label/amount/page/quote), audited heads (known heads, non-negative), carried-forward losses, filed returns and earlier versions. typed-intake-sql.test.ts extended to 9 tests.
- derived-evidence.ts: calculated figures (GST payable per registration/month, posted depreciation) chain to every input with its own document/entry source; unsourced inputs are counted and shown. Audit 'Figure sources' gained a 'Calculated figures' section. 4 new tests.
- Full suite 1,713 tests pass; typecheck clean. No real records changed.
- P9: owner-chosen payment settlement order (oldest/largest/smallest first) on allocatePayments, supplierRecon and customerRecon; named invoices still settle first; saved as books.allocationOrder (cleanBooks passthrough) with a selector in Audit > Reconciliations. 3 new tests. Full suite 1,716 tests pass; typecheck clean; build OK.

## 2026-11-07 — role_permissions access scope + publish

- Critical RLS tautology on public.role_permissions (policy `USING (true)`) replaced by migration `0086_role_permission_scope.sql`: `USING (role = public.my_team_role() OR public.is_admin())`, helper SECURITY DEFINER. Live `pg_policy` read confirms the new expression.
- `src/lib/role-access.test.ts` +5 tests (19 pass): manager/finance/employee see only their own role's 8 switches, admin sees all 24, role-less non-admin sees none.
- Full suite: 1,721 tests / 223 files pass. Fresh `run_security_scan`: 0 critical, 4 warn + 1 info (shared reference tables job_state, market_quotes, regulatory_changes, regulatory_snapshots readable by any signed-in user or guest; guest sign-in note).
- Publish scheduled for https://ledgerline.biz (apex 200, www 302 at check time). Staged `guard_preference_approval` trigger NOT installed — awaits explicit owner go-ahead.

## 2026-11-07 (cont.) — security closure: internal reference tables + email endpoints

- Migration `0087_internal_reference_rls.sql` applied: job_state and regulatory_changes read policies now exclude anonymous guest sessions (`auth.jwt()->>'is_anonymous'`); regulatory_snapshots policy dropped and SELECT revoked from authenticated (no client reads it; service_role only). market_quotes intentionally left readable — public exchange closing prices, owner decision.
- `src/lib/internal-reference-rls.test.ts` (4 PGlite tests, applies the real 0087 file): real accounts read job status and rule changes; guests get zero rows; snapshots denied to all signed-in users; closing prices stay readable including guests.
- Accountant email hardening: send-time email re-validation in `resendReminder` and `sendLinkNow`; new per-recipient daily cap (DAILY_PER_RECIPIENT_LIMIT = 4) in `emailAllowance` alongside the existing 10/day total, 3 distinct addresses/day, 24h per-link resend cooldown, upload_link_events audit trail, 30-day link expiry and revocation. `src/lib/email-allowance.test.ts` extended to 5 tests.
- Security findings: all 5 warn-level findings marked fixed (4 above + 2 email endpoints); market_quotes finding ignored per owner decision; 1 info-level finding remains (guests share the authenticated access rules — inherent to the demo-workspace feature).
- Full suite: 224 files / 1,727 tests pass; typecheck clean. Test-count lineage confirmed: 1,716 → 1,721 was +5 role-permission scope tests (0086); 1,721 → 1,727 is +6 (4 internal-reference RLS + 2 email allowance). Each count corresponds to a successive code version; the latest complete suite passes.
- Publish confirmation: https://ledgerline.biz serves HTTP 200 with deployment id psr2.50993df8-... (checked 2026-11-07 08:28 UTC). That deployment was authorised by the owner ("Publish", 2026-11-07) and contains all code through migration 0086. The 0087 security tightening and email hardening are in the preview only and go live at the next owner-approved publish.
- Staged `guard_preference_approval` trigger: compatibility confirmed — the published client saves sensitive preferences only through the reviewed-save RPC (0080/0082), and the 12-test compatibility matrix proves every write path complies with the staged guard. The trigger is safe to install but remains NOT installed pending the owner's explicit activation approval.
