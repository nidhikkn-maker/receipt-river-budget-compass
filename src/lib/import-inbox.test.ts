import {describe,expect,it} from 'vitest';
import {groupImportInbox,importBatchSearch} from './import-inbox';
describe('Import inbox recovery',()=>{
  it('links only a valid batch identity without action parameters',()=>{
    expect(importBatchSearch({batch:'12cbd156-f539-4122-8591-8e3f9c6709c1',post:true})).toEqual({batch:'12cbd156-f539-4122-8591-8e3f9c6709c1'});
    expect(importBatchSearch({batch:'invalid'})).toEqual({});
  });
  it('keeps ready, active and failed jobs distinct and hides cancelled jobs',()=>{
    const items=['review','queued','processing','failed','paused','refused','cancelled'].map((status,i)=>({id:String(i),file_name:String(i),status}));
    expect(groupImportInbox(items).map(group=>group.items.map(item=>item.id))).toEqual([['0'],['1','2'],['3','4','5']]);
  });
});