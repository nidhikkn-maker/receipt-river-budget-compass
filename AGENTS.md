<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Subdirectories have their own AGENTS.md (src/lib holds finance-rule notes); read it before changing files there.
- New visitors sign in at /auth; existing anonymous identities may upgrade by email to preserve owner-scoped records, and offline access never creates a new identity.
- Data lives in Lovable Cloud; src/lib/store.tsx is the single client data layer for pages under src/routes/_authenticated.
- Data deletion uses an in-app typed confirmation, authenticated owner-scoped atomic record cleanup, then paginated owner-prefix storage and offline cleanup; failures stay visible and files survive failed record deletion.
- Bulk category changes and undo use owner-checked atomic RPCs with persistent before/split snapshots and revision checks; later edits block restoration rather than being overwritten. Bill duplicate checks compare original currency amounts, merchant and date and require explicit override before saving.
- Department exports use saved department fields and RLS-visible limits, not personal category budgets; reimbursement payment exports use actual ledger receipts, and PDFs are prepared before a separate user-activated download.
- Owner-scoped finance_preferences holds category and grouped-tag catalogs, scoped budgets and display preferences; category moves use an RLS-protected database function to update ledger and budget references together.
- Offline entries and snapshots use owner-keyed IndexedDB encrypted with non-exportable AES-GCM device keys and owner-bound authenticated data; stable entry UUIDs make synchronization idempotent and currency conversion stays server-side.
- Passkey device unlock uses SimpleWebAuthn with one-use expiring server challenges, required user verification and stored counters; it supplements account sign-in rather than replacing it.
- Face ID on /auth requires a server-validated existing account session; successful unlock hands off once in memory to DeviceLock for thirty seconds, never creating or replacing authentication tokens.
- Device-lock password fallback verifies the current owner with a non-persistent isolated auth client and local-only cleanup, so verification never switches the app session or signs out other devices.
- Offline app registration is centralized in src/lib/pwa.ts and refused in development and preview; vite-plugin-pwa generates the production worker with network-first navigation and no OAuth caching.
- The root Outlet is hydration-gated with ClientOnly to avoid a TanStack match race when protected client-only routes redirect to public sign-in.
- Reimbursements, scheduled payments, loan creation/repayment and card EMI conversions use the owner-scoped finance_operation database transaction with serialized idempotency records so retries cannot partially save money movements.
- ZIP backups include private receipt/document binaries and remap all owner-linked identifiers on cross-account restore; financial reporting and chart calculations remain browser-side pure functions.
- Backup restore stages files at fresh owner paths and commits records through an RLS-scoped database transaction; failed restores clean staged files without overwriting existing records.
- AI privacy switches are checked against saved owner preferences on the server before any provider call, not merely hidden in the interface.
- Receipt and voice categories resolve against the active owner catalog server-side; scanned statement extraction also enforces saved document privacy and requires explicit review.
- Shortcut search parameters create validated drafts only; they never save entries or call AI automatically.
- Statement transfer matching requires a selected account and its debit/credit side; competing near-equal matches remain manual to prevent arbitrary reconciliation.
- Excel statements use a dynamically loaded BIFF-capable SheetJS reader and real workbook fixtures so legacy XLS and XLSX share review rules.
- Mutual fund NAVs are authenticated server-fetched daily quotes; reviewed units create dated valuation snapshots, never income or expense entries, so net worth reuses the ledger engine.
- Device push uses the generated production worker, allowlisted HTTPS push services, server-derived VAPID keys from a stored signing seed and owner-scoped subscriptions; cron authentication and per-device daily claims prevent public dispatch and duplicate reminders, and lock-screen messages contain no financial details.
- Category allocation totals are validated on database writes; partial and full claim receipts and yearly-bill confirmation use finance_operation so retries cannot leave ledger and tracker records out of sync.
- External assistants connect through the app's MCP server (src/lib/mcp/, OAuth via managed auth, consent at /.lovable/oauth/consent); tools are read-only and query with the caller's token so RLS limits them to the user's own records, and writes stay in the app so currency conversion remains server-side.
- Department limits are readable only within the caller's department or by verified Finance users; role records are self-readable only, with permission checks handled by the protected database helper.
- tsyringe (via SimpleWebAuthn/@peculiar/x509) is patched in patches/ to inline a Reflect metadata polyfill; the edge bundle cannot guarantee a separate polyfill import runs first, and without it every published request returns 500.
- Family members get their own sign-in only through owner email invites accepted by a verified matching account; requests, decisions and evidence access are enforced by RLS and security-definer functions, and approval never creates a transaction.
- Workspace splits store original-currency shares on the entry itself (never extra entries); travel bookings, itinerary and advances live on trips in preferences, so only paid ledger entries change balances.
- Booking reminders and calendar events derive from owner-visible trips and linked payments through src/lib/travel-calendar.ts; shared rules keep partially paid amounts consistent without creating transactions.
