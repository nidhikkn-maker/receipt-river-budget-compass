import { expect, it } from 'vitest';
import { tripBudgetSummary, reimbursementBreakdown } from './trip-budget';
import { advanceReconciliation, advanceReconRows, bookingPaid, bookingOutstanding, tripBudgetDetail, type TravelTrip } from './travel';
import { travelReport } from './travel-reports';
const trip: TravelTrip={id:'t',name:'Sample',destination:'Sample',start:'2026-11-01',end:'2026-11-01',budget:0.6,currencies:['INR'],advances:[{id:'a',amount:0.6,date:'2026-11-01',source:'Sample'}],budgetLines:[{category:'Hotels',amount:0.6}],bookings:[{id:'b',kind:'hotel',provider:'Sample',ref:'Sample',date:'2026-11-01',amount:0.6,status:'unpaid',expenseIds:['e1','e2']}]};
const entries=[0.1,0.2].map((amount,i)=>({id:`e${i+1}`,title:'Sample',merchant:'Sample',date:'2026-11-01',txnType:'expense',tripId:'t',category:'Hotels',amount,originalAmount:amount,currency:'INR',fxRate:1,scope:'business',paymentMethod:'credit_card',reimbursementStatus:'pending'}));
it('booking, budget, reimbursements, advance reconciliation and report agree on the same fractional ledger without rewriting originals',()=>{
 const before=JSON.stringify(entries), rows=entries as never;
 const booking=trip.bookings?.[0]; if(!booking) throw Error('Missing fixture');
 expect(bookingPaid(booking,rows)).toBe(0.3);
 expect(bookingOutstanding(booking,rows)).toBe(0.3);
 expect(tripBudgetSummary(trip,rows)).toMatchObject({spent:0.3,committed:0.3,remaining:0.3,availableAfterCommitments:0,reimbursablePending:0.3});
 expect(tripBudgetDetail(trip,rows)).toMatchObject({spent:0.3,budgeted:0.6,remaining:0.3});
 expect(reimbursementBreakdown(trip,rows)).toMatchObject({personalCard:0.3,advances:0.6,pending:0.3});
 expect(advanceReconciliation(trip,rows)).toMatchObject({advances:0.6,expenses:0.3,returns:0,outstanding:0.3});
 expect(Number(advanceReconRows(trip,rows).at(-1)?.[3])).toBe(0.3);
 expect(travelReport('category',[trip],rows,{memberName:()=> 'Me',accountName:()=> 'Sample'}).rows.at(-1)).toEqual(['Total','0.30','100.00']);
 expect(JSON.stringify(entries)).toBe(before);
});