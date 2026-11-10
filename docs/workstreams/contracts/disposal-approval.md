# Contract: asset disposal approval (P0-015) — for the I05 screen (WS-E)

Addendum to docs/workstreams/CONTRACTS_2026-11-11.md §4. Owner: Track A (financial integrity). Consumer: WS-E (I05 disposal screen). Status: proposed — the database side is `.lovable/staged-sql/proposed/P14_asset_disposal_approval.sql` (+ rollback), not applied to Cloud. Track A does not edit `assets.tsx` or `AssetLifecycle`; WS-E builds the screen against this contract.

KK decision (binding): "Asset disposal requires owner or explicitly authorised financial approval, with source evidence, reason, disposal date, proceeds, accounting entries and audit trail. Archiving never constitutes disposal."

## Server functions (`src/lib/asset-disposal.functions.ts`)
All return `{ ok: true, ... }` or `{ ok: false, error }` where `error` is already plain language (`disposalProblem`).

### `requestAssetDisposal({ data })`
| Field | Type | Rule |
|---|---|---|
| `assetId` | string | an asset in the caller's register (owner-local id), not already disposed |
| `method` | `"sale" \| "scrap" \| "write_off" \| "donation" \| "lost"` | |
| `date` | `YYYY-MM-DD` | on or after the asset's put-to-use date; not in a closed period |
| `proceeds` | number ≥ 0 | a sale needs proceeds > 0 |
| `proceedsEntryId` | uuid \| null | optional link to the bank receipt entry the owner already recorded (proceeds are that entry; the disposal entry is non-cash) |
| `evidence` | uuid[] (1–20) | the owner's documents (sale invoice, scrap note, write-off approval); upload with the existing document flow first |
| `reason` | string, 5–500 | |

Returns `{ requestId, entryId, plan: { bookValue, proceeds, gain, problems } }`. The server works out the book value at the disposal date and the gain/loss with the app's own rules (`assets-ledger.ts` `disposalResult` / `eventPostings`) from the stored register — the screen shows these numbers, it never sends them. Only the owner requests. One open request per asset.

### `decideAssetDisposal({ data: { requestId, approve, reason } })`
- Who: the asset owner, or a Finance user with the **Approve** switch for the asset's company (P1 company scope where installed) who did not make the request.
- Where P4 is installed the approver must have confirmed it's them (step-up); the error is "Confirm it's you to approve this disposal." — call the existing step-up flow, then retry.
- The server re-prices the request's stored register snapshot; if the asset changed since the request (cost, rate, dates, account…) approval is refused ("…changed since the request. Prepare a new request.").
- On approval, in one database transaction: the asset gets `soldOn`, `saleValue` and a `disposal` record (request, method, reason, requester, approver, time, approval reason, evidence ids, book value, proceeds, gain, entry id, proceeds entry id); the non-cash disposal entry is written (adjustment −1 on the asset's ledger asset account, category "Asset disposal", tag `disposal`, amount = book value); where books are active (P7/P8) it posts **Dr Loss on asset disposal (book value) / Cr <asset account>** in the account's entity.
- Rejection disposes nothing. Deciding again returns the earlier decision with `replayed: true`.

### `cancelAssetDisposal({ data: { requestId, reason } })` — the owner (or requester) while pending.

### Reading requests
`asset_disposal_requests` (select `*`): the owner and Finance approvers for that company see rows; columns `asset_id, asset_name, method, disposal_date, proceeds, proceeds_entry_id, evidence_document_ids, reason, book_value, gain, entry_id, requested_by, requested_at, status, decided_by, decided_at, decision_reason`. Rows are append-only history (no client update/delete).

## What the database refuses (show `disposalProblem(error)`)
- Any save that sets or changes an asset's `soldOn`, `saleValue` or `disposal` outside an approval — including today's edit form "Sold on / Sale value" and the Lifecycle "disposal" event: `P14_DISPOSAL_APPROVAL_REQUIRED`. I05 must replace those paths with the request flow.
- Any new entry tagged `disposal` / category "Asset disposal" outside an approval (today's "Post write-down/disposal entries" button for disposals).
- Archiving an asset (archive status, reason, history) is allowed and never touches the disposal fields: **archiving never disposes**.

## Screen checklist (I05)
1. Start from an asset row: "Dispose / sell / write off…". Collect method, date, proceeds, optional proceeds entry, evidence documents, reason.
2. Show the server's plan (book value, proceeds, gain/loss) before submitting; show `problems` if any.
3. Pending requests list for the owner and for Finance approvers, with Approve / Reject (reason required) and the evidence links.
4. After approval show the asset as disposed with the disposal record (who asked, who approved, when, why, evidence) — read it from the asset's `disposal` field.

## Known limits (KK review)
- Book value is computed by the server function, not re-derived in SQL (as for P8 depreciation); the request keeps the asset snapshot and closed periods used.
- 0069's closed-period register guard still applies: an asset bought before a closed period cannot be changed (so not disposed) until that rule is made disposal-date aware.
