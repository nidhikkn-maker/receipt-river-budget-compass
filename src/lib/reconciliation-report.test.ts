import {it,expect} from 'vitest';
import {reconciliationReport} from './reconciliation-report';
import {accountStatementStatus} from './account-statement-status';
import {defaultPreferences} from './preferences';
it('exports absent checks as unverified without inventing closing or difference figures',()=>{
 const status=accountStatementStatus({id:'bank',name:'Bank',kind:'savings',openingBalance:1000,archived:false},[],[],defaultPreferences(),'2026-11-08');
 const r=reconciliationReport([status],[],[]);expect(r.rows[0]?.slice(4,9)).toEqual(['Not Started','Not Verified','','',0]);expect(r.rows[0]?.[15]).toContain('No historical import');
});