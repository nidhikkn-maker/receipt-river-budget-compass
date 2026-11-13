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

Returns `{ requestId, entryId, engineBookValue, plan: { bookValue, proceeds, gain, problems } }`. `plan.bookValue` / `plan.gain` are the figures the database **recorded** (read back from the request row: the database's own working, see P14-a below); `engineBookValue` is the app engine's figure (`assets-ledger.ts` `disposalResult`), which the server only hands to the database as a consistency check. The screen shows these numbers, it never sends them. Only the owner requests. One open request per asset.

### `previewAssetDisposal({ data: { assetId, date, proceeds } })` — read-only (R-E-I14)
Returns `{ ok: true, bookValue, proceeds, gain, problems, entryId, entries, database }` without writing anything (no request, no entry, no reservation; the database part is a `STABLE` function):
- `bookValue`, `gain` — the database's figure (`database.bookValue`), i.e. exactly what `requestAssetDisposal` will record and the approval will post (the app engine's figure only when P14 is not installed, which is then a problem anyway);
- `engineBookValue` — the app engine's figure (carried-forward paise), for information;
- `entries` — the non-cash disposal entry the approval would write (`id` = `entryId`, `amount` = the database's book value, `accountId`, adjustment −1, category "Asset disposal") with its posting `lines` (Dr `expense:Loss on asset disposal (book value)` / Cr `account:<asset account>`); empty when the book value is 0;
- `database` — `{ bookValue, tolerance, problems }`: the database's own working (P14-a). If the two differ by more than `tolerance`, `problems` says the request would be refused;
- `problems` — everything that would stop the request (already disposed, date, open request, no ledger account, unverifiable asset, P14 not installed).
The screen shows this before submit (checklist item 2) instead of the client estimate.

### `decideAssetDisposal({ data: { requestId, approve, reason } })`
- Who: the asset owner, or a Finance user with the **Approve** switch for the asset's company (P1 company scope where installed) who did not make the request.
- The approver must have confirmed it's them (P4 step-up); the error is "Confirm it's you to approve this disposal." — call the existing step-up flow, then retry. **Without P4 approvals are refused (fail closed, `P14_STEP_UP_UNAVAILABLE`)**; a rejection still works. With P4 every decision needs the step-up.
- Separation (unchanged): a Finance user never approves a request they made; only the owner requests.
- The database re-derives the book value at decision time; if the register changed since the request so that the figure differs at all, approval is refused (`P14_BOOK_VALUE_CHANGED`: "The asset register changed since the request, so its book value is different now…"); any other change to the asset (name, account…) is refused as `P14_CHANGED` ("…changed since the request. Prepare a new request."). It never posts a stale figure.
- On approval, in one database transaction: the asset gets `soldOn`, `saleValue` and a `disposal` record (request, method, reason, requester, approver, time, approval reason, evidence ids, book value, proceeds, gain, entry id, proceeds entry id); the non-cash disposal entry is written (adjustment −1 on the asset's ledger asset account, category "Asset disposal", tag `disposal`, amount = book value); where books are active (P7/P8) it posts **Dr Loss on asset disposal (book value) / Cr <asset account>** in the account's entity.
- Rejection disposes nothing. Deciding again returns the earlier decision with `replayed: true`.

### `cancelAssetDisposal({ data: { requestId, reason } })` — the owner (or requester) while pending.

### Reading requests
`asset_disposal_requests` (select `*`): the owner and Finance approvers for that company see rows; columns `asset_id, asset_name, method, disposal_date, proceeds, proceeds_entry_id, evidence_document_ids, reason, book_value, gain, entry_id, requested_by, requested_at, status, decided_by, decided_at, decision_reason`. Rows are append-only history (no client update/delete).

## The database does not trust the book value (P14-a, R-E-I15)
**R-E-I15 change (11 Nov 2026) — the database stores and posts only its own figure.** Before, a caller figure inside the tolerance was stored as `book_value` and posted. Now `request_asset_disposal` / `decide_asset_disposal` store, post and write into the asset's `disposal` record only `phase3_p14.book_value` rounded to paise; `p_book_value` is an optional consistency check (outside tolerance → `P14_BOOK_VALUE`; inside → ignored). It is kept, rather than dropped, so the server function keeps cross-checking the app engine against the database working and a divergence is refused instead of passing silently. Call shape: `request_asset_disposal(p_asset, p_method, p_date, p_proceeds, p_proceeds_entry, p_evidence, p_reason, p_entry, p_inputs DEFAULT '{}', p_book_value DEFAULT NULL)` — `p_book_value` moved to the last, defaulted argument (call it with named arguments, as PostgREST `rpc` does); `decide_asset_disposal(p_request, p_approve, p_reason, p_book_value DEFAULT NULL)` unchanged. **I05 (WS-E):** the server-function inputs are unchanged; read `plan.bookValue` / `preview.bookValue` as the recorded figure (no longer the app engine's; use `engineBookValue` for that) and show `P14_BOOK_VALUE_CHANGED` via `disposalProblem`. Direct RPC callers that passed `p_book_value` positionally must switch to named arguments or omit it.

`request_asset_disposal` and `decide_asset_disposal` stay callable by signed-in users, so the database works the figure out itself: `phase3_p14.book_value` works out the book value at the disposal date from the stored register (the app's uniform monthly working at full precision — day-prorated first/last month, SLM on (cost − residual)/life or cost × rate, WDV on the carrying amount, never below residual, imported opening WDV, impairment/revaluation adjustments; KK decision 4) and refuses a request or approval whose supplied book value differs by more than **0.50 + 0.005 × months worked** (`P14_BOOK_VALUE`); the figure it records is always its own. The tolerance only absorbs paise rounding (the carried-forward rule versus the retired per-month rounding); a forged 0 for a ₹3,00,000 asset is refused. Assets whose working the database cannot reproduce — recorded prospective estimate changes (`policyHistory`), a property with a `buildingPolicy`, missing method/rate — are refused (`P14_UNVERIFIABLE`), never trusted; extending the database working to them is a follow-up.

## Duplicated asset ids: which copy (P14-c, 13 Nov 2026, Track A; staged only)
`finance_preferences.data->'assets'` may hold an id more than once. The database now chooses the copy with the app's own rule (`disposalCopy` → `disposedOn` / `depreciationCopy`, WS-E fin8): not excluded (`excludedAt`), the named owner's copies only, the first depreciating copy in storage order in the figure for the disposal month, a sale of the chosen copy stopping the id (`P14_ALREADY_DISPOSED: already disposed on <date>`), else the first copy in use by the month, else the first copy (`phase3_p14.asset_copy`). The chosen row's 1-based array position is stored in `asset_disposal_requests.asset_ordinal` (and `inputs.copy`); the approval locks the register, requires the same copy at the same position, byte-identical to the row priced (else `P14_CHANGED`, nothing written), and marks only that row. New optional argument `p_owner_entity text DEFAULT NULL` on `request_asset_disposal` and a 4-argument `preview_asset_disposal(p_asset, p_date, p_proceeds, p_owner_entity)` (the 3-argument form stays): pass the asset's `ownerEntityId`, `''` for personal. Not passed (NULL), copies under more than one owner are refused (`P14_OWNER`). The preview also returns `ordinal` and `ownerEntityId`; the approval result returns `ordinal` and `bookValue`. **WS-E:** pass `p_owner_entity: input.ownerEntityId ?? ""` when the owner is known (the server function currently omits it, which works for single-owner ids). The disposal-field guard now compares every row of an id (a second copy cannot be marked sold outside the workflow).

## What the database refuses (show `disposalProblem(error)`)
- A book value that does not follow from the register (`P14_BOOK_VALUE`), a register change between request and approval (`P14_BOOK_VALUE_CHANGED`), an asset whose book value cannot be checked (`P14_UNVERIFIABLE`), an approval without step-up (`STEP_UP_REQUIRED`) or without P4 installed (`P14_STEP_UP_UNAVAILABLE`).
- Any save that sets or changes an asset's `soldOn`, `saleValue` or `disposal` outside an approval — including today's edit form "Sold on / Sale value" and the Lifecycle "disposal" event: `P14_DISPOSAL_APPROVAL_REQUIRED`. I05 must replace those paths with the request flow.
- Any new entry tagged `disposal` / category "Asset disposal" outside an approval (today's "Post write-down/disposal entries" button for disposals).
- Archiving an asset (archive status, reason, history) is allowed and never touches the disposal fields: **archiving never disposes**.

## Screen checklist (I05)
1. Start from an asset row: "Dispose / sell / write off…". Collect method, date, proceeds, optional proceeds entry, evidence documents, reason.
2. Show the server's plan from `previewAssetDisposal` (book value, proceeds, gain/loss, the entry) before submitting; show `problems` if any.
3. Pending requests list for the owner and for Finance approvers, with Approve / Reject (reason required) and the evidence links.
4. After approval show the asset as disposed with the disposal record (who asked, who approved, when, why, evidence) — read it from the asset's `disposal` field.

## Known limits (KK review)
- The posted paise figure is the database's full-precision working rounded once (R-E-I15); the app engine (carried-forward paise, also used for the depreciation it posts) may differ from it by up to the tolerance, so the asset's ledger account can keep a few paise after disposal until the engines are aligned. The request keeps the asset snapshot, closed periods and the database working (`inputs.database`).
- Assets with recorded estimate changes or a building policy cannot be disposed until the database working covers them (fail closed).
- 0069's closed-period register guard still applies: an asset bought before a closed period cannot be changed (so not disposed) until that rule is made disposal-date aware.
