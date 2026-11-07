# Correct how the Mercedes GLS EMI flows

Real flow: IDFC Krupa auto-transfers to your City Union Bank savings account on the 3rd, and the EMI leaves that CUB account on the 5th. The app currently has no CUB savings account, and it treats the seven IDFC Krupa debits (Apr–Oct 2026) as direct loan payments.

## Changes
1. **Add the CUB savings account** "City Union Bank savings" (ending 4894), linked to the GLS loan.
2. **Re-label the seven IDFC Krupa debits** (₹3,13,900, around the 3rd) as transfers from IDFC Krupa to CUB savings. They stop counting as EMI payments or spending.
3. **Move the recurring EMI** (₹3,13,913 on the 5th) so it is paid from CUB savings, not IDFC Krupa.
4. **Add a new recurring transfer**: ₹3,13,900 from IDFC Krupa to CUB savings on the 3rd of every month.
5. **Automatic matching for future statements**:
   - IDFC Krupa debits near the 3rd for about the EMI amount are suggested as "Transfer to CUB savings".
   - CUB savings debits near the 5th are suggested as the GLS EMI.
   - Both still need your confirmation.
6. **Reconciliation screen**: each EMI is matched to the CUB savings debit. The IDFC Krupa transfer from the 3rd is shown next to it as "funded by". Until you upload CUB statements, these months show "Funded, EMI debit not yet seen". They are not shown as missing.

## Questions to confirm while building
- The CUB savings opening balance is unknown. I'll leave it at ₹0 and mark it as needing a balance until you upload a CUB statement.

## Technical details
- Data changes go through owner-scoped updates. Transfers use txnType `transfer` with the to-account set to the new CUB account, and the EMI commitment's account becomes the CUB account.
- `emi-match.ts`: add a `fundingAccountId`/`fundingDay` to `EmiTarget`, and add a `matchEmiFunding()` that `statement-auto.ts` uses. The `emiReconciliation` row gains a `funding` field and a `funded_only` status.
- Update the tests in `emi-match.test.ts` and memory `mem://loans.md`.
