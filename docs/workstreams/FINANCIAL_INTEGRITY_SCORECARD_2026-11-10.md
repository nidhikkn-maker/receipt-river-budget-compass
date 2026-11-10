# Financial-integrity scorecard (10 Nov 2026, integration `c3f9a7a`)

**How to read this.** Each control is graded on three separate levels: *Local* (tested here), *DB* (enforced by the database, not only the app) and *Hosted* (verified on Lovable Cloud).

**Hosted evidence: none.** Every "DB" mark refers to proposed SQL tested in isolated PGlite, not applied anywhere.

**Verification of `c3f9a7a`:** typecheck and build clean; 2,953 / 2,953 tests in 400 files, on 3 identical full runs. Independent tests were written by the coordinator, separately from the tracks.

| Control | Local | DB | Hosted | Evidence (tests) | Notes |
|---|---|---|---|---|---|
| Reversals keep the original; net zero in every reader | ✔ | P7 (proposed) | ✗ | `cross-module-consistency`, `phase3-coordinator-independent` | Hand-calculated figures |
| Loan principal/interest split | ✔ | — | ✗ | `cross-module-consistency` | ₹25,000 = ₹18,000 + ₹7,000 |
| Card bill payment is not an expense | ✔ | — | ✗ | `cross-module-consistency` | |
| Card display: statement due, outstanding and status kept separate; overdue only when unpaid | ✔ (Signature Flow branch) | — | ✗ | `card-payment-summary` (5 hand cases) | Minimum due is not stored in the data model |
| Part-paid claim outstanding, never counted as income | ✔ | — | ✗ | `cross-module-consistency` | ₹20,000 / ₹12,000 / ₹8,000 |
| Archived account or card stays in net worth until a real event | ✔ | — | ✗ | `net-worth-events` (mutation-checked) | P0-024: Home, assistant, Wealth report and Books page |
| Disposed asset leaves net worth; archived asset stays | ✔ | — | ✗ | `net-worth-events` | |
| Cash/accrual basis and period on every report | ✔ | — | ✗ | `cross-module-consistency` | |
| Statement import: one entry per line (repeat, overlap, retry, lost response, concurrency) | ✔ | P9 (proposed) | ✗ | `failure-injection` 20/20 ×3, `StatementInbox.duplicate-import`, `p9-coordinator-independent` | P0-025, P0-027. Without P9 the protection is app-only. RB-STM-01 is a known residual. |
| Failed read never registers a partial set | ✔ | n/a | ✗ | `StatementInbox.duplicate-import` | |
| Archive-controlled rows can't be deleted through the API | ✔ | P9 (proposed) | ✗ | `failure-injection` #5, `p9-coordinator-independent` (mutation-checked) | Without P9, only the interface prevents it |
| Archive history is append-only and can't be wiped | ✔ | P9 (proposed) | ✗ | `failure-injection` 6/6b | P0-028 fixed |
| Pending documents archived with a reason and recoverable; cleanup only after the bytes are saved | ✔ | P9 (proposed) | ✗ | `pending-documents`, `failure-injection` #6 | P0-026 |
| Posted entries immutable; deleting one creates a reversal | ✔ | P7 (proposed) | ✗ | `phase3-*`, `failure-injection` #5 (P7) | **Unposted expense delete is still permanent** where P7 is absent (RB-LED-01) |
| Duplicate bill override needs a reason with audit; confirmed duplicates blocked | ✔ (Signature Flow branch) | Server check on receipt reuse | ✗ | `duplicate-decision`, `smart-add-flow` | |
| Account not auto-assigned without printed evidence | ✔ (Signature Flow branch) | — | ✗ | `account-evidence` | |
| Backup restore remaps every stored identifier | ✔ | — | ✗ | `backup-registry-types`, `backup-restore` | B1d gap found and fixed |
| No browser pop-ups for financial actions | ✔ | — | ✗ | `no-browser-prompt.acceptance` (strict) | Period close/freeze needs typed confirmation |
| CI runs these tests on every integration push | ✗ | — | ✗ | — | RB-CI-01 |

**Summary:**
- **Local:** 18 of 19 controls have independent local evidence.
- **Database:** 6 controls depend on proposed SQL (P7/P9) that is not applied.
- **Hosted:** 0 verified.
- **Defects** found and fixed today: P0-024, P0-025, P0-026, P0-027, P0-028.
- **Residuals open:** RB-LED-01 and RB-STM-01.
