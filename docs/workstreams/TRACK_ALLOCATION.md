# Track allocation and ownership boundaries (from baseline `a8a84b3`)

**Rule:** a file is owned by exactly one track. Another track that needs a change there asks Track D, which sequences it. Shared files are changed only by Track D at integration.

## Track A — Accounting and financial integrity
- **Branch:** `phase3/completion`
- **Worktree:** `/home/user/thapal-p3c`
- **Batch A1 (in progress):** KK's Phase 3 decisions 1–6 and the remaining items 1–9:
  - reversals keep the original;
  - corrections in open periods, plus a prior-period adjustment workflow;
  - personal period protection;
  - reimbursement types;
  - posting-permission hook;
  - Statement Undo by reversal;
  - linked-record states;
  - card payment (P0-005b);
  - depreciation postings;
  - client functions for the screens;
  - the independent reconciliation model.
- **Batch A2:** Phase 3 screens (journal, reversal, conversion approval, personal/company, reimbursements, depreciation, Statement Desk Undo) with iPhone, iPad and desktop captures. These are built on the current shell. They move to the Signature Flow shell once Track B's shell is approved.
- **Owns:**
  - `.lovable/staged-sql/proposed/P7*` and new `P8*`;
  - `src/lib/posting.ts`, `src/lib/store.tsx` (ledger/remove/save paths), `src/lib/fx.functions.ts`;
  - `src/lib/statement-pipeline/**`, `src/routes/_authenticated/statements.tsx`;
  - `src/components/ExpenseDialog.tsx`, `src/components/DuplicateCompare.tsx`, `src/components/WealthPanels.tsx` (card payment);
  - `src/lib/books/assets-ledger.ts`, `src/routes/api/public/jobs/monthly-depreciation.ts`;
  - `src/lib/phase3-*.test.ts`, `src/test/phase3-fixture.ts`.

## Track B — Signature Flow UIX
- **Branch:** `uix/signature-shell`
- **Worktree:** `/home/user/thapal-uixb`
- **Batch B1:** the design system and app shell, **proposed for KK visual approval before extension** (Signature Flow master §19.3):
  - tokens and typography (forest green per §3.2);
  - the T mark slot (final artwork pending);
  - navigation: Home, Money, To-do, Records, Reports + Add (desktop rail; iPhone bottom bar with central Add);
  - shell routes `/home`, `/money`, `/tasks`, `/records`, `/calendar`, `/notifications`, `/add`, with today's URLs kept by redirect;
  - a list/detail split template, a states kit, breadcrumbs and Back, the workspace switcher slot, the search palette;
  - Home rebuilt to match the approved captures on real data.
- **Delivery:** behind a reversible theme/shell switch, so the current UI remains available until KK approves. Captures at iPhone, iPad and desktop, side by side with the approved images.
- **Owns:**
  - `src/styles.css`, `src/lib/themes.ts`;
  - `src/components/AppShell.tsx`, `src/components/ThapalLogo.tsx`, new `src/components/shell/**`;
  - new shell route files, `src/routes/_authenticated/dashboard.tsx`;
  - `src/components/ui/**` (token-level only).

## Track C — Module connections
- **Branch:** `modules/connections`
- **Worktree:** `/home/user/thapal-modc`
- **Batch C1 (P0):** P0-007..P0-016, financial records deleted through the UI → archive. KK's P0-001 requirement 8 already approves "the same preservation principles to properties, investments and other financially significant records". For each:
  - reproduce first, then fix;
  - use the shared `src/lib/archive.ts` and `ArchiveDialog`;
  - regression tests.
  - Records: receivables, loans, GST invoices, tax deductions and credits, entities, vault documents, scheduled payments and goals, valuations and lender evidence, allocation plans, milestones, itinerary items.
  - **P0-015** (disposal authorisation) goes to Track A.
- **Batch C2 (P1, no external dependency):**
  - K10 release/version information;
  - B05 notification centre;
  - B04 calendar item detail;
  - C03 bank account detail (read-only);
  - the remaining P0-004 sweep items (TaxCentre regulatory changes, market quotes, the drafts report, `new.tsx` drafts, StatementInbox).
  
  Built as data and logic plus screens on today's look; Track B restyles them later.
- **Owns:**
  - `src/routes/_authenticated/{receivables,entities,vault,plan,allocation,strategy,tax}.tsx`;
  - `src/components/{TaxCentre,AccountTools,LoanBalanceReview,TripSections}.tsx`, `src/components/books/{MarketPanel}` (archive only);
  - new routes and components for K10/B05/B04/C03.
  - **Must not touch** Track A or Track B files. If `store.tsx` needs a new method, add it in a new file (e.g. `src/lib/records-archive.ts`) and ask Track D to wire it.

## Track D — Integration, security and QA (coordinator)
- **Branch:** `integration/phase2-3-p0`
- **Worktrees:** `/home/user/thapal-integration`, plus the throwaway check worktree `/home/user/thapal-int-check`.
- **Responsibilities:**
  - review each finished branch;
  - write independent tests;
  - merge in a fixed order (A, then C, then B);
  - after each merge: typecheck, build, three full runs and the whole-stack SQL check;
  - maintain `PROGRESS_DASHBOARD.md`, the registers and the blockers;
  - security review (step-up, RLS, assistant limits) of every new database function.

## Sequencing
- **Database changes:** only Track A writes SQL (P7/P8). Track C's archive work is JSON-level app logic plus tests, with any guard SQL proposed through Track A. This keeps database changes single-file and serial.
- **Merge order:** A1 → C1 → B1 (B1 only after KK's visual approval) → C2 → A2.
