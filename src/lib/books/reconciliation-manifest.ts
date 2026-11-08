import type { AuditItem } from './audit';
import type { Report } from '../reports';
/** Every compared input, without the display limit; JSON preserves numeric signs and identities. */
export function reconciliationManifest(items: AuditItem[]) {
  return {version:1,comparisons:items.filter(i=>i.comparison).map(i=>({key:i.key,entity:i.entity,fy:i.fy,comparison:i.comparison}))};
}
export function reconciliationManifestReport(items:AuditItem[]):Report {
  return {title:'Reconciliation comparison evidence',headers:['Finding ID','Company','FY','Family','Registration','From','To','Side','Compared total','Difference','Input kind','Input ID','Input label','Input date','Input amount','Document IDs','Original references','Unresolved evidence'],rows:items.flatMap(i=>{
    const c=i.comparison;if(!c)return [];
    return [c.left,c.right].flatMap(side=>(side.inputs.length?side.inputs:[null]).map(input=>[i.key,i.entity,i.fy??'',c.family,c.registration??'',c.from,c.to,side.label,side.amount,c.difference,input?.kind??'',input?.id??'',input?.label??'No participating records',input?.date??'',input?.amount??'',input?.documentIds.join('; ')??'',input?.sourceRefs.join('; ')??'',c.unresolved.join('; ')]));
  })};
}