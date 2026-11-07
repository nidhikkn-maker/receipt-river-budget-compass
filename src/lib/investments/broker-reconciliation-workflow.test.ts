// @vitest-environment node
// Real-format synthetic CSV → real parsers → isolated PostgreSQL readback → cash/quantity/net-worth checks.
// No hosted persistence, AI or real records. Missing corporate-action quantities remain unresolved.
import { PGlite } from '@electric-sql/pglite';
import { expect,it } from 'vitest';
import { readStatement } from '../statement-import';
import { fromStatementLines } from '../statement-pipeline/line';
import { brokerCashReconciliation } from './broker-reconciliation';
import { applyCorporateActions } from '../books/recon';
import { parseInvestmentDoc,mergeInvestmentDoc } from './demat';
import { cashflow,netWorth,type Account } from '../ledger';
import type { Expense } from '../expenses';
it('cash transfers, securities, fee and bonus evidence reconcile after persistence/reload without counting transfer as income',async()=>{
 const csv='Date,Description,Debit,Credit\n2026-10-01,NEFT FUNDING UTRABC,,1000\n2026-10-02,RELIANCE BUY,600,\n2026-10-03,BROKERAGE FEE,10,\n2026-10-04,RELIANCE DIVIDEND,,20\n';
 const lines=fromStatementLines('broker.csv',await readStatement(new File([csv],'broker.csv')));
 expect(lines).toHaveLength(4);
 const bank:Account={id:'bank',name:'Bank',kind:'savings',openingBalance:2000,archived:false};
 const cash:Account={id:'cash',name:'Broker cash',kind:'wallet',openingBalance:0,archived:false};
 const investment:Account={id:'securities',name:'Securities',kind:'investment',openingBalance:0,archived:false};
 const base={date:'2026-10-01',title:'',merchant:null,description:'',category:'Other',scope:'personal' as const,memberId:null,splits:[],currency:'INR',fxRate:1,paymentMethod:'bank_transfer' as const,receipts:[],reconciledAt:null,statementRef:null};
 const entries:Expense[]=[{...base,id:'fund',title:'NEFT FUNDING UTRABC',amount:1000,originalAmount:1000,txnType:'transfer',accountId:'bank',toAccountId:'cash'},
 {...base,id:'buy',date:'2026-10-02',title:'RELIANCE BUY',amount:600,originalAmount:600,txnType:'transfer',accountId:'cash',toAccountId:'securities'},
 {...base,id:'fee',date:'2026-10-03',title:'BROKERAGE FEE',amount:10,originalAmount:10,txnType:'expense',accountId:'cash'},
 {...base,id:'dividend',date:'2026-10-04',title:'RELIANCE DIVIDEND',amount:20,originalAmount:20,txnType:'income',accountId:'cash'}];
 const db=new PGlite();try{
  await db.exec('CREATE TABLE ledger(id text PRIMARY KEY,data jsonb);CREATE TABLE holdings(id text PRIMARY KEY,data jsonb);');
  for(const e of entries)await db.query('INSERT INTO ledger VALUES($1,$2::jsonb)',[e.id,JSON.stringify(e)]);
  const doc=parseInvestmentDoc(['Demat holding statement','Holding as on 04-10-2026','INE002A01018 RELIANCE 8 640']);if(!doc)throw Error('No demat');
  const merged=mergeInvestmentDoc([],doc,'original-dem');await db.query("INSERT INTO holdings VALUES('dem',$1::jsonb)",[JSON.stringify(merged.holdings)]);
  const reloaded=(await db.query<{data:Expense}>('SELECT data FROM ledger')).rows.map(r=>r.data);
  const result=brokerCashReconciliation(lines,cash,reloaded,410);expect(result.missing).toBe(0);expect(result.difference).toBe(0);
  expect(cashflow(reloaded)).toMatchObject({income:20,spent:10});expect(netWorth([bank,cash,investment],reloaded).net).toBe(2010);
  const action=applyCorporateActions(6,[{date:'2026-10-03',isin:'INE002A01018',kind:'bonus',quantity:2}]);expect(action.quantity).toBe(8);
  expect(mergeInvestmentDoc(merged.holdings,doc,'original-dem').added.holdings).toBe(0);
  expect(brokerCashReconciliation(lines,cash,[...reloaded,{...reloaded[2],id:'rival'} as Expense],410).rows.find(r=>r.line.description==='BROKERAGE FEE')?.state).toBe('ambiguous');
  expect(applyCorporateActions(6,[{date:'2026-10-03',isin:'INE002A01018',kind:'split',quantity:null}]).unresolved).toHaveLength(1);
 }finally{await db.close();}
},20000);