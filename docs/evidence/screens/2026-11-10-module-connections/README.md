# Track C — module connections (C1 archive instead of delete, C2 new screens)

Chromium device emulation (Playwright `devices['iPhone 15']`, `devices['iPad Pro 11']`, and a 1440×900 desktop viewport) against a fixture dev server from the `modules/connections` worktree on port 8084. Every Supabase call was answered locally by `scripts/browser/capture_module_connections.cjs` (host `fixture.supabase.invalid`), so nothing reached a hosted service. Fixture data only. JPEG, at most 720 px wide.

These show the **current look**; the Signature Flow restyle is pending Track B. They are not real-device checks.

Re-run: `PHASE=before|after|c2 OUT=<dir> BASE=http://127.0.0.1:8084 NODE_PATH=$(npm root -g) node scripts/browser/capture_module_connections.cjs`. `before` was taken with the fixes stashed (routes as at 6e532f5).

## Reproduction evidence (`repro/`)

- `*.repro.test.tsx.before.txt`: the repro tests as first written, asserting the defective behaviour on 6e532f5 code.
- `repro-run-before-fix.txt`: their run (15/15 passing = every defect reproduced).
- `p0-004-rules-register-before-fix.txt`: the regulatory-changes load-error test failing on 6e532f5 code (error swallowed).
- The same files in `src/components/records-archive/` are now regression tests of the fixed behaviour.

## C1 before (unfixed)

| File | What it shows |
|---|---|
| `iphone-before-01-receivables-one-tap-remove.jpg` | Receivables: one-tap Remove beside each invoice (no confirmation, reason or record) |
| `iphone-before-02-receivables-after-remove.jpg` | After one tap: Kaveri Foods invoice is gone from storage; no archive, no history |
| `iphone-before-03-entities-delete.jpg` | Companies & years: Delete beside Edit |
| `iphone-before-04-entities-generic-confirm.jpg` | Generic 'Delete this profile?' — no reason; profile, tax years and account links are dropped |
| `iphone-before-05-vault-delete-icon.jpg` | DocuRepo: bin icon deletes the document row and its file |
| `iphone-before-06-vault-generic-confirm.jpg` | Generic 'Delete … and its file?' confirmation, no reason |
| `iphone-before-07-plan-delete-icon.jpg` | Plan: bin icon on a scheduled payment hard-deletes it in one tap |
| `ipad-before-01-receivables-one-tap-remove.jpg` | Receivables: one-tap Remove beside each invoice (no confirmation, reason or record) |
| `ipad-before-02-receivables-after-remove.jpg` | After one tap: Kaveri Foods invoice is gone from storage; no archive, no history |
| `ipad-before-03-entities-delete.jpg` | Companies & years: Delete beside Edit |
| `ipad-before-04-entities-generic-confirm.jpg` | Generic 'Delete this profile?' — no reason; profile, tax years and account links are dropped |
| `ipad-before-05-vault-delete-icon.jpg` | DocuRepo: bin icon deletes the document row and its file |
| `ipad-before-06-vault-generic-confirm.jpg` | Generic 'Delete … and its file?' confirmation, no reason |
| `ipad-before-07-plan-delete-icon.jpg` | Plan: bin icon on a scheduled payment hard-deletes it in one tap |
| `desktop-before-01-receivables-one-tap-remove.jpg` | Receivables: one-tap Remove beside each invoice (no confirmation, reason or record) |
| `desktop-before-02-receivables-after-remove.jpg` | After one tap: Kaveri Foods invoice is gone from storage; no archive, no history |
| `desktop-before-03-entities-delete.jpg` | Companies & years: Delete beside Edit |
| `desktop-before-04-entities-generic-confirm.jpg` | Generic 'Delete this profile?' — no reason; profile, tax years and account links are dropped |
| `desktop-before-05-vault-delete-icon.jpg` | DocuRepo: bin icon deletes the document row and its file |
| `desktop-before-06-vault-generic-confirm.jpg` | Generic 'Delete … and its file?' confirmation, no reason |
| `desktop-before-07-plan-delete-icon.jpg` | Plan: bin icon on a scheduled payment hard-deletes it in one tap |

## C1 after (archive, confirm with reason, archived list, restore)

| File | What it shows |
|---|---|
| `iphone-after-01-receivables-archive.jpg` | Receivables: Archive instead of Remove; totals include archived |
| `iphone-after-02-receivables-archive-confirm.jpg` | Archive confirmation with a required reason |
| `iphone-after-03-receivables-archived-view.jpg` | Archived invoices: who, when, why, history and Restore; figures unchanged |
| `iphone-after-04-entities-archive.jpg` | Companies & years: Archive replaces Delete; tax years and links are kept |
| `iphone-after-05-entities-archive-confirm.jpg` | Archive profile confirmation with a required reason |
| `iphone-after-06-entities-archived-view.jpg` | Archived profiles with tax years kept and Restore |
| `iphone-after-07-vault-archive.jpg` | DocuRepo: Archive instead of the bin icon; file and links are kept |
| `iphone-after-08-vault-archive-confirm.jpg` | Archive document confirmation with a required reason |
| `iphone-after-09-vault-archived-view.jpg` | Archived documents with who/when/why and Restore |
| `iphone-after-10-plan-archive.jpg` | Plan: Archive on a cancelled payment only; an active one shows Cancel first |
| `iphone-after-11-plan-archive-confirm.jpg` | Archive scheduled payment confirmation |
| `iphone-after-12-plan-archived-view.jpg` | Archived scheduled payments with Restore |
| `ipad-after-01-receivables-archive.jpg` | Receivables: Archive instead of Remove; totals include archived |
| `ipad-after-02-receivables-archive-confirm.jpg` | Archive confirmation with a required reason |
| `ipad-after-03-receivables-archived-view.jpg` | Archived invoices: who, when, why, history and Restore; figures unchanged |
| `ipad-after-04-entities-archive.jpg` | Companies & years: Archive replaces Delete; tax years and links are kept |
| `ipad-after-05-entities-archive-confirm.jpg` | Archive profile confirmation with a required reason |
| `ipad-after-06-entities-archived-view.jpg` | Archived profiles with tax years kept and Restore |
| `ipad-after-07-vault-archive.jpg` | DocuRepo: Archive instead of the bin icon; file and links are kept |
| `ipad-after-08-vault-archive-confirm.jpg` | Archive document confirmation with a required reason |
| `ipad-after-09-vault-archived-view.jpg` | Archived documents with who/when/why and Restore |
| `ipad-after-10-plan-archive.jpg` | Plan: Archive on a cancelled payment only; an active one shows Cancel first |
| `ipad-after-11-plan-archive-confirm.jpg` | Archive scheduled payment confirmation |
| `ipad-after-12-plan-archived-view.jpg` | Archived scheduled payments with Restore |
| `desktop-after-01-receivables-archive.jpg` | Receivables: Archive instead of Remove; totals include archived |
| `desktop-after-02-receivables-archive-confirm.jpg` | Archive confirmation with a required reason |
| `desktop-after-03-receivables-archived-view.jpg` | Archived invoices: who, when, why, history and Restore; figures unchanged |
| `desktop-after-04-entities-archive.jpg` | Companies & years: Archive replaces Delete; tax years and links are kept |
| `desktop-after-05-entities-archive-confirm.jpg` | Archive profile confirmation with a required reason |
| `desktop-after-06-entities-archived-view.jpg` | Archived profiles with tax years kept and Restore |
| `desktop-after-07-vault-archive.jpg` | DocuRepo: Archive instead of the bin icon; file and links are kept |
| `desktop-after-08-vault-archive-confirm.jpg` | Archive document confirmation with a required reason |
| `desktop-after-09-vault-archived-view.jpg` | Archived documents with who/when/why and Restore |
| `desktop-after-10-plan-archive.jpg` | Plan: Archive on a cancelled payment only; an active one shows Cancel first |
| `desktop-after-11-plan-archive-confirm.jpg` | Archive scheduled payment confirmation |
| `desktop-after-12-plan-archived-view.jpg` | Archived scheduled payments with Restore |

## C2 screens (after)

| File | What it shows |
|---|---|
| `iphone-c2-01-about.jpg` | K10 Settings → About: version, build, environment, service health, known limitations |
| `iphone-c2-02-notifications.jpg` | B05 Notification centre: grouped alerts from real sources, read/unread, mark all read |
| `iphone-c2-03-calendar-item.jpg` | B04 Calendar item detail: owner, source link, reminder schedule, recurrence, snooze |
| `iphone-c2-04-bank-account.jpg` | C03 Bank account detail (read-only): masked number, institution, owner entity, freshness, running balance |
| `iphone-c2-05-bank-account-transactions.jpg` | C03 recent transactions with running balance and reconciliation status |
| `ipad-c2-01-about.jpg` | K10 Settings → About: version, build, environment, service health, known limitations |
| `ipad-c2-02-notifications.jpg` | B05 Notification centre: grouped alerts from real sources, read/unread, mark all read |
| `ipad-c2-03-calendar-item.jpg` | B04 Calendar item detail: owner, source link, reminder schedule, recurrence, snooze |
| `ipad-c2-04-bank-account.jpg` | C03 Bank account detail (read-only): masked number, institution, owner entity, freshness, running balance |
| `ipad-c2-05-bank-account-transactions.jpg` | C03 recent transactions with running balance and reconciliation status |
| `desktop-c2-01-about.jpg` | K10 Settings → About: version, build, environment, service health, known limitations |
| `desktop-c2-02-notifications.jpg` | B05 Notification centre: grouped alerts from real sources, read/unread, mark all read |
| `desktop-c2-03-calendar-item.jpg` | B04 Calendar item detail: owner, source link, reminder schedule, recurrence, snooze |
| `desktop-c2-04-bank-account.jpg` | C03 Bank account detail (read-only): masked number, institution, owner entity, freshness, running balance |
| `desktop-c2-05-bank-account-transactions.jpg` | C03 recent transactions with running balance and reconciliation status |
