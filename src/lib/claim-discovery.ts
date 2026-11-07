import type { Expense } from './expenses';
import type { Subject } from './expenditure-statement';
import { subjectEntries } from './expenditure-statement';
import { smartTripSuggestions } from './trip-suggestions';
import { isTracked, outstandingOf, stageOf } from './reimbursements';
import type { TravelTrip } from './travel';
import { responsibilityShares, type ReimbursementSettings } from './reimbursement-profiles';

export type DiscoveryGroup = 'linked' | 'suggested' | 'review' | 'settled';
export interface DiscoveredExpense { entry: Expense; group: DiscoveryGroup; reasons: string[]; score: number; linked: boolean; imported: boolean; conflictingTrip: boolean }
export function discoverClaimExpenses(input: { subject: Subject; entries: Expense[]; trips: TravelTrip[]; organisation: string; settings: ReimbursementSettings; from?: string; to?: string; rejected?: string[] }): DiscoveredExpense[] {
 const linked = new Set(subjectEntries(input.subject,input.entries,input.trips).map(e=>e.id));
 const tripId = input.subject.kind === 'trip' ? input.subject.id : undefined;
 const trip = input.trips.find(t=>t.id===tripId);
 const from=input.from||trip?.start, to=input.to||trip?.end;
 return input.entries.filter(e=>(e.txnType??'expense')==='expense' && !(input.rejected??[]).includes(e.id)).flatMap(entry=>{
  const isLinked=linked.has(entry.id); const reasons:string[]=[]; let score=0;
  const during=!!from&&!!to&&entry.date>=from&&entry.date<=to;
  const organisations=responsibilityShares(entry,input.settings).map(p=>p.organisation);
  if(isLinked){score=100;reasons.push('Already linked to this activity');}
  if(!isLinked&&trip){const suggestion=smartTripSuggestions(entry,input.trips).find(s=>s.trip.id===trip.id);if(suggestion){score=suggestion.score;reasons.push(...suggestion.reasons);if(suggestion.ambiguous)reasons.push('Several trips have similar evidence');}}
  if(!isLinked&&during&&!reasons.some(r=>r.includes('date'))){score+=20;reasons.push('Date falls within the selected period — confirmation required');}
  if(input.organisation&&organisations.includes(input.organisation)){score+=25;reasons.push(`Saved responsibility: ${input.organisation}`);}
  if(input.subject.kind==='tag'&&!isLinked){const name=input.subject.tag.replace(/^\w+: /,'').trim();if(name.length>=4&&`${entry.title} ${entry.merchant??''} ${entry.description}`.toLowerCase().includes(name.toLowerCase())){score+=40;reasons.push('Activity name appears in existing narration');}}
  const conflictingTrip=!!trip&&!isLinked&&(!!entry.tripId||(entry.tags??[]).some(t=>t.startsWith('Trip: ')));
  if(conflictingTrip)reasons.push('Already associated with another trip');
  if(!isLinked&&score===0&&input.subject.kind!=='entries')return [];
  const settled=isTracked(entry)&&(outstandingOf(entry)<=0||['submitted','under_review'].includes(stageOf(entry)));
  return [{entry,linked:isLinked,score,reasons:reasons.length?reasons:['Manual selection from existing ledger'],imported:!!entry.statementRef||/^Imported from /i.test(entry.description),conflictingTrip,group:settled?'settled':isLinked?'linked':score>=40&&!conflictingTrip?'suggested':'review'} satisfies DiscoveredExpense];
 }).sort((a,b)=>b.score-a.score||b.entry.date.localeCompare(a.entry.date)||a.entry.id.localeCompare(b.entry.id));
}
export function selectDiscovery(ids:string[],visible:DiscoveredExpense[]){return [...new Set([...ids,...visible.filter(r=>!r.linked&&!r.conflictingTrip).map(r=>r.entry.id)])];}
export function claimSummary(statement:{summary:{total:number;personal:number;organisation:number;eligible:number;reimbursed:number;outstanding:number}}, advance:number){ return { total:statement.summary.total,personal:statement.summary.personal,organisation:statement.summary.organisation,eligible:statement.summary.eligible,received:statement.summary.reimbursed,outstanding:statement.summary.outstanding,advances:advance }; }