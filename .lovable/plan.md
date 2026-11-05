# Create a company from account settings

Account settings already has a "Belongs to" picker with a "+ New company…" choice. That choice opens a browser pop-up, which the preview and the installed phone app often block, so in practice it can't be used. This plan replaces it.

## What you will see
In each account's "Balance & account settings", under "Belongs to":
- A visible **"Create company"** button next to the picker.
- Tapping it, or choosing "+ New company…" in the picker, opens a small form in the page with:
  - Company name: optional, prefilled from the account's holder name when the statement printed one
  - Type: Company, LLP, Partnership, Proprietorship, Trust or HUF (Company is preselected)
  - **Create & link** and **Cancel** buttons
- One tap creates the company and links this account to it. The new company appears on Companies & years with a "Details to fill" tag.
- An **Open company** link next to the picker goes to that company's page, where you can edit, move, unlink or delete.

## Rules
- No field is required. A blank name is saved as "Unnamed company".
- Creating a company never changes balances or entries.
- One company can still have many accounts. Creating a new company moves this account away from any company it was linked to before.

## Technical details
- `src/components/BelongsTo.tsx`: replace `window.prompt` with an inline form (name input, kind select). Save `entities` and `books.entityAccounts` in one preferences write using the existing `stubEntity` and `linkAccounts`. Prefill the name from `account.details.holder`.
- Add a small test that a new company created this way is linked to the account and moved off any previous company. This uses the existing `entity-accounts` tests.
