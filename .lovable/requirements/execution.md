# Consolidated execution ledger

## Source of truth
- Original documents are preserved byte-for-byte in `.lovable/specifications/v6.0.md` and `v6.1.md`, with SHA-256 fingerprints in `register.json`.
- `register.json` accounts for every nonblank source clause (899, including contextual headings). These are **not** final unique functional requirement counts.
- Two independent original-document audits have returned; neither certifies an exhaustive atomic acceptance register. Their findings are retained in `audit-2026-11-06.md`. No implementation-only claim is counted as verified completion.
- Latest master instruction authorises ordinary implementation, not production deletion, filing, paid services or publication.

## Current implementation
- Return draft registry now appears in Tax Centre exports; removed unsupported claims of official GST format validation.
- Database register safeguard applied and confirmed present: leases, company tax-year profiles, asset financial facts, period definitions and historical logs. Physical checks remain editable. Ten isolated PostgreSQL tests pass; no production financial records changed.
- Close/reopen now writes owner-scoped database-generated evidence with SHA-256 ledger/register revisions, source documents, approval history and rule versions. Audit downloads and shows retained snapshots; seven disposable PostgreSQL tests and isolated close/download/reload/reopen browser checks pass. Legacy closures without evidence are explicitly labelled.
- Intake commits are owner-serialized, revision-checked and replay-protected with atomic evidence locking; seven disposable PostgreSQL tests pass. All preference updates advance the shared revision. The exact approved request/payload/revision now persists in the document run before committing; isolated Statement Desk lost-response/reload/retry check passed with one save. Typed server proposal validation remains partial.
- Portfolio signed flows now count contribution/redemption transfers across the portfolio boundary, exclude internal moves/counterparts, feed snapshots and movement alerts, and include Demat allocation. Actual stored price-fetch timestamps replace invented evening times. Eight flow/alert tests and a timestamp regression pass.
- Next executable requirements: close-operation bypass hardening and source correction/durable typed intake recovery, company document access, broker cash/ownership/loan evidence and remaining acceptance.

## External dependencies
- Licensed intraday feed choice and credentials (deferred by owner).
- Final official ITR schema adoption (deferred by owner).
- GLS sanction/disbursal evidence (not supplied).
- Physical iPhone/iPad and isolated hosted write acceptance (not available here).
- Consequential production publication requires explicit approval.

## Verification
- Full suite: 200 test files, 1,567 tests passed on 6 November 2026. Preview compilation log reports build OK. The original source register now records partial status and concrete evidence for close evidence, recovery, timestamps, performance and allocations.
- Alternate period-write authority prototype: 3 disposable PostgreSQL tests pass, but `.lovable/period-authority.sql` is deliberately not applied until backup restore can preserve closing evidence without forging new closure snapshots. This is an internal dependency, not an external block.
- Isolated signed-in browser check passed: company tax profile edited from 60% to 75% and survived reload; accountant ZIP downloaded with PDF and three CSVs using the edited assumptions. Screenshots inspected. Production writes were intercepted, so this does not certify Cloud persistence.
- Controlled browser evidence never certifies hosted saves or real-device behaviour.