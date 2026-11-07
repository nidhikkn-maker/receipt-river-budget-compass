import { expect, it } from 'vitest';
import type { Expense } from './expenses';
import type { Account } from './ledger';
import { correctionDestinationAccounts, correctionFields } from './correction-fields';

const record = (txnType: Expense['txnType']) => ({ txnType } as Expense);
const accounts: Account[] = [
  { id:'bank', name:'Bank', kind:'savings', openingBalance:0, archived:false },
  { id:'card', name:'AMEX', kind:'credit_card', openingBalance:0, archived:false },
  { id:'loan', name:'Loan', kind:'loan', openingBalance:0, archived:false },
  { id:'closed-card', name:'Closed', kind:'credit_card', openingBalance:0, archived:true },
];
it('ordinary expense requires no internal destination, including keep-existing type', () => {
  expect(correctionFields(undefined,[record('expense')])).toMatchObject({type:'expense',destination:false,repayment:false});
  expect(correctionDestinationAccounts('expense',accounts)).toEqual([]);
});
it('incoming money has one receiving account rather than two internal accounts', () => {
  for (const type of ['income','refund','reimbursement','advance'] as const) {
    expect(correctionFields(type,[record('expense')])).toMatchObject({destination:false,accountLabel:'Receiving account'});
  }
});
it('owned-account transfers require the destination field', () => {
  expect(correctionFields('transfer',[record('expense')]).destination).toBe(true);
  expect(correctionDestinationAccounts('transfer',accounts).map(a=>a.id)).toEqual(['bank','card','loan']);
});
it('card settlements offer active credit cards only', () => {
  expect(correctionDestinationAccounts('card_payment',accounts).map(a=>a.id)).toEqual(['card']);
});
it('loan repayments retain loan destination and principal/interest inputs even when keeping type', () => {
  expect(correctionFields(undefined,[record('loan_repayment')])).toMatchObject({destination:true,repayment:true});
  expect(correctionDestinationAccounts('loan_repayment',accounts).map(a=>a.id)).toEqual(['loan']);
});
it('mixed existing types do not presume the same account fields', () => {
  expect(correctionFields(undefined,[record('expense'),record('transfer')])).toMatchObject({mixed:true,type:undefined,destination:false});
});
import { intentAccounts, TXN_INTENTS } from './correction-fields';
describe('What is this transaction?', () => {
  const accts = [{ id: 'a', name: 'IDFC', kind: 'savings', openingBalance: 0, archived: false }, { id: 'r', name: 'Loan to Ravi', kind: 'other_asset', openingBalance: 0, archived: false }, { id: 'c', name: 'AMEX', kind: 'credit_card', openingBalance: 0, archived: false }] as const;
  const get = (id: string) => TXN_INTENTS.find(i => i.id === id);
  it('expense asks for no receiving account', () => { expect(intentAccounts(get('expense'), [...accts]).destinations).toEqual([]); });
  it('loan given only offers receivable accounts', () => { expect(intentAccounts(get('loan_given'), [...accts]).destinations.map(a => a.id)).toEqual(['r']); });
  it('card bill only offers credit cards', () => { expect(intentAccounts(get('card_bill'), [...accts]).destinations.map(a => a.id)).toEqual(['c']); });
  it('offers all 13 transaction types', () => { expect(TXN_INTENTS).toHaveLength(13); });
});
