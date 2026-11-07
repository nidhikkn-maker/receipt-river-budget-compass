# V5.9.2 — Financial Inbox Redesign Acceptance

Spec: `.lovable/requirements-v5.9.2.md` (uploaded LEDGERLINE_pasted-28.md). Preview-only; no live deployment, no real financial record changes.

## Status against the spec

| Section | Requirement | State |
|---|---|---|
| 2–3 | Three views: Inbox overview, Transaction Review, Accounts Check | Done earlier (V5.10): `/inbox` overview-only, `/transaction-review`, `/account-reconciliation` |
| 4 | Accurate counts, unique vs issue counts, no contradictory empty states | Done earlier: `reviewCounts` separates unique transactions / issues / overlaps |
| 5 | Review layout: title, count, filters, search, selection, detail area | Done; detail area now shows a bulk summary when a selection exists (fixed this turn — no more "No transaction selected" during bulk selection) |
| 6 | One labelled Select control: visible / matching / page / merchant group / clear, exact counts | Done; selection persists across scroll/details via state + encrypted device context |
| 7 | Persistent bulk action bar with counts and actions | Done; sticky bar with total, accounts, organisations, conflicts |
| 8 | Guided workflow: select → action → values → preview → confirm | Done; category dialog now has a prominent **Review & Apply** button opening the exact preview (this turn) |
| 9 | Merchant-based grouped review | Done; cohorts partitioned by type/workspace/responsibility |
| 10 | Missing-information grouped by field | Done; missing-field filter with recovery suggestions from verified records |
| 11 | Suggestions with confidence and reason | Done; never auto-posted |
| 12 | iPad two-panel landscape, adaptive portrait | Verified this turn: 1180×820 two-panel (list + review panel), 820×1180 adaptive, no overflow |
| 13 | iPhone cards, sticky selection, bottom-sheet forms | Verified this turn at 402×874, no overflow, bottom nav does not cover actions |
| 14 | Desktop table, sorting, keyboard navigation | Table + sorting existed; **arrow-key navigation between row checkboxes added this turn** and verified (focus moves on ArrowDown) |
| 15 | Clutter moved to dialogs/Settings | Done; rules, corrections, mapping, recurring, metadata all open in dialogs; classification rules have a dedicated Settings page |
| 16 | Financial safety rules | Preserved; previews are fingerprint-bound, money unchanged by category/mapping actions, undo audited |
| 17 | Review item lifecycle | Row statuses (Ready / Suggested Correction / Needs Information / Possible Duplicate / Unresolved) plus Selected state; resolving a category leaves other issues in review |
| 18 | Test scenarios | Covered by 864 automated checks incl. selection scopes, mixed-validity bulk, preview/cancel, retry with preserved operation ID, device recovery |

## Verification this turn

- Full suite: **864 tests / 108 files passed**; build OK.
- Signed-in browser at 1440×900, 1180×820, 820×1180, 402×874: no horizontal overflow, no page errors, two rows selected, sticky bar and right-panel bulk summary shown, ArrowDown moves focus between row checkboxes.
- Screenshots: `/tmp/browser/v592/screenshots/{desktop,ipad-landscape,ipad-portrait,iphone}.png`.

## Not done / blocked

- Physical iPad/iPhone, Split View, Stage Manager, external keyboard and trackpad acceptance need real devices; emulated sizes and keyboard events only.
- Paired transfer/card-settlement linking remains blocked pending a canonical movement model (no financial shortcut).
- Live-site changes require publication approval; nothing published.
