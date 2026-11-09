// Test-only: builds an isolated in-memory Postgres (PGlite) with Supabase-like stubs (auth, storage,
// roles) and replays every applied migration in drizzle/migrations, optionally followed by proposed
// SQL files. Never connects to Cloud. Used by security and accounting migration acceptance tests.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const STUBS = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE authenticator; CREATE ROLE supabase_admin; CREATE ROLE supabase_auth_admin;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, is_anonymous boolean default false, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now(), phone text, last_sign_in_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('is_anonymous', coalesce(nullif(current_setting('test.anon',true),'')::boolean,false), 'email', current_setting('test.email',true)) $$;
CREATE TABLE storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz, version text);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;`;

export const appliedMigrations = () => readdirSync(join(ROOT, "drizzle/migrations")).filter((f) => f.endsWith(".sql")).sort();
export const readSql = (relPath: string) => readFileSync(join(ROOT, relPath), "utf8").replace(/--> statement-breakpoint/g, "");

/** Fresh isolated database with all applied migrations (0000-NNNN). Throws if any migration fails. */
export async function fullSchemaDb(extraSqlFiles: string[] = []) {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of [...appliedMigrations().map((f) => `drizzle/migrations/${f}`), ...extraSqlFiles]) {
    try { await db.exec(readSql(f)); } catch (e) { throw new Error(`${f}: ${(e as Error).message}`); }
  }
  return db;
}

/** Run as a signed-in user under RLS (role authenticated), or as the superuser when uid is null. */
export async function actAs(db: PGlite, uid: string | null) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
  if (uid) await db.exec("SET ROLE authenticated");
}

/** Insert confirmed auth users (profiles are created by the signup trigger). */
export async function addUsers(db: PGlite, users: Record<string, string>) {
  await actAs(db, null);
  for (const [id, email] of Object.entries(users)) await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,$2,now())", [id, email]);
}
