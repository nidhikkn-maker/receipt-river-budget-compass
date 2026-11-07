import type { Expense } from './expenses';
import type { Account } from './ledger';
import type { FinancePreferences } from './preferences';
import { INSTRUMENT_PAYMENT } from './payment-instruments';

export function verifiedRecovery(e: Expense, accounts: Account[], prefs: FinancePreferences) {
  const instrument = prefs.paymentInstruments.find(p => p.id === e.paymentInstrumentId && !p.archived && accounts.some(a => a.id === p.accountId && !a.archived));
  const account = !e.accountId && instrument ? instrument.accountId : undefined;
  const organisationTags = [...new Set((e.tags ?? []).filter(t => t.startsWith('Organisation: ')).map(t => t.slice(14)).filter(name => prefs.tags.some(t => t.group === 'Organisation' && t.name === name)))];
  const organisation = !e.department && !e.workspaceAllocations?.length && organisationTags.length === 1 ? organisationTags[0] : undefined;
  const paymentMethod = !e.paymentMethod && instrument ? INSTRUMENT_PAYMENT[instrument.type] : undefined;
  return { account, organisation, paymentMethod, evidence: [ ...(account ? ['Saved payment method has a verified linked account. Confirm before changing the source.'] : []), ...(organisation ? ['One configured organisation is already saved as a transaction tag. Confirm responsibility before applying.'] : []), ...(paymentMethod ? ['Saved payment instrument establishes its general payment method.'] : []) ] };
}