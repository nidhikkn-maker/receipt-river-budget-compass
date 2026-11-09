# Thapal (formerly Ledgerline) — Developer Handover

## Architecture
- TanStack Start (React 19, Vite) on edge workers; Lovable Cloud (Postgres, auth, storage) backend.
- Client data layer: `src/lib/store.tsx`. Pages: `src/routes/_authenticated/*`. Sign-in: `/auth`.
- Pure, tested rule modules: `expenses.ts`, `ledger.ts`, `planning.ts`, `position.ts`, `insights.ts`, `portfolio.ts`, `projection.ts`, `statement-auto.ts`, `reports.ts`.
- Server functions: currency conversion (`fx.functions.ts`), receipt/document/statement AI extraction, assistant, mutual fund NAV, push.

## Data & security
- Every table is owner-scoped with row-level security; receipts/documents in private storage.
- Money movements (reimbursements, loans, EMIs) and backup restores run as single database transactions with idempotency.
- AI privacy switches are enforced server-side; the assistant only explains pre-computed figures (incl. labelled hypothetical debt what-ifs).
- Offline entries encrypted on-device (AES-GCM); passkeys via WebAuthn supplement sign-in.

## Testing
- `bunx vitest run` — unit tests for every financial rule. `bunx tsgo --noEmit` — typecheck.
- Manual on device after publishing: Face ID unlock, installed-app offline start, push reminders.

## Integration feasibility
- Bank feeds: needs an Account Aggregator (India) partner, consent flow and licensing — not built.
- Siri, widgets, share sheet: need a native iOS wrapper (e.g. Capacitor); web offers Shortcut quick-add links.

## Running-cost assumptions (indicative)
- Hosting + database: within Lovable Cloud plan usage for a single family.
- AI: per receipt/document/statement scan and assistant question; low volume for personal use.
- Currency rates (Frankfurter/ECB) and NAVs (public feed): free.
