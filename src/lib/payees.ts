import { accountBalance, type Account, type Txn } from './ledger';
export const PAYEE_TYPES = ['individual', 'merchant', 'business', 'organisation', 'other'] as const;
export type PayeeType = typeof PAYEE_TYPES[number];
export interface Payee {
  id: string;
  name: string;
  type: PayeeType;
  identifiers: string[];
  accountDetails: string;
  accountVerified: boolean;
  organisation: string;
  preferredCategory: string;
  archived: boolean;
}
export function validatePayee(value: Payee, existing: Payee[] = []): Payee {
  const name = value.name.trim();
  if (!name || name.length > 120) throw Error('Enter a recipient name of up to 120 characters.');
  if (!value.id || !PAYEE_TYPES.includes(value.type)) throw Error('Choose a recipient type.');
  if (existing.some(p => p.id !== value.id && p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase() && p.type === value.type)) throw Error('This recipient already exists. Edit the saved recipient instead.');
  const identifiers = [...new Set(value.identifiers.map(s => s.trim()).filter(Boolean))];
  if (identifiers.length > 10 || identifiers.some(s => s.length > 200) || value.accountDetails.length > 500) throw Error('Keep recipient payment details concise.');
  if (value.accountVerified && !value.accountDetails.trim()) throw Error('Enter the account details you have verified.');
  return { ...value, name, identifiers, accountDetails: value.accountDetails.trim(), organisation: value.organisation.trim(), preferredCategory: value.preferredCategory.trim(), archived: !!value.archived, accountVerified: !!value.accountVerified };
}
export function cleanPayees(raw: unknown): Payee[] {
  if (!Array.isArray(raw)) return [];
  const result: Payee[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.name !== 'string') continue;
    try {
      const next = validatePayee({ id:value.id, name:value.name, type:value.type, identifiers:Array.isArray(value.identifiers)?value.identifiers.filter((s:unknown):s is string=>typeof s==='string'):[], accountDetails:typeof value.accountDetails==='string'?value.accountDetails:'', accountVerified:value.accountVerified===true, organisation:typeof value.organisation==='string'?value.organisation:'', preferredCategory:typeof value.preferredCategory==='string'?value.preferredCategory:'', archived:value.archived===true }, result);
      if (!result.some(p=>p.id===next.id)) result.push(next);
    } catch { /* Invalid saved data must never invent a counterparty. */ }
  }
  return result;
}
/** An explicit picker populates the existing merchant field, not an owned account. */
export function payeeDraft(payee: Payee) {
  if (payee.archived) throw Error('Choose an active recipient.');
  return { merchant: payee.name };
}
/** Money lent to / borrowed from an outside recipient is tracked as an owned "Other asset" or
 * "Borrowing" account linked to the recipient, so transfers move money and nothing counts as spending or income. */
export function recipientAccount(payee: Payee, direction: 'lent' | 'borrowed') {
  if (payee.archived) throw Error('Choose an active recipient.');
  return { name: `${direction === 'lent' ? 'Lent to' : 'Borrowed from'} ${payee.name}`.slice(0, 120), kind: direction === 'lent' ? 'other_asset' as const : 'other_liability' as const, openingBalance: 0, details: { payeeId: payee.id } };
}
export function recipientBalances(payeeId: string, accounts: Account[], txns: Txn[]) {
  const linked = accounts.filter(a => a.details?.payeeId === payeeId && !a.archived);
  const sum = (kind: string) => linked.filter(a => a.kind === kind).reduce((s, a) => s + accountBalance(a, txns), 0);
  return { owedToYou: Math.round(sum('other_asset') * 100) / 100, youOwe: Math.round(sum('other_liability') * 100) / 100, accounts: linked };
}
