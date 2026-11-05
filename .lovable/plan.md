# Companies: create from account, move links, company on expenses, comparisons, and tax

## 1. Create or move a company from account settings
- **Belongs to** now has a visible **Create company** button. It opens a small form on the page with an optional name (prefilled from the statement's holder name) and a type (Company preselected). Tapping **Create & link** creates the company and links the account in one step. This replaces the current browser pop-up, which the preview and the phone app often block.
- To move an account already marked personal, choose any company in the same picker, or create one. A confirmation says: "Move <account> from Personal to <company>? Past entries will count for <company> unless you changed them by hand."
- The Companies page keeps its **Link accounts** list, which also shows personal accounts, so moving works from either side.
- **Open company** link next to the picker.

## 2. Company field on every expense
- New-entry and edit forms get a **Company** row: Personal or one of your companies.
- It fills in automatically from the paying account's company and is marked as auto-filled. You can change it on any entry, and your choice stays even if the account later moves.
- Entries you haven't set by hand follow their account. Moving an account to a company therefore re-assigns those entries automatically, and the move confirmation counts how many will change.
- Lists and the entry detail show the company name. CSV and PDF reports gain a Company column.

## 3. Company spending summaries and filters
- New **Companies** view under Reports, also linked from Companies & years. For a chosen period it shows each company and Personal side by side: total spent, top categories, month-by-month trend, and the share of money moved between your own companies (shown separately, never counted as spending).
- A Company filter (multi-select) is added to the Transactions list, Reports filters and the Inbox.
- Tapping a company's figure opens its filtered transactions.

## 4. Tax for every company, and its link to your personal tax (Indian Income-tax Act)
**Each company gets its own tax computation.** The Tax Centre runs one per company for the chosen year using only that company's linked accounts, entries and assets. It shows profit, depreciation, chosen regime (115BAA / 115BAB / normal), MAT where it applies, surcharge, cess, credits and amount due. Companies missing a regime choice show "Choose tax option" and no number, never a guess.

**What flows into your personal tax, following the law:**

| Your company type | What goes into your personal return |
|---|---|
| Proprietorship | Its entire profit is your business income (same PAN), added under "Profits and gains of business" |
| Partnership / LLP | Your profit share is exempt (s.10(2A)). Partner salary and interest on capital paid to you are taxable as business income (s.28(v)), within the s.40(b) limits |
| Private / public company | The company's profit is **not** your income. Only what it pays you counts: salary (Salaries), dividends (Other sources, from 1 Apr 2020), rent, interest and loans treated as deemed dividend under s.2(22)(e) |

- Your personal computation gains a **From your companies** section listing each of these with its source entries. Missing ownership details are flagged rather than assumed.
- Ownership % comes from the shareholding/partners list on the company profile. Profit share uses the partnership deed % you enter.
- New rule versions go into the existing approved rule register, with dated thresholds, so future law changes stay owner-approved.
- Everything remains a draft working paper for your accountant. Nothing is filed.

## Technical details
- Database: add a nullable `entity_id text` (set by hand) and `entity_source text default 'account'` to `expenses`, with no data changes. Effective company is the stored value if set by hand, otherwise the paying account's owner from `books.entityAccounts`. The read happens in a pure `effectiveEntity()` used by forms, filters and reports.
- `BelongsTo.tsx`: inline create form plus move confirmation with the affected-entry count.
- `src/lib/company-summary.ts` (pure): per-entity totals, categories and monthly series, with transfers between your own companies split out. A new route, `/reports/companies`, gets its own head metadata.
- `tax-full.ts`: per-entity liability loop; new `fromEntities()` maps proprietorship profit, partner remuneration/interest (s.40(b) cap), dividends and deemed dividend into the individual computation heads.
- Tests, one per rule: proprietorship profit added; partnership share exempt but remuneration taxed and capped; company profit excluded while its dividend is included; manual company kept when the account moves; account-follow entries re-assigned; transfers between your companies excluded from spending.
