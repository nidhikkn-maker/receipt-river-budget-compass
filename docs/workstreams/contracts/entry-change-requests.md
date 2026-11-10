# Contract: team change requests (P0-022)

Owner: Track A (financial integrity). Consumers: screen workstreams (team expenses, review inbox). Status: proposed — needs the proposed SQL P13 (`.lovable/staged-sql/proposed/P13_team_change_requests.sql`, which requires P10). Nothing here is applied to Cloud.

KK decision (binding): "Team users cannot permanently delete financial records or audit history. Allow permission-scoped requests for withdrawal or correction, with authorised approval where consequential. Enforce permissions server-side and preserve entity separation."

## What the database guarantees
- No signed-in user deletes an entry (P10). Team members never delete audit history (P13; also TRUNCATE).
- A team member cannot change money, dates, accounts, splits, receipts or the statement match of another person's entry directly (`P13_REQUEST_REQUIRED`). Descriptive edits follow the existing switches.
- Requests and decisions are checked in the database for the entry's company when P1 is installed (otherwise the applied person/department rule).

## Client API (`src/lib/entry-requests.ts`)
| Call | Who | Rule |
|---|---|---|
| `requestEntryChange({ entryId, kind: "withdraw", reason })` | team member with **Request withdrawal** (`delete_expenses`) for the entry's company | reason ≥ 5 characters; one pending request per entry |
| `requestEntryChange({ entryId, kind: "correct", reason, changes })` | team member with **Edit** (`edit_expenses`) | `changes` keys only from `CORRECTABLE`: title, merchant, category, description, expense_date, amount (INR entries without splits) |
| `decideEntryChange({ requestId, approve, reason })` | the entry owner, or a Finance user with **Approve** for that company, never the requester | reason ≥ 5 characters; applied on approval, revision-checked; repeat returns `replayed: true` |
| `cancelEntryChange({ requestId, reason })` | the requester | only while pending |
| `listEntryChanges(status?)` | anyone | returns only what the database lets the caller see: own entries, own requests, or requests the caller may approve |

Errors are already worded for people (`requestProblem`). Before P13 is installed every call returns `REQUESTS_NOT_INSTALLED`; screens should then hide the request actions (the owner still withdraws or corrects their own entries).

## Rules a screen must follow
- Offer **Request withdrawal** / **Request correction** only on another person's entry; show the reason field and the exact change.
- On approval of a withdrawal the entry is withdrawn (P10): kept with receipts and history, left out of totals; its history names the requester and the approver.
- Posted entries are refused (`P10_POSTED`: the owner reverses them); statement-matched entries are not withdrawn and keep amount and date (`P10_RECONCILED`).
- Never show amounts or details of an entry the caller cannot see; the request list is already filtered.
