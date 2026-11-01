import type { ImportBatch, ImportRow } from './historical-import';
import type { StatementLine } from './expenses';

export function statementDateRange(lines: StatementLine[]) {
  const dates=lines.map(l=>l.date).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return {from:dates[0]??'',to:dates.at(-1)??''};
}
export function manifestBlockers(item:{accountId:string;currency:string;from:string;to:string;error?:string},activeAccounts:string[],today:string) {
  const errors:string[]=[];
  if(!activeAccounts.includes(item.accountId))errors.push('Confirm an active account');
  if(!/^[A-Z]{3}$/.test(item.currency))errors.push('Confirm statement currency');
  if(item.error)errors.push(item.error);
  if((item.from&&!item.to)||(!item.from&&item.to))errors.push('Confirm both period dates');
  if(item.from&&item.to&&(item.from<'2026-04-01'||item.to>today||item.from>item.to))errors.push('Statement period must be from 1 April 2026 through today');
  return errors;
}
export function overlappingStatements(batches:ImportBatch[]) {
  const pairs:{first:ImportBatch;second:ImportBatch}[]=[];
  for(let i=0;i<batches.length;i++)for(let j=i+1;j<batches.length;j++){
    const a=batches[i],b=batches[j];
    if(a&&b&&a.account_id===b.account_id&&a.currency===b.currency&&a.period_from&&a.period_to&&b.period_from&&b.period_to&&a.period_from<=b.period_to&&b.period_from<=a.period_to)pairs.push({first:a,second:b});
  }
  return pairs;
}
export function importResultCounts(rows:ImportRow[],posted:Set<string>,selectedIds:Set<string>,failed:boolean) {
  const selected=rows.filter(row=>selectedIds.has(row.id));
  return {recorded:selected.filter(row=>posted.has(row.fingerprint)).length,skipped:selected.filter(row=>!posted.has(row.fingerprint)&&(row.decision==='excluded'||row.duplicate_kind==='exact')).length,requiresReview:selected.filter(row=>!posted.has(row.fingerprint)&&row.decision==='review'&&row.duplicate_kind!=='exact').length,failed:failed?selected.filter(row=>!posted.has(row.fingerprint)&&row.decision==='approved'&&row.duplicate_kind!=='exact').length:0};
}