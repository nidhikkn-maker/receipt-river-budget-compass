#!/usr/bin/env python3
"""Disposable local PostgreSQL, independent sessions. No Cloud credentials or network DB.
Staged SQL acceptance, NOT production/application rollout certification.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
OWNER = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
ROW1 = '00000000-0000-4000-8000-000000000011'
ROW2 = '00000000-0000-4000-8000-000000000012'
OP = '00000000-0000-4000-8000-000000000021'

def main():
    base = Path(tempfile.mkdtemp(prefix='statement-concurrency-', dir='/tmp'))
    data, sock = base/'data', base/'socket'
    sock.mkdir()
    unprivileged = ['runuser', '-u', 'nobody', '--'] if os.geteuid() == 0 else []
    if unprivileged:
        os.chown(base, 65534, 65534)
        os.chown(sock, 65534, 65534)
    subprocess.run(unprivileged + ['initdb', '-D', str(data), '-A', 'trust', '--no-locale'], check=True, capture_output=True)
    subprocess.run(unprivileged + ['pg_ctl', '-D', str(data), '-l', str(base/'server.log'), '-o', f"-k {sock} -h '' -p 55439", '-w', 'start'], check=True, capture_output=True)
    args = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(sock), '-p', '55439', '-U', 'nobody' if unprivileged else os.environ.get('USER', 'root'), '-d', 'postgres']
    def sql(query, ok=True):
        result = subprocess.run(args + ['-c', query], capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr)
        if not ok and not result.returncode: raise AssertionError('Expected transaction refusal')
        return result.stdout.strip()
    def actor(query, who=OWNER):
        return f"SET ROLE authenticated; SELECT set_config('test.uid','{who}',false); {query}"
    def reset():
        sql(f"TRUNCATE expenses,statement_undo_receipts; INSERT INTO expenses(id,employee_id,amount,statement_ref) VALUES('{ROW1}','{OWNER}',250,'document:d · a'),('{ROW2}','{OWNER}',480,'document:d · b');")
    def manifest():
        return json.loads(sql("SELECT jsonb_agg(jsonb_build_object('action','delete','ref',statement_ref,'snapshot',to_jsonb(e)) ORDER BY id) FROM expenses e"))
    def call(items, op=OP):
        return f"SELECT undo_statement_rows('{op}','{json.dumps(items).replace(chr(39),chr(39)*2)}'::jsonb)"
    passed = []
    try:
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
        CREATE TABLE accounts(id uuid PRIMARY KEY,owner_id uuid);
        CREATE TABLE expenses(id uuid PRIMARY KEY,employee_id uuid,amount numeric,statement_ref text,reconciled_at timestamptz,transfer_counterpart_of uuid,correction_revision bigint DEFAULT 0);
        ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
        GRANT SELECT,UPDATE,DELETE ON expenses TO authenticated;
        CREATE POLICY own ON expenses USING(employee_id=auth.uid()) WITH CHECK(employee_id=auth.uid());
        CREATE FUNCTION bump() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.correction_revision:=OLD.correction_revision+1; RETURN NEW; END$$;
        CREATE TRIGGER bump BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION bump();""")
        sql((ROOT/'.lovable/staged-sql/statement-atomic-undo.sql').read_text())
        reset(); items = manifest()
        sql(actor(call(items), OTHER), ok=False)
        assert sql('SELECT sum(amount) FROM expenses') == '730'
        passed.append('foreign owner refused, balances unchanged')
        reset(); items = manifest()
        sql(f"UPDATE expenses SET amount=481 WHERE id='{ROW2}'")
        sql(actor(call(items)), ok=False)
        assert sql('SELECT count(*) FROM expenses') == '2'
        passed.append('later financial edit with unchanged source blocks entire Undo')
        reset(); items = manifest()
        sql(f"UPDATE expenses SET amount=481 WHERE id='{ROW2}'; UPDATE expenses SET amount=480 WHERE id='{ROW2}'")
        sql(actor(call(items)), ok=False)
        passed.append('ABA revision change refused')
        reset(); items = manifest()
        # Actual trigger failure AFTER the first deletion: PostgreSQL rolls back every row and receipt.
        sql(f"CREATE FUNCTION fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.id='{ROW2}'::uuid THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN OLD; END$$; CREATE TRIGGER fail_delete BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION fail_delete();")
        sql(actor(call(items)), ok=False)
        assert sql('SELECT count(*) FROM expenses') == '2'
        assert sql('SELECT count(*) FROM statement_undo_receipts') == '0'
        sql('DROP TRIGGER fail_delete ON expenses')
        sql(actor(call(items)))
        assert sql('SELECT count(*) FROM expenses') == '0'
        passed.append('mid-Undo rollback and retry succeeds')
        reset(); items = manifest()
        # Hold the first transaction after committing its mutations but before COMMIT.
        first = subprocess.Popen(args + ['-c', 'BEGIN; '+actor(call(items))+"; SELECT pg_sleep(1.5); COMMIT;"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for _ in range(150):
            if sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep'") == '1': break
            time.sleep(.02)
        else: raise AssertionError('First Undo did not reach lock holding point')
        start = time.monotonic()
        second = subprocess.Popen(args + ['-c', actor(call(items))], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        _, err2 = second.communicate(timeout=10)
        _, err1 = first.communicate(timeout=10)
        assert first.returncode == second.returncode == 0, (err1, err2)
        assert time.monotonic()-start > .8, 'Second session did not wait for lock'
        assert sql('SELECT count(*) FROM expenses') == '0'
        assert sql('SELECT count(*) FROM statement_undo_receipts') == '1'
        # Lost success response replay and different simultaneous intent both remain safe.
        sql(actor(call(items)))
        sql(actor(call(items, '00000000-0000-4000-8000-000000000022')), ok=False)
        assert sql('SELECT count(*) FROM statement_undo_receipts') == '1'
        passed.append('independent concurrent sessions wait, replay one receipt, no double reversal')
        reset(); items = manifest()
        editor = subprocess.Popen(args + ['-c', f"BEGIN; UPDATE expenses SET amount=481 WHERE id='{ROW2}'; SELECT pg_sleep(1.5); COMMIT;"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for _ in range(150):
            if sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep'") == '1': break
            time.sleep(.02)
        else: raise AssertionError('Edit did not lock row')
        sql(actor(call(items)), ok=False)
        _, err = editor.communicate(timeout=10)
        assert editor.returncode == 0, err
        assert sql('SELECT sum(amount) FROM expenses') == '731'
        passed.append('concurrent direct edit wins safely, whole Undo refused')
        print(json.dumps({'passed': len(passed), 'cases': passed, 'scope': 'disposable multi-session PostgreSQL; staged function only'}, indent=2))
    finally:
        subprocess.run(unprivileged + ['pg_ctl', '-D', str(data), '-m', 'immediate', '-w', 'stop'], capture_output=True)
        shutil.rmtree(base)

if __name__ == '__main__': main()