import { describe,expect,it } from 'vitest';
import { statementDateRange,manifestBlockers,overlappingStatements,importResultCounts } from './import-manifest';
import type { ImportBatch,ImportRow } from './historical-import';

describe('Statement manifest and outcomes',()=>{
  it('detects transaction range without claiming full month coverage',()=>expect(statementDateRange([{date:'2026-04-20',amount:500,description:'a',ref:'a'},{date:'2026-04-05',amount:200,description:'b',ref:'b'}])).toEqual({from:'2026-04-05',to:'2026-04-20'}));
  it('requires an active account for every file',()=>expect(manifestBlockers({accountId:'closed',currency:'INR',from:'',to:''},['bank'],'2026-11-01')).toContain('Confirm an active account'));
  it('rejects dates outside the historical baseline',()=>expect(manifestBlockers({accountId:'bank',currency:'INR',from:'2026-03-31',to:'2026-04-30'},['bank'],'2026-11-01')).toContain('Statement period must be from 1 April 2026 through today'));
  it('permits undetected PDF periods to be reviewed after extraction',()=>expect(manifestBlockers({accountId:'bank',currency:'INR',from:'',to:''},['bank'],'2026-11-01')).toEqual([]));
  it('reports overlaps only within the same account and currency',()=>{
    const a={id:'a',account_id:'bank',currency:'INR',period_from:'2026-04-01',period_to:'2026-04-30'} as ImportBatch;
    const b={...a,id:'b',period_from:'2026-04-20',period_to:'2026-05-20'};
    expect(overlappingStatements([a,b,{...b,id:'c',account_id:'card'},{...b,id:'d',currency:'USD'}]).map(p=>[p.first.id,p.second.id])).toEqual([['a','b']]);
  });
  it('recovers acknowledged and unacknowledged posts from persisted fingerprints',()=>{
    const rows=[{id:'a',fingerprint:'a',decision:'approved',duplicate_kind:'new'},{id:'b',fingerprint:'b',decision:'approved',duplicate_kind:'new'},{id:'c',fingerprint:'c',decision:'review',duplicate_kind:'new'},{id:'d',fingerprint:'d',decision:'excluded',duplicate_kind:'new'}] as ImportRow[];
    expect(importResultCounts(rows,new Set(['a']),new Set(['a','b','c','d']),true)).toEqual({recorded:1,skipped:1,requiresReview:1,failed:1});
    expect(importResultCounts(rows,new Set(['a','b']),new Set(['a','b','c','d']),false)).toEqual({recorded:2,skipped:1,requiresReview:1,failed:0});
  });
});