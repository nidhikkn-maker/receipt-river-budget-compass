# Frozen shared contracts for parallel workstreams (11 Nov 2026)

**Base:** `develop/sf-base`. **Owner:** the lead session (Track D).

A change to anything below needs a lead-approved contract change. Workstreams consume these contracts and never edit their files.

## 1. Shell and components (owner B1; read-only for everyone else)

- **`src/components/shell/PageHeader.tsx`:**
  - `PageHeader({ overline?, title, description?, actions?, crumbs? })`
  - `Breadcrumbs`
  - `ModuleRow({ to?, hash?, icon, title, detail, onClick? })`
- **`src/components/shell/SplitView.tsx`:** `SplitView({ label, items: SplitItem[], selectedId, onSelect, renderDetail, empty?, className? })`. This is the list/detail template for every index → detail screen.
- **`src/components/shell/States.tsx`:** `LoadingState`, `EmptyState`, `ErrorState({ what, onRetry? })`, `OfflineState`, `UnauthorizedState`, `StaleState`, `UnsavedDraftState`, `ProposedBadge`.
  - **Every screen renders loading, empty, error (with Retry), offline and unauthorised states.** A failed read never looks like empty data (P0-004).
  - **Denied reads (R14):** `useReadState(...areas)` from `src/lib/store.tsx` returns `'denied'` (render `UnauthorizedState`), `'failed'` (render `ErrorState` with Retry) or `'ok'`; the store also exposes `deniedAreas` and `loadErrorKind(area)`. Denied areas stay in `loadErrors`, so existing `loadFailed` checks still never show them as empty.
- **Dialogs:**
  - `src/components/ConfirmDialog.tsx`: destructive, approval and typed confirmation.
  - `src/components/ValueDialog.tsx`: single-value edits.
  - Never use `window.prompt` or `window.confirm`; the acceptance test is strict.
- **`src/components/DateField.tsx`:** dates display as "09 Nov 2026" and are stored as ISO.
- **Styling:**
  - Use Tailwind classes with semantic tokens only.
  - **Do not edit `src/styles.css`, `src/lib/themes.ts`, `src/components/shell/**` or `src/components/ui/**`.**
  - Need a token or shell change? Ask the lead.
- **Money display:** use the `financial-amount` class with tabular numerals, and `₹` with Indian grouping via the existing formatters (`money`, `wholeRupees`). Never format money by hand.

## 2. Routing and navigation (owner B1)

- **Navigation sections** (`src/components/shell/navigation.ts`): home, money, tasks, records, reports, calendar, notifications, add, settings, search.
- **Travel sits under Records** (KK decision). Pass 2 updates `navigation.ts` and owns that file.
- **New detail routes:**
  - Use a file route under `src/routes/_authenticated/` with a typed `$id` param or validated search params.
  - Breadcrumbs and Back come from `breadcrumbs()` / `backTarget()`.
  - Deep links must load directly, without a prior screen.
- **Retired URLs** redirect in `beforeLoad`, so old links keep working.
- **`src/routeTree.gen.ts` is generated.** Regenerate it with `bun run build` and never hand-edit it. The lead resolves its merge conflicts by regenerating.

## 3. Ledger and money (owner A1; read-only for everyone else)

- **Every figure comes from the ledger readers:** `ledgerView` / `txnFromRow` / `accountBalance` / `cashflow` / `netWorth` / `accountValue` (`src/lib/ledger.ts`), `position()` (`src/lib/position.ts`), `computeNetWorth` (`src/components/books/useBooks.ts`), and `cardCycle` / `card-payment-summary` for cards.
- **Never** re-sum raw `expenses` rows, re-implement balances, or include reversal history twice.
- Reports state their basis: `CASH_BASIS_LINE` on personal reports, accrual basis on company working statements.
- **Archived records stay in totals until a real event** (P0-024). Withdrawn records are excluded through `ledgerView` only (P10, published on develop/sf-base c616803); every figure must include a test that a withdrawn entry is excluded.
- **Saves go through the store** (`src/lib/store.tsx`) and server functions. No new direct table writes without the lead's review.

## 4. Archive, withdraw and reversal (owner A1)

- **Non-ledger records** (loans, goals, commitments, valuations, documents, preference-backed records): archive with a reason and Restore. Use `src/lib/archive.ts`, `src/lib/records-archive.ts` and `ArchivedRecords` / `TableArchiveButton` / `ArchiveDialog`.
- **Unposted financial entries:** Withdraw with a reason, keeping evidence and history; restorable. **Published on develop/sf-base c616803:** call `removeEntry` (`src/lib/entry-removal.ts`; posted → reversal, unposted → withdraw) or `setEntryWithdrawal` (`src/lib/withdrawal.functions.ts`); never write `receipt_details.withdrawal` yourself. Read withdrawn state only through `withdrawalOfRow` / `withdrawnAtOfRow` (`src/lib/withdrawal.ts`).
- **Asset disposal:** `docs/workstreams/contracts/disposal-approval.md` and `src/lib/asset-disposal.functions.ts` (request → authorised approval → posted result). Archive never disposes (P0-015).
- **Team change requests:** `docs/workstreams/contracts/entry-change-requests.md` (P0-022).
- **Posted or reconciled entries:** reversal and correction workflows only (P7). This is enforced on the server.
- **No hard delete of a financial record.** P9/P10 guards enforce it in the database.

## 5. Tests and evidence for a screen to be handed off

- Navigation, deep link and Back.
- Data relationships, with figures checked against hand-calculated fixtures where money is shown.
- All required states.
- Accessibility basics: labels, focus, 44 px targets.
- Captures at iPhone 15, iPad Pro 11 and 1440×900 using fixture data (`scripts/dev/local-preview.cjs` or a scripts/browser capture harness).
- A screen counts as **verified only when the lead has re-run it independently and KK has accepted it**.

## 6. Branches

- Each workstream gets `ws/<id>-<name>` from `develop/sf-base`, and pushes to GitLab only.
- The lead merges workstream branches into `develop/sf-base` after review and verification.
- `integration/phase2-3-p0` receives the shell only after KK's Signature Flow approval.
