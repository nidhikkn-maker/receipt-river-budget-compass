import {describe,it,expect} from 'vitest';
import {discoverClaimExpenses,selectDiscovery} from './claim-discovery';
import {emptyReimbursementSettings} from './reimbursement-profiles';
import type {Expense} from './expenses';
import type {TravelTrip} from './travel';
const e:Expense={id:'e',title:'Hotel',merchant:'Test Hotel',amount:12000,originalAmount:12000,currency:'INR',fxRate:1,scope:'business',category:'Hotels',date:'2026-10-02',description:'Original imported narration',statementRef:'Bank original reference',paymentMethod:'credit_card',memberId:null,splits:[],receipts:[],tags:[],reconciledAt:null,reimbursementStatus:'pending'};
const trip={id:'t',name:'Audit visit',destination:'Test City',start:'2026-10-01',end:'2026-10-03',budget:0,currencies:[],organisation:'AET'} as TravelTrip;
const find=(entries:Expense[],rejected:string[]=[])=>discoverClaimExpenses({subject:{kind:'trip',id:'t'},entries,trips:[trip],organisation:'AET',settings:emptyReimbursementSettings(),rejected});
describe('V5.7 existing expense discovery',()=>{
 it('date-only evidence remains review and never auto-links',()=>{const rows=find([{...e,category:'Other',scope:'personal'}]);expect(rows[0]?.group).toBe('review');expect(rows[0]?.linked).toBe(false);expect(rows[0]?.entry.tripId).toBeUndefined();});
 it('explicit and legacy activity links are retrieved',()=>{expect(find([{...e,tripId:'t'}])[0]?.group).toBe('linked');expect(find([{...e,tags:['Trip: Audit visit']}])[0]?.linked).toBe(true);});
 it('organisation and booking evidence show reasons and preserve bank narration',()=>{const before=JSON.stringify(e);const rows=find([{...e,reimbursement:{payer:'AET'}}]);expect(rows[0]?.group).toBe('suggested');expect(rows[0]?.reasons).toContain('Saved responsibility: AET');expect(rows[0]?.imported).toBe(true);expect(JSON.stringify(e)).toBe(before);});
 it('rejected suggestions stay out until restored',()=>{expect(find([e],['e'])).toHaveLength(0);expect(find([e])).toHaveLength(1);});
 it('bulk selection never duplicates IDs or selects conflicting trips',()=>{const rows=find([e,{...e,id:'other',tripId:'another'}]);expect(selectDiscovery(['e'],rows)).toEqual(['e']);});
 it('card payments and transfers never enter discovery',()=>{expect(find([{...e,txnType:'card_payment'},{...e,id:'move',txnType:'transfer'}])).toHaveLength(0);});
 it('submitted and settled entries have a distinct group',()=>{expect(find([{...e,tripId:'t',reimbursement:{stage:'submitted'}}])[0]?.group).toBe('settled');expect(find([{...e,reimbursementStatus:'received'}])[0]?.group).toBe('settled');});
 it('project name and organisation matching work without trip assumptions',()=>{const rows=discoverClaimExpenses({subject:{kind:'tag',tag:'Project: Audit'},entries:[{...e,description:'Audit equipment purchase'}],trips:[],organisation:'',settings:emptyReimbursementSettings()});expect(rows[0]?.reasons).toContain('Activity name appears in existing narration');});
});