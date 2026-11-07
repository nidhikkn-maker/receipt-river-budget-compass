// @vitest-environment node
// Internal reference table RLS (migration 0087) in isolated in-memory PostgreSQL:
// never contacts Lovable Cloud or touches real records.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const db = new PGlite();
const REAL = "00000000-0000-0000-0000-00000000000a";
const GUEST = "00000000-0000-0000-0000-00000000000b";

/** Run as a signed-in person (real or guest) with RLS applied. */
async function as<T = Record<string, unknown>>(uid: string, anonymous: boolean, sql: string): Promise<T[]> {
  await db.exec(
    `RESET ROLE; SELECT set_config('app.uid','${uid}',false); SELECT set_config('app.anon','${anonymous}',false); SET ROLE authenticated;`,
  );
  try { return (await db.query<T>(sql)).rows; } finally { await db.exec("RESET ROLE;"); }
}

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('is_anonymous', coalesce(nullif(current_setting('app.anon',true),'')::boolean, false)) $$;
    CREATE TABLE public.job_state(name text primary key, status text not null, reason text, last_success timestamptz, last_run timestamptz, lease_until timestamptz not null, detail jsonb not null default '{}');
    CREATE TABLE public.regulatory_changes(id uuid primary key default gen_random_uuid(), source_id text not null, url text not null, detected_at timestamptz not null, previous_fingerprint text, fingerprint text not null, summary text not null, proposals jsonb not null default '[]');
    CREATE TABLE public.regulatory_snapshots(source_id text not null, url text not null, fingerprint text not null, excerpt text not null, fetched_at timestamptz not null);
    CREATE TABLE public.market_quotes(exchange text not null, symbol text not null, close numeric not null, price_date date not null, source text not null, fetched_at timestamptz not null);
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT ON public.job_state, public.regulatory_changes, public.regulatory_snapshots, public.market_quotes TO authenticated;
    ALTER TABLE public.job_state ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.regulatory_changes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.regulatory_snapshots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.market_quotes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Signed-in users read job status" ON public.job_state FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
    CREATE POLICY "Signed-in users read detected rule changes" ON public.regulatory_changes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
    CREATE POLICY "Signed-in users read rule snapshots" ON public.regulatory_snapshots FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
    CREATE POLICY "Signed-in users read exchange closing prices" ON public.market_quotes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
    INSERT INTO public.job_state(name, status, lease_until) VALUES ('closing-prices','ok', now());
    INSERT INTO public.regulatory_changes(source_id, url, detected_at, fingerprint, summary) VALUES ('cbic','https://x', now(), 'fp', 'change');
    INSERT INTO public.regulatory_snapshots VALUES ('cbic','https://x','fp','excerpt', now());
    INSERT INTO public.market_quotes VALUES ('NSE','RELIANCE', 1000, '2026-11-06', 'test', now());
  `);
  // Apply the real migration file so the tested SQL is exactly what runs in Cloud.
  await db.exec(readFileSync("drizzle/migrations/0087_internal_reference_rls.sql", "utf8"));
});

afterAll(() => db.close());

describe("internal reference tables after 0087", () => {
  it("real accounts still read job status and detected rule changes", async () => {
    expect((await as(REAL, false, `SELECT name FROM public.job_state`)).length).toBe(1);
    expect((await as(REAL, false, `SELECT source_id FROM public.regulatory_changes`)).length).toBe(1);
  });
  it("guests can no longer read job status or detected rule changes", async () => {
    expect((await as(GUEST, true, `SELECT name FROM public.job_state`)).length).toBe(0);
    expect((await as(GUEST, true, `SELECT source_id FROM public.regulatory_changes`)).length).toBe(0);
  });
  it("rule snapshots are no longer readable by any signed-in user", async () => {
    await expect(as(REAL, false, `SELECT source_id FROM public.regulatory_snapshots`)).rejects.toThrow();
  });
  it("public closing prices stay readable, including by guests", async () => {
    expect((await as(REAL, false, `SELECT symbol FROM public.market_quotes`)).length).toBe(1);
    expect((await as(GUEST, true, `SELECT symbol FROM public.market_quotes`)).length).toBe(1);
  });
});
