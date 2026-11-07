// @vitest-environment node
// Production reviewed-save SQL in disposable PostgreSQL; no hosted writes or signing adapters.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkpointUpload, type UploadHistoryApi } from './history';
import { defaultPreferences, type FinancePreferences, type StatementUpload } from '../preferences';

it('two sessions, stale revision and lost response retain unrelated preferences, all confirmed sources and completed state', async () => {
  const db = new PGlite();
  const owner='00000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb NOT NULL,revision bigint NOT NULL DEFAULT 0,updated_at timestamptz);
      CREATE FUNCTION bump() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.revision:=OLD.revision+1; RETURN NEW; END $$;
      CREATE TRIGGER bump BEFORE UPDATE ON finance_preferences FOR EACH ROW EXECUTE FUNCTION bump();
      GRANT SELECT ON finance_preferences TO authenticated; ALTER TABLE finance_preferences ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own ON finance_preferences USING(owner_id=auth.uid());`);
    await db.exec(readFileSync('drizzle/migrations/0080_reviewed_preference_saves.sql','utf8'));
    await db.query('INSERT INTO finance_preferences(owner_id,data) VALUES($1,$2)',[owner,JSON.stringify(defaultPreferences)]);
    await db.query("SELECT set_config('test.uid',$1,false)",[owner]);await db.exec('SET ROLE authenticated');
    const read:UploadHistoryApi['read']=async()=>{
      const row=(await db.query<{data:FinancePreferences;revision:number}>('SELECT data,revision::int FROM finance_preferences')).rows[0];
      if(!row)throw Error('Owner preferences unavailable');return row;
    };
    let conflict=true, lost=true;
    const api:UploadHistoryApi={read,write:async(data,revision,id)=>{
      if(conflict){conflict=false;const current=await read();await db.query('SELECT save_reviewed_preferences($1,$2,$3,false)',[crypto.randomUUID(),JSON.stringify({...current.data,tags:['Other device change']}),current.revision]);}
      await db.query('SELECT save_reviewed_preferences($1,$2,$3,false)',[id,JSON.stringify(data),revision]);
      if(lost){lost=false;throw Error('Response lost after commit');}
    }};
    const upload:StatementUpload={id:'run',at:'2026-11-07',label:'original.csv',posted:['p1'],reconciled:[],createdAccounts:[],sources:[{documentId:'source',accountId:'bank',file:'original.csv'}],status:'interrupted'};
    await checkpointUpload(upload,api);
    await checkpointUpload({...upload,posted:['p2'],status:'complete'},api);
    // A late device sends its earlier partial checkpoint; it cannot downgrade or erase the completed run.
    await checkpointUpload(upload,api);
    const saved=await read();
    expect(saved.data.tags).toEqual(['Other device change']);
    expect(saved.data.statementUploads).toHaveLength(1);
    expect(saved.data.statementUploads?.[0]).toMatchObject({posted:['p1','p2'],status:'complete',sources:upload.sources});
    await db.query("SELECT set_config('test.uid',$1,false)",['00000000-0000-4000-8000-000000000002']);
    await expect(checkpointUpload(upload,api)).rejects.toThrow('Owner preferences unavailable');
    await db.exec('RESET ROLE');
    expect((await db.query('SELECT data FROM finance_preferences')).rows).toHaveLength(1);
  }finally{await db.close();}
},20000);

it('persistent checkpoint failure stops after three attempts instead of claiming progress synced',async()=>{
  let writes=0;
  await expect(checkpointUpload({id:'run',at:'2026-11-07',label:'file',posted:[],reconciled:[],createdAccounts:[]},{read:async()=>({data:defaultPreferences,revision:0}),write:async()=>{writes++;throw Error('Network offline');}})).rejects.toThrow('Network offline');
  expect(writes).toBe(3);
});