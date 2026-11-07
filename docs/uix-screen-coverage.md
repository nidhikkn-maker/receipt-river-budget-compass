# App-wide UIX coverage checkpoint

First pass NOT accepted. No family is complete until rendered checks pass.

| Route | Family | Existing presentation | Migration / acceptance |
|---|---|---|---|
| `account-reconciliation` | Review / reconciliation | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `allocation` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `assets` | Business | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `assistant` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `assistants` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `audit` | Business | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `brief` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `budgets` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `cards.$accountId` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `claim-submission` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `classification-rules` | Additional modules | Redirect / layout | Keep existing URL |
| `company-spending` | Business | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `connections` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `dashboard` | Today | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `drafts` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `entities` | Business | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `expenditure-statement` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `expenses` | Journal | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `family` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `forecast` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `forex-reconcile` | Additional modules | Redirect / layout | Keep existing URL |
| `gst-check` | Business | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `historical-import` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `inbox` | Review | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `new` | Smart Add / Canvas | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `offline-receipts` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `patterns` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `payment-methods` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `plan` | Planning | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `receivables` | Business | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `reconcile` | Additional modules | Redirect / layout | Keep existing URL |
| `records-check` | Review / reconciliation | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `reimbursement-settings` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `report-centre` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `report-status` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `reports` | Reports | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `review` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `route` | Additional modules | Redirect / layout | Shared system applied; family-specific acceptance pending |
| `rules` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `search` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `settings` | Settings | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `shared` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `statement-accounts` | Review / reconciliation | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `statement-crosscheck` | Additional modules | Redirect / layout | Keep existing URL |
| `statements` | Statements | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `strategy` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `sync-queue` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `tax` | Business | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `transaction-review` | Additional modules | Redirect / layout | Keep existing URL |
| `transfers` | Review / reconciliation | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `travel-inbox` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `trips.$tripId` | Travel | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `trips.index` | Travel | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `trips` | Travel | Redirect / layout | Shared system applied; family-specific acceptance pending |
| `upload-requests` | Additional modules | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `vault` | Documents | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |
| `wealth` | Money / Wealth | Mixed legacy forms, lists and surfaces | Shared system applied; family-specific acceptance pending |

## Verification boundaries
- Baseline signed-in read-only browser captures: /tmp/browser/uix-migration/baseline-*.png. Most were loading at 1.8 seconds and do not certify populated rendering.
- Prior screenshots: real components with synthetic adapters, not live user data.
- Release holds: no financial writes, policy changes, approval activation or publication.
- Next: family-specific layouts, source-first collapsed Canvas, live settled screen matrix, narrow/large phone, portrait/landscape tablet, desktop light/dark, navigation and financial regressions.
