# Investment statements in Statement Desk + Completeness Check

## How v6.0 and v6.1 fit into one app

They aren't separate apps. Both plug into what Ledgerline already has:

```text
Statement Desk (the only upload place)
   -> identifies the document: bank / card / loan / demat / transactions / capital gains
   -> keeps the original file in the Document Vault, renamed to DocuRepo
   -> Investments: holdings, cost, capital gains          (v6.0 Part on investments)
   -> Prices and net worth on Home and Wealth             (v6.1)
```

This plan does the first slice: demat statements, the completeness check, and filling the gaps from a second document. Live share prices (v6.1) come next, as a separate step, because they need an approved price provider.

## What you'll see

After you upload an ICICI Direct demat (holdings) statement on Statement Desk, a **Demat Statement Review** card shows:

| Check | What it shows |
|---|---|
| Demat account | Identified (DP ID / client ID, holder), or "Confirm account" |
| Stock holdings | Extracted: N securities, matched by ISIN |
| Portfolio valuation | "Price data required" until a trusted price exists; the statement's own printed value is shown and labelled with its date |
| Purchase history | Complete / Missing for N holdings |
| Capital gains | Pending verification / Verified |
| Original document | Stored in DocuRepo (link) |

If buy dates or costs are missing for any holding, the card offers:
**"Upload ICICI Direct Transaction Statement or Capital Gains Statement"**. This opens Statement Desk set up for that demat account.

When that second file is uploaded:
- each trade or gain line is matched to an existing holding by ISIN (the name alone is never enough)
- it adds buy date, quantity and cost to that holding; it never creates a second copy of the security
- quantities are checked: bought − sold must equal the holding quantity; any gap shows as "Quantity differs by X"
- capital gains become "Verified" only when the gains statement agrees with the matched buys and sells
- unknown securities or unsure matches wait for your tap; nothing is saved without you confirming
- both originals stay in DocuRepo, linked to the demat account and its holdings

The Document Vault is renamed **DocuRepo** (More → DocuRepo). It gets new document types: Demat statement, Transaction statement, Capital gains statement.

## Rules kept
- Statement Desk stays the only upload place. An "Upload" button on Investments opens it.
- No made-up prices, costs or dates. Missing values stay "missing".
- Holdings and trades are investment records, not bank entries, so nothing is counted twice in cash or ledger totals.
- Undo on the upload removes what it added and puts back the earlier holding details.

## Technical section
- Database (migration): `demat_accounts` (owner, dp_id, client_id, broker, holder, account_id link), `securities_holdings` (owner, demat_id, isin unique per demat, symbol, name, quantity, as_of, statement_value, source_doc), `security_lots` (holding_id, trade_date, qty, price, cost, side, source_doc, fingerprint unique), `capital_gain_lines` (holding_id, sell_date, qty, cost, proceeds, gain, term, source_doc, fingerprint unique). All rows belong to their owner (RLS), with grants. Writes go through an owner-checked atomic RPC (`apply_investment_statement`) with idempotent fingerprints and an undo snapshot.
- `src/lib/statement-pipeline/identify.ts`: detect demat holdings, transaction and capital-gains documents (ICICI Direct header patterns plus generic NSDL/CDSL "ISIN" tables).
- New pure modules: `investment-parse.ts` (rows to holdings/trades/gains), `investment-match.ts` (ISIN-first matching to existing holdings), `investment-completeness.ts` (the six statuses and the missing-history list, plus quantity reconciliation). These have unit tests with the exact rules: ISIN match, no duplicate security, quantity gap, gains verified only when they agree.
- Scanned PDFs reuse the existing server extractor with a holdings/trades schema; document privacy settings still apply.
- UI: `InvestmentReview.tsx` card in `statements.tsx`; holdings list on Wealth gains a "Cost / Purchase history" column; `/vault` relabelled DocuRepo (route kept so old links work); `documents.ts` gets the new types.
- AGENTS.md rule added for the investment pipeline.

## Not in this step (next)
- Live NSE/BSE prices and net worth on Home (v6.1). We need to choose an approved price source first. Mutual fund prices already come from the published daily fund prices.
- The rest of v6.0 (GST, tax, property, assets) gets its own plan.
