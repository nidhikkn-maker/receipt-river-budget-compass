# Company tracking, tax profiles and accountant tax workpaper

## 0. Add expense page: always white (first)
The white background is already in place, but only when your phone is in light mode. In dark mode the page is still navy blue, and the published site hasn't received the change yet.
- Make the Add expense page white in dark mode too, with dark text and the cream receipt card, so it looks the same everywhere.
- Publish once you approve, so the published site and your phone show it.

## 1. Usage tracking (company workflows)
Record three moments so you can see how often each workflow is used:
- **Company created**: from the Companies page, from "Belongs to" in account settings, or suggested during a statement upload. Records where it was created and the company type.
- **Account linked to a company**: a new link, a move from one company to another, or an unlink. Records which of these happened and where.
- **Expense assigned to a company**: only when you choose a company yourself on an expense. Automatic filling from the bank account is not counted. Records whether it was a new expense or an edit.

No names, amounts or ID numbers are recorded. Events show up only in the live or published app, not in local testing.

Note: the app's main goal measures statements saved where the app's balance matches the statement's closing figure. None of these events measures that. I can offer it separately.

## 2. Editable tax profile per company
A new "Tax profile" section on each company card on the Companies page. Each tax year (FY) has its own entry, and every field is optional:
- Your ownership share % (shareholding for a company, profit share for a firm)
- Partner capital (used for the 12% interest-on-capital limit)
- Past accumulated profits (used for the deemed-dividend limit)
- Book profit override and notes

You can add, edit, copy to another year and delete each year's entry. Personal tax ("From your companies") uses the entry for the selected year. If no entry exists, it falls back to today's behaviour and flags the limits as unknown rather than guessing.

## 3. Accountant-ready tax workpaper
A "Tax workpaper" view in the Tax Centre for a chosen FY, covering personal tax and each company:
- **Calculation**: income by head, deductions, tax under each regime, rebate, surcharge, cess, credits and amount payable. For companies: profit, adjustments and tax.
- **Source transactions**: the ledger entries behind each figure (date, description, account, amount), grouped by line.
- **Assumptions**: tax-year rules version, chosen regime, figures from the tax profile, s.40(b)/s.2(22)(e) limits applied, and anything unknown or estimated.

Exports as a PDF and a ZIP with CSV files, then saved as a locked document in the document store, the same way the ITR handoff is. It only reads your records and never fills in missing figures.

## Technical details
- Tracking: add `track?` to the existing `__lovableEvents` declaration. Call `window.__lovableEvents?.track?.()` in the success branches of `entities.tsx`, `BelongsTo.tsx`, `statements.tsx` and the expense save in `new.tsx`/ExpenseDialog. Events: `project.company_created {source, kind}`, `project.account_company_linked {action, source}`, `project.expense_company_assigned {mode}`. Register them with catalog_upsert, then run schema_check.
- Tax profiles: stored in owner preferences under `books.entityTaxProfiles[entityId][fy]`. Pure helpers live in `books/entity-tax-profile.ts` (upsert, copy, remove, profileFor) with tests. `TaxCentre` maps these values into `EntityFacts.holdingPct/capital/accumulatedProfits`.
- Workpaper: pure `books/tax-workpaper.ts` builds sections from the tax-full and from-entities outputs plus the source entries for each line, and lists assumptions. Tests check that totals match the computation and that every line traces back to its entries. UI goes in `components/books/TaxWorkpaper.tsx`, reusing the ITR handoff's ZIP/PDF/evidence-lock helpers.
- Update `src/lib/books/AGENTS.md` and `roadmap.md`.
