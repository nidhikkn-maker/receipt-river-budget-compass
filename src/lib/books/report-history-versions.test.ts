// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
const db=new PGlite();
const owner='00000000-0000-0000-0000-000000000001';
const insert=(id:number,from:string|null='2026-11-01',to:string|null='2026-11-30',who=owner)=>db.query<{version:number}>(`INSERT INTO report_history(id,owner_id,kind,period_from,period_to,filters,file_path,file_size,version) VALUES($1,$2,'monthly',$3,$4,'{}',$5,13,1) RETURNING version`,[`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`,who,from,to,`${who}/reports/${id}.pdf`]);
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE report_history(id uuid PRIMARY KEY,owner_id uuid,kind text,period_from date,period_to date,filters jsonb,file_path text,file_size int,version int);`);
 await db.exec(readFileSync('.lovable/staged-sql/report-history-versions.sql','utf8'));
});
afterAll(()=>db.close());
it('assigns versions from the highest retained version rather than stale client counts after an older deletion',async()=>{
 expect((await insert(10)).rows[0]?.version).toBe(1);expect((await insert(11)).rows[0]?.version).toBe(2);
 await db.exec("DELETE FROM report_history WHERE version=1");
 expect((await insert(12)).rows[0]?.version).toBe(3);
});
it('separates owners and null-period streams, rejects duplicate evidence replacement',async()=>{
 expect((await insert(13,null,null)).rows[0]?.version).toBe(1);expect((await insert(14,null,null)).rows[0]?.version).toBe(2);
 expect((await insert(15,'2026-11-01','2026-11-30','00000000-0000-0000-0000-000000000002')).rows[0]?.version).toBe(1);
 await expect(insert(12)).rejects.toThrow(/duplicate key/);
 await expect(insert(12,'2026-10-01')).rejects.toThrow(/different evidence/);
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM report_history')).rows[0]?.n).toBe(5);
});