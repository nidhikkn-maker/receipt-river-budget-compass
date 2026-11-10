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

### `previewAssetDisposal({ data: { assetId, date, proceeds } })` — read-only (R-E-I14)
Returns `{ ok: true, bookValue, proceeds, gain, problems, entryId, entries, database }` without writing anything (no request, no entry, no reservation; the database part is a `STABLE` function):
- `bookValue`, `gain` — the server's plan with the app engine (the same figures `requestAssetDisposal` will record);
- `entries` — the non-cash disposal entry the approval would write (`id` = `entryId`, `amount` = book value, `accountId`, adjustment −1, category "Asset disposal") with its posting `lines` (Dr `expense:Loss on asset disposal (book value)` / Cr `account:<asset account>`); empty when the book value is 0;
- `database` — `{ bookValue, tolerance, problems }`: the database's own working (P14-a). If the two differ by more than `tolerance`, `problems` says the request would be refused;
- `problems` — everything that would stop the request (already disposed, date, open request, no ledger account, unverifiable asset, P14 not installed).
The screen shows this before submit (checklist item 2) instead of the client estimate.

### `decideAssetDisposal({ data: { requestId, approve, reason } })`
- Who: the asset owner, or a Finance user with the **Approve** switch for the asset's company (P1 company scope where installed) who did not make the request.
- The approver must have confirmed it's them (P4 step-up); the error is "Confirm it's you to approve this disposal." — call the existing step-up flow, then retry. **Without P4 approvals are refused (fail closed, `P14_STEP_UP_UNAVAILABLE`)**; a rejection still works. With P4 every decision needs the step-up.
- Separation (unchanged): a Finance user never approves a request they made; only the owner requests.
- The server re-prices the request's stored register snapshot; if the asset changed since the request (cost, rate, dates, account…) approval is refused ("…changed since the request. Prepare a new request.").
- On approval, in one database transaction: the asset gets `soldOn`, `saleValue` and a `disposal` record (request, method, reason, requester, approver, time, approval reason, evidence ids, book value, proceeds, gain, entry id, proceeds entry id); the non-cash disposal entry is written (adjustment −1 on the asset's ledger asset account, category "Asset disposal", tag `disposal`, amount = book value); where books are active (P7/P8) it posts **Dr Loss on asset disposal (book value) / Cr <asset account>** in the account's entity.
- Rejection disposes nothing. Deciding again returns the earlier decision with `replayed: true`.

### `cancelAssetDisposal({ data: { requestId, reason } })` — the owner (or requester) while pending.

### Reading requests
`asset_disposal_requests` (select `*`): the owner and Finance approvers for that company see rows; columns `asset_id, asset_name, method, disposal_date, proceeds, proceeds_entry_id, evidence_document_ids, reason, book_value, gain, entry_id, requested_by, requested_at, status, decided_by, decided_at, decision_reason`. Rows are append-only history (no client update/delete).

## The database does not trust the book value (P14-a)
`request_asset_disposal` and `decide_asset_disposal` stay callable by signed-in users, so the database checks the figure itself: `phase3_p14.book_value` works out the book value at the disposal date from the stored register (the app's uniform monthly working at full precision — day-prorated first/last month, SLM on (cost − residual)/life or cost × rate, WDV on the carrying amount, never below residual, imported opening WDV, impairment/revaluation adjustments; KK decision 4) and refuses a request or approval whose book value differs by more than **0.50 + 0.005 × months worked** (`P14_BOOK_VALUE`). The tolerance only absorbs paise rounding (the carried-forward rule versus the retired per-month rounding); a forged 0 for a ₹3,00,000 asset is refused. Assets whose working the database cannot reproduce — recorded prospective estimate changes (`policyHistory`), a property with a `buildingPolicy`, missing method/rate — are refused (`P14_UNVERIFIABLE`), never trusted; extending the database working to them is a follow-up.

## What the database refuses (show `disposalProblem(error)`)
- A book value that does not follow from the register (`P14_BOOK_VALUE`), an asset whose book value cannot be checked (`P14_UNVERIFIABLE`), an approval without step-up (`STEP_UP_REQUIRED`) or without P4 installed (`P14_STEP_UP_UNAVAILABLE`).
- Any save that sets or changes an asset's `soldOn`, `saleValue` or `disposal` outside an approval — including today's edit form "Sold on / Sale value" and the Lifecycle "disposal" event: `P14_DISPOSAL_APPROVAL_REQUIRED`. I05 must replace those paths with the request flow.
- Any new entry tagged `disposal` / category "Asset disposal" outside an approval (today's "Post write-down/disposal entries" button for disposals).
- Archiving an asset (archive status, reason, history) is allowed and never touches the disposal fields: **archiving never disposes**.

## Screen checklist (I05)
1. Start from an asset row: "Dispose / sell / write off…". Collect method, date, proceeds, optional proceeds entry, evidence documents, reason.
2. Show the server's plan from `previewAssetDisposal` (book value, proceeds, gain/loss, the entry) before submitting; show `problems` if any.
3. Pending requests list for the owner and for Finance approvers, with Approve / Reject (reason required) and the evidence links.
4. After approval show the asset as disposed with the disposal record (who asked, who approved, when, why, evidence) — read it from the asset's `disposal` field.

## Known limits (KK review)
- The posted paise figure comes from the app engine (server function); the database re-derives it and bounds it within the tolerance above rather than running a second posting engine. The request keeps the asset snapshot, closed periods and the database working (`inputs.database`).
- Assets with recorded estimate changes or a building policy cannot be disposed until the database working covers them (fail closed).
- 0069's closed-period register guard still applies: an asset bought before a closed period cannot be changed (so not disposed) until that rule is made disposal-date aware.
