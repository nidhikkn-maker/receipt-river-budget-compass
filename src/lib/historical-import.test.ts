import { describe, it, expect } from 'vitest';
import { merchantFamily, stageImport, reconcileStatement, coverageMonths, historicalOpeningFor, postingBlockers, HISTORICAL_START, orientStatementMove } from './historical-import';
import { fingerprintLines } from './statement-fingerprint';
import { cashflow, accountBalance, type Account } from './ledger';
import type { Expense } from './expenses';
const account: Account = { id:'bank', name:'Bank', kind:'savings', openingBalance:0, archived:false };
const lines = [{ ref:'1', date:'2026-04-01', description:'SWIGGY ORDER', amount:100, direction:'debit' as const }, { ref:'2', date:'2026-04-01', description:'SWIGGY ORDER', amount:100, direction:'debit' as const }];
const ctx = { accounts:[account], transactions:[] as Expense[], categories:[{name:'Food and beverages',archived:false}], accountId:'bank',currency:'INR' };
describe('V5.1 historical import safeguards', () => {
  it('starts on 1 April 2026', () => expect(HISTORICAL_START).toBe('2026-04-01'));
  it('groups merchant variants without losing original descriptions', () => { expect(merchantFamily('SWIGGY INSTAMART')).toBe(merchantFamily('SWIGGY UPI')); expect(stageImport(lines,ctx,[],new Set())[0]?.line.description).toBe('SWIGGY ORDER'); });
  it('preserves two legitimate identical payments', () => expect(new Set(fingerprintLines(lines,'bank')).size).toBe(2));
  it('holds repeated statement lines as exact duplicates', () => expect(stageImport(lines,ctx,[],new Set(fingerprintLines(lines,'bank'))).every(r => r.duplicate_kind==='exact')).toBe(true));
  it('applies only user-created enabled rules', () => { const rule={id:'r',merchant:'Swiggy',account_id:null,mappings:{scope:'official' as const,category:'Food and beverages'},enabled:true}; expect(stageImport(lines,ctx,[rule],new Set())[0]?.proposal.scope).toBe('official'); expect(stageImport(lines,ctx,[{...rule,enabled:false}],new Set())[0]?.proposal.scope).toBe('personal'); });
  it('conflicting rules require a decision', () => { const base={id:'r',merchant:'Swiggy',account_id:null,enabled:true}; expect(stageImport(lines,ctx,[{...base,mappings:{scope:'official'}},{...base,id:'r2',mappings:{scope:'business'}}],new Set())[0]?.review_group).toBe('Needs your decision'); });
  it('reconciles without inventing missing transactions', () => { const result=reconcileStatement(1000,750,lines,false); expect(result.importedBalance).toBe(800); expect(result.difference).toBe(-50); expect(result.verified).toBe(false); expect(lines).toHaveLength(2); });
  it('card purchases increase liabilities and payments reduce them', () => expect(reconcileStatement(500,700,lines,true).verified).toBe(true));
  it('displays missing months since April 2026', () => expect(coverageMonths([{period_from:'2026-04-01',period_to:'2026-04-30'}],'2026-06-20').missing).toEqual(['2026-05','2026-06']));
  it('does not double-count pre-baseline entries', () => { const tx=[{id:'t',date:'2026-03-31',amount:100,accountId:'bank',txnType:'expense'}] as Expense[]; const opening=historicalOpeningFor(account,tx,1000,HISTORICAL_START); expect(accountBalance({...account,openingBalance:opening},tx)).toBe(1000); });
  it('optional merchant and tags do not block reviewed rows', () => { const staged=stageImport(lines,ctx,[],new Set())[0]; if(!staged) throw Error('Missing fixture'); expect(postingBlockers({...staged,id:'r',proposal:{...staged.proposal,merchant:null,tags:[],reviewed:true}},[account],'2026-11-01')).toEqual([]); });
  it('uncertain accounting cannot post unreviewed', () => { const staged=stageImport([{date:'2026-04-01',amount:100,direction:'debit',ref:'t',description:'SELF TRANSFER'}],ctx,[],new Set())[0]; if(!staged) throw Error('Missing fixture'); expect(postingBlockers({...staged,id:'r'},[account],'2026-11-01')).toContain('Confirm destination account'); });
  it('transfers and card settlements never inflate income or expenditure', () => expect(cashflow([{id:'t',amount:100,date:'2026-04-01',txnType:'transfer'},{id:'c',amount:100,date:'2026-04-01',txnType:'card_payment'}],'2026-04-01','2026-04-30')).toMatchObject({income:0,spent:0}));
  it('a credited transfer arrives at the statement account instead of leaving it',()=>{const row=stageImport(lines,ctx,[],new Set())[0];if(!row)throw Error('Missing fixture');expect(orientStatementMove({...row.proposal,txnType:'transfer',accountId:'bank',toAccountId:'cash'},'credit','bank')).toMatchObject({accountId:'cash',toAccountId:'bank'});});
});
import { importReconciliationSummary as recSummary } from './historical-import';
describe('importReconciliationSummary', () => {
  const row = (id: string, amount: number, direction: 'credit' | 'debit') => ({ id, fingerprint: 'f' + id, line: { date: '2026-04-02', description: id, amount, direction }, proposal: {}, review_group: '', confidence: '', decision: 'approved', duplicate_kind: 'new', duplicate_id: null }) as never;
  it('balances when all lines import and closing matches', () => {
    const s = recSummary({ opening: 1000, closing: 1300, rows: [row('a', 500, 'credit'), row('b', 200, 'debit')], posted: new Set(), importingIds: new Set(['a', 'b']), liability: false });
    expect(s.credits).toBe(500); expect(s.debits).toBe(200); expect(s.expectedClosing).toBe(1300); expect(s.balanceAfterImport).toBe(1300); expect(s.discrepancies).toEqual([]);
  });
  it('flags closing mismatch and lines left unimported', () => {
    const s = recSummary({ opening: 1000, closing: 1250, rows: [row('a', 500, 'credit'), row('b', 200, 'debit')], posted: new Set(), importingIds: new Set(['a']), liability: false });
    expect(s.difference).toBe(-50); expect(s.balanceAfterImport).toBe(1500); expect(s.notImportedCount).toBe(1); expect(s.discrepancies).toHaveLength(2);
  });
  it('flags printed balance differences and missing balances', () => {
    expect(recSummary({ opening: 1000, closing: null, sourceOpening: 900, rows: [], posted: new Set(), importingIds: new Set(), liability: false }).discrepancies).toEqual(['Closing balance is missing', "Opening balance differs from the statement's printed opening by 100"]);
  });
});
