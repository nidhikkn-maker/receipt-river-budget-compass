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
- Startup speed: the protected layout gates on the local session (server still verifies every request) and the store paints the encrypted device snapshot before refreshing from the cloud.
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
- Money movements (reimbursements, scheduled payments, loan creation/repayment, card EMI conversions, claim receipts, yearly-bill confirmation) use the owner-scoped finance_operation database transaction with serialized idempotency records so retries cannot partially save; category allocation totals are validated on database writes.
- ZIP backups include private receipt/document binaries and remap all owner-linked identifiers on cross-account restore; financial reporting and chart calculations remain browser-side pure functions.
- Backup restore stages files at fresh owner paths and commits records through an RLS-scoped database transaction; failed restores clean staged files without overwriting existing records.
- AI calls enforce saved owner privacy; assistant facts come from authenticated server reads, and record text/history stay untrusted user data, never system instructions.
- Receipt and voice categories resolve against the active owner catalog server-side; scanned statement extraction also enforces saved document privacy and requires explicit review.
- Shortcut search parameters create validated drafts only; they never save entries or call AI automatically.
- Device push uses the generated production worker, allowlisted HTTPS push services, server-derived VAPID keys from a stored signing seed and owner-scoped subscriptions; cron authentication and per-device daily claims prevent public dispatch and duplicate reminders, and lock-screen messages contain no financial details.
- External assistants connect through the app's MCP server (src/lib/mcp/, OAuth via managed auth, consent at /.lovable/oauth/consent); tools are read-only and query with the caller's token so RLS limits them to the user's own records, and writes stay in the app so currency conversion remains server-side.
- Department limits are readable only within the caller's department or by verified Finance users; role records are self-readable only, with permission checks handled by the protected database helper.
- tsyringe (via SimpleWebAuthn/@peculiar/x509) is patched in patches/ to inline a Reflect metadata polyfill; the edge bundle cannot guarantee a separate polyfill import runs first, and without it every published request returns 500.
- Family members get their own sign-in only through owner email invites accepted by a verified matching account; requests, decisions and evidence access are enforced by RLS and security-definer functions, and approval never creates a transaction.
- Workspace splits stay on entries; travel plans live in preferences. Booking imports retain private vault originals and create reviewed drafts, never payments. Home shortcut order lives in owner preferences and opens existing flows.
- The V4.3 theme system keeps one component tree: src/lib/themes.ts is the catalog (5 families / 7 styles) and src/styles.css holds per-theme token blocks under html[data-theme="..."] with dedicated .dark variants; Signature is the default :root. New UI must use semantic tokens only so every theme stays correct, and theme changes never touch financial data.
- Async feedback is shared: Button `loading`/auto single-flight for promise-returning onClick, ProcessingPanel for real stages only, createLatest() to drop stale responses; new-entry saves reuse one draft id so retries stay idempotent.
- Expense drafts live in owner-RLS expense_drafts (src/lib/drafts.ts) with receipts under the owner receipts prefix; drafts never enter the ledger, share their id with the eventual transaction so a repeated Save is idempotent, and are marked saved (files removed) after the real save. Every draft edit is first written to an encrypted owner-bound device copy (offline.ts snapshots store) and synced on start-up/online with newer-copy-wins, so offline edits survive closing the app.
- Claims reuse ledger rules; profiles/shares use owner preferences, preparations use revision-checked Cloud rows plus encrypted device copies, and discovery confirms audited existing-entry links. PDFs never submit/pay claims; older exports stay unchanged.
- Master-record rules (duplicates, organisation usage/rename) live in src/lib/master-data.ts and setup readiness in src/lib/setup-status.ts; every add-account path uses the shared AccountForm so contextual and central creation follow one rule set.
- Report IDs match jobs; callbacks recover without duplicates. Reconciliation persistence tests use temporary PGlite, not Cloud or real devices.
- Corrections use owner-atomic RPCs, revisions and safe undo; preserve FX/source. Evidence drives statements; review-centre.ts separates Inbox, review and reconciliation.
- Review returns (review-navigation.ts) happen only after a save or explicit completion; use-review-view.ts keeps UI context in tab memory; calendar badges come from saved evidence, not navigation.
- Statement Desk (/statements, statement-pipeline/) is the main upload path; Inbox's StatementInbox view stays for single-batch review and /reconcile redirects to it.
- Browser tests use real routes with isolated data and blocked external writes, including Inbox approval/retry/Undo; fixtures never certify Cloud saves.
- Device MPIN (src/lib/mpin.ts) is a device-only quick unlock: salted PBKDF2 hash per owner in local storage, erased after five wrong tries; it only opens an existing session, never signs in.
- Visitor demo: /auth starts a guest session and the start_demo_workspace function seeds owner-scoped sample rows (email is only a display label in demo_sessions); requireRealAccount blocks guests from AI/push/import server functions, and an hourly cron route deletes demos older than 24h — keeps costs bounded and real identities unclaimed.
- Navigation feel: router preloads on intent with a short pending threshold; NavProgress (in AppShell) shows the page-change bar, warms main pages when idle and drops repeat taps on a link already opening — so taps always give feedback without double navigation.

- Accountant upload links are HMAC-signed link ids (src/lib/upload-link.ts), verified in /api/public/upload/$token with atomic slot claims; uploads land in the private statement-uploads bucket and only enter the ledger through the normal Statement Desk flow.
