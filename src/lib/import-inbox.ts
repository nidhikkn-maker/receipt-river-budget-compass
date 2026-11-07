export interface ImportInboxItem {id:string;file_name:string;status:string}
export function importBatchSearch(search:Record<string,unknown>):{batch?:string} {
  const batch=search['batch'];
  return typeof batch==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batch)?{batch}:{};
}
export function groupImportInbox(items:ImportInboxItem[]) {
  return [
    {label:'Ready for review',items:items.filter(item=>item.status==='review')},
    {label:'Processing',items:items.filter(item=>['queued','processing'].includes(item.status))},
    {label:'Needs attention',items:items.filter(item=>['failed','paused','refused'].includes(item.status))},
  ].filter(group=>group.items.length>0);
}