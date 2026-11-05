# Link bank accounts to companies (both directions)

The app already keeps a hidden company-to-account list that taxes, opening balances and the audit read. Today nothing on screen lets you set it. This plan adds that.

## What you will see

**On a bank account (Accounts / account edit)**
- New "Belongs to" picker: Me (personal) or one of your companies, plus "+ New company…".
- Typing a new company name creates it straight away with just the name and type (Company / LLP / Partnership / Proprietorship). PAN, GSTIN and other details are left blank and marked "Details to fill" on Companies & years.
- Each account shows a small company label in the accounts list.

**On a company (Companies & years)**
- New "Bank accounts" section listing linked accounts, with "Link account" (choose from existing ones) and Unlink.
- Companies created from a bank account show a "Details to fill" badge until PAN is added.

**When a statement is uploaded**
- If the printed account holder looks like a business (Pvt Ltd, LLP, Limited, & Co, Enterprises, Traders, etc.), the new-account card pre-suggests "Belongs to: <that name> (new company)". Nothing is created until you confirm the card, as today.
- If the holder matches an existing company name, that company is preselected.

## Rules
- One account belongs to at most one company; moving it removes it from the old one.
- Linking never changes balances, entries or past reports; it only changes which company's tax, opening balance and audit views include that account.
- A company with blank PAN is allowed to exist but its PAN/GSTIN checks still run once you fill them in.

## Technical details
- `src/lib/entities.ts`: allow a "stub" profile (PAN optional when `stub: true`); add `stubEntity(name, kind)`, `looksLikeBusiness(holder)`, `matchEntityByName()`.
- New pure `src/lib/books/entity-accounts.ts`: `linkAccount(map, entityId, accountId)` (exclusive), `unlink`, `ownerOf`. Unit tests for exclusivity, unlink, name matching, business-name detection.
- Save company + link together in one preferences write (`entities` + `books.entityAccounts`).
- UI: account edit dialog picker, entities page section + badge, statement new-account card suggestion in the Statement Desk.
- No database change needed; record the rule in `src/lib/books/AGENTS.md`.
