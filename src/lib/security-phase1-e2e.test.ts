// @vitest-environment node
// Phase 1 end-to-end security tests for sensitive actions. Isolated PGlite only (applied migrations + the
// PROPOSED P1+P2+P4 SQL); nothing connects to Lovable Cloud. The server logic under test is the real handler
// core (passkey-server.ts, step-up-server.ts) with REAL @simplewebauthn/server verification, driven by a
// software authenticator (P-256 key from node:crypto) whose registration goes through the app's own path,
// so the stored public key has exactly the app's encoding (base64 of the COSE key).
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";
import { passkeyOptionsCore, verifyPasskeyCore, type PasskeyDeps } from "./passkey-server";
import {
  assertStepUpMethod, createSharedStepUpLimiter, recordStepUp, verifyEmailCodeStepUp, verifyPasswordStepUp,
  type RpcClient, type StepUpLimiter,
} from "./step-up-server";

const DIR = ".lovable/staged-sql/proposed/";
const FILES = [`${DIR}P1_security_containment.sql`, `${DIR}P2_v31_role_model.sql`, `${DIR}P4_step_up_and_assistant_limits.sql`];
const T = 240_000;
const RP = { rpID: "ledgerline.biz", origin: "https://ledgerline.biz" };
const uid = (n: number) => `0000e2e0-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = (n: number) => `5e550000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MCP = "mcp-client-e2e";

type Who = { uid: string; sessionId?: string; clientId?: string };
type Db = PGlite;

// ------------------------------------------------------------------------------------------------
// Database access as the server would do it: the caller's token (authenticated + RLS) or the service role.
// ------------------------------------------------------------------------------------------------
async function asUser<R>(db: Db, who: Who, fn: () => Promise<R>): Promise<R> {
  await actAs(db, who.uid, { ...(who.sessionId ? { sessionId: who.sessionId } : {}), ...(who.clientId ? { clientId: who.clientId } : {}) });
  try { return await fn(); } finally { await actAs(db, null); }
}
async function asService<R>(db: Db, fn: () => Promise<R>): Promise<R> {
  await actAs(db, null);
  await db.exec("SET ROLE service_role");
  try { return await fn(); } finally { await actAs(db, null); }
}
const rows = async <R = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
async function errorOf(p: Promise<unknown>): Promise<string> {
  try { await p; return ""; } catch (e) { return String((e as Error).message); }
}
/** A supabase-like `rpc` backed by PGlite as the service role (named arguments, { data, error }). */
function serviceRpc(db: Db): RpcClient {
  return {
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      if (!/^[a-z_]+$/.test(fn)) throw new Error(`bad function ${fn}`);
      const keys = Object.keys(args);
      if (!keys.every((k) => /^_[a-z]+$/.test(k))) throw new Error("bad argument name");
      return asService(db, async () => {
        try {
          const r = await rows<{ r: unknown }>(db, `SELECT public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) AS r`, keys.map((k) => args[k]));
          return { data: r[0]?.r ?? null, error: null };
        } catch (e) {
          const x = e as Error & { code?: string };
          return { data: null, error: { message: x.message, ...(x.code ? { code: x.code } : {}) } };
        }
      });
    },
  };
}
type SvcResult = { data: unknown; error: { message: string; code?: string } | null };
/** Calls a database function as the service role through the same rpc shape the server uses. */
const svc = (fn: string, args: Record<string, unknown>) => (serviceRpc(db).rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<SvcResult>)(fn, args);
const noFallback: StepUpLimiter = { begin: async () => { throw new Error("the in-memory fallback must not be used when the database limiter exists"); } };
const sharedLimiter = (db: Db) => createSharedStepUpLimiter(serviceRpc(db), noFallback);
const claimsOf = (w: Who) => ({ sub: w.uid, ...(w.sessionId ? { session_id: w.sessionId } : {}), ...(w.clientId ? { client_id: w.clientId } : {}) });

/** The production dependency wiring of passkeys.functions.ts, against PGlite. */
function passkeyDeps(db: Db, who: Who, over: Partial<PasskeyDeps> = {}): PasskeyDeps {
  return {
    userId: who.uid, claims: claimsOf(who), rp: RP,
    listCredentialIds: () => asUser(db, who, async () => (await rows<{ credential_id: string }>(db, "SELECT credential_id FROM public.device_passkeys")).map((r) => r.credential_id)),
    saveChallenge: (c) => asUser(db, who, async () => {
      await rows(db, `INSERT INTO public.passkey_challenges(owner_id,challenge,origin,kind,expires_at) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (owner_id) DO UPDATE SET challenge=excluded.challenge, origin=excluded.origin, kind=excluded.kind, expires_at=excluded.expires_at`,
      [who.uid, c.challenge, c.origin, c.kind, c.expires_at]);
    }),
    takeChallenge: () => asUser(db, who, async () => {
      const r = (await rows<{ challenge: string; origin: string; kind: string; expires_at: Date }>(db, "DELETE FROM public.passkey_challenges WHERE owner_id=$1 RETURNING challenge, origin, kind, expires_at", [who.uid]))[0];
      return r ? { ...r, expires_at: new Date(r.expires_at).toISOString() } : null;
    }),
    findKey: (id) => asUser(db, who, async () => (await rows<{ owner_id: string; credential_id: string; public_key: string; counter: number }>(db,
      "SELECT owner_id, credential_id, public_key, counter::int AS counter FROM public.device_passkeys WHERE credential_id=$1", [id]))[0] ?? null),
    insertKey: (row) => asUser(db, who, async () => {
      await rows(db, "INSERT INTO public.device_passkeys(owner_id,credential_id,public_key,counter,transports) VALUES ($1,$2,$3,$4,$5::jsonb)",
        [row.owner_id, row.credential_id, row.public_key, row.counter, JSON.stringify(row.transports)]);
    }),
    updateCounter: (id, counter) => asUser(db, who, async () => { await rows(db, "UPDATE public.device_passkeys SET counter=$2 WHERE credential_id=$1", [id, counter]); }),
    hasFreshGrantFor: (action) => asUser(db, who, async () => (await rows<{ ok: boolean }>(db, "SELECT public.has_recent_step_up_for($1) ok", [action]))[0]?.ok === true),
    recordStepUp: (owner, method, session) => recordStepUp(serviceRpc(db), owner, method, session),
    limiter: sharedLimiter(db),
    ...over,
  };
}

// ------------------------------------------------------------------------------------------------
// Software authenticator (platform passkey with user verification), P-256 / ES256.
// ------------------------------------------------------------------------------------------------
const sha256 = (b: Uint8Array | string) => new Uint8Array(createHash("sha256").update(b).digest());
const concat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const b64u = (b: Uint8Array) => isoBase64URL.fromBuffer(new Uint8Array(b));
const text = (s: string) => new TextEncoder().encode(s);

class SoftAuthenticator {
  readonly key: { publicKey: KeyObject; privateKey: KeyObject } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  readonly rawId = new Uint8Array(randomBytes(16));
  readonly id = b64u(this.rawId);
  counter = 0;
  cose(): Uint8Array {
    const jwk = this.key.publicKey.export({ format: "jwk" });
    const x = isoBase64URL.toBuffer(String(jwk.x)), y = isoBase64URL.toBuffer(String(jwk.y));
    return isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]));
  }
  /** Answers navigator.credentials.create() for these options (attestation "none", UP+UV). */
  attest(optionsJSON: string): Record<string, unknown> {
    const o = JSON.parse(optionsJSON) as { challenge: string; rp: { id: string } };
    const clientDataJSON = text(JSON.stringify({ type: "webauthn.create", challenge: o.challenge, origin: RP.origin, crossOrigin: false }));
    const idLen = new Uint8Array([this.rawId.length >> 8, this.rawId.length & 0xff]);
    const authData = concat(sha256(o.rp.id), new Uint8Array([0x45]), u32(this.counter), new Uint8Array(16), idLen, this.rawId, this.cose());
    const attestationObject = isoCBOR.encode(new Map<string, string | Uint8Array | Map<string, string>>([["fmt", "none"], ["attStmt", new Map<string, string>()], ["authData", authData]]));
    const r: RegistrationResponseJSON = { id: this.id, rawId: this.id, type: "public-key", clientExtensionResults: {}, authenticatorAttachment: "platform",
      response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ["internal"] } };
    return r as unknown as Record<string, unknown>;
  }
  /** Answers navigator.credentials.get(); `counter` overrides the next signature counter (default: increment). */
  assert(optionsJSON: string, opts: { counter?: number; origin?: string } = {}): Record<string, unknown> {
    const o = JSON.parse(optionsJSON) as { challenge: string; rpId: string };
    this.counter = opts.counter ?? this.counter + 1;
    const clientDataJSON = text(JSON.stringify({ type: "webauthn.get", challenge: o.challenge, origin: opts.origin ?? RP.origin, crossOrigin: false }));
    const authData = concat(sha256(o.rpId), new Uint8Array([0x05]), u32(this.counter));
    const signature = new Uint8Array(sign("sha256", concat(authData, sha256(clientDataJSON)), this.key.privateKey));
    const r: AuthenticationResponseJSON = { id: this.id, rawId: this.id, type: "public-key", clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature) } };
    return r as unknown as Record<string, unknown>;
  }
}

// ------------------------------------------------------------------------------------------------
// Flows
// ------------------------------------------------------------------------------------------------
async function registerPasskey(db: Db, who: Who, a: SoftAuthenticator, over: Partial<PasskeyDeps> = {}) {
  const d = passkeyDeps(db, who, over);
  const o = await passkeyOptionsCore(d, "register");
  return verifyPasskeyCore(d, "register", a.attest(o.options));
}
async function passkeyConfirm(db: Db, who: Who, a: SoftAuthenticator, kind: "stepup" | "unlock" = "stepup", over: Partial<PasskeyDeps> = {}) {
  const d = passkeyDeps(db, who, over);
  const o = await passkeyOptionsCore(d, kind);
  return verifyPasskeyCore(d, kind, a.assert(o.options));
}
const EMAIL = (u: string) => `${u.slice(-4)}@e2e.in`;
/** Password step-up through the real server rule, a stubbed credential check ("right" is correct), the real limiter and record_step_up. */
const passwordStepUp = (db: Db, who: Who, password = "right", limiter: StepUpLimiter = sharedLimiter(db)) => verifyPasswordStepUp({
  userId: who.uid, claims: claimsOf(who), password, limiter, admin: serviceRpc(db),
  getUser: async () => ({ id: who.uid, email: EMAIL(who.uid), is_anonymous: false }),
  verify: async (_email, p) => (p === "right" ? who.uid : null),
});
/** Email one-time code step-up (Google-only accounts) with a stubbed code check ("424242" is correct). */
const emailCodeStepUp = (db: Db, who: Who, code = "424242") => verifyEmailCodeStepUp({
  userId: who.uid, claims: claimsOf(who), code, limiter: sharedLimiter(db), admin: serviceRpc(db),
  getUser: async () => ({ id: who.uid, email: EMAIL(who.uid), is_anonymous: false }),
  verifyCode: async (_email, c) => (c === "424242" ? who.uid : null),
});
const sensitive = (db: Db, who: Who, sql: string, params: unknown[] = []) => errorOf(asUser(db, who, () => rows(db, sql, params)));
/** Superuser: expire every grant of the owner, keeping the 5-minute CHECK valid. */
const expireGrants = (db: Db, owner: string) => rows(db, "UPDATE public.step_up_grants SET created_at=clock_timestamp()-interval '10 minutes', expires_at=clock_timestamp()-interval '6 minutes' WHERE owner_id=$1", [owner]);
const events = (db: Db, owner: string) => rows<{ event: string; action: string | null; method: string | null; session_id: string | null; client_id: string | null }>(db,
  "SELECT event, action, method, session_id, client_id FROM public.security_events WHERE owner_id=$1 ORDER BY seq", [owner]);
const passkeysOf = async (db: Db, owner: string) => (await rows<{ credential_id: string }>(db, "SELECT credential_id FROM public.device_passkeys WHERE owner_id=$1 ORDER BY credential_id", [owner])).map((r) => r.credential_id);

let db: Db;
const USERS = Array.from({ length: 60 }, (_, i) => uid(i + 1));
beforeAll(async () => {
  db = await fullSchemaDb(FILES);
  await addUsers(db, Object.fromEntries(USERS.map((u) => [u, EMAIL(u)])));
}, T);
let next = 0;
/** A fresh user per test so tests never share grants, attempts or events. */
const freshUser = (sessionNo = 1): Who => { const u = USERS[next++]; if (!u) throw new Error("out of users"); return { uid: u, sessionId: sid(next * 10 + sessionNo) }; };
let sessions = 0;
const otherSession = (w: Who): Who => ({ uid: w.uid, sessionId: sid(900 + sessions++) });

// ================================================================================================
describe("1. passkey registration needs fresh strong authentication (KK decision)", () => {
  it("refused without a grant: the server refuses before any challenge, and the database refuses the row even if the server check is skipped", async () => {
    const A = freshUser();
    expect(await errorOf(registerPasskey(db, A, new SoftAuthenticator()))).toBe("STEP_UP_REQUIRED: register_passkey");
    // A server without the check (e.g. old code on the new schema): the RESTRICTIVE insert policy still refuses.
    expect(await errorOf(registerPasskey(db, A, new SoftAuthenticator(), { hasFreshGrantFor: async () => null }))).toBe("Couldn't save passkey");
    expect(await passkeysOf(db, A.uid)).toEqual([]);
    expect(await events(db, A.uid)).toEqual([]);
  }, T);

  it("refused with an expired grant, with another session's grant, with another user's grant, and for assistants", async () => {
    const A = freshUser(), B = freshUser();
    await passwordStepUp(db, A);
    await expireGrants(db, A.uid);
    expect(await errorOf(registerPasskey(db, A, new SoftAuthenticator()))).toBe("STEP_UP_REQUIRED: register_passkey");
    await passwordStepUp(db, A); // fresh, but bound to A's first session
    expect(await errorOf(registerPasskey(db, otherSession(A), new SoftAuthenticator()))).toBe("STEP_UP_REQUIRED: register_passkey");
    expect(await errorOf(registerPasskey(db, otherSession(A), new SoftAuthenticator(), { hasFreshGrantFor: async () => null }))).toBe("Couldn't save passkey");
    await passwordStepUp(db, B);
    expect(await errorOf(registerPasskey(db, { uid: A.uid, sessionId: B.sessionId ?? "" }, new SoftAuthenticator()))).toBe("STEP_UP_REQUIRED: register_passkey");
    const bot: Who = { ...A, clientId: MCP };
    expect(await errorOf(registerPasskey(db, bot, new SoftAuthenticator()))).toBe("Connected assistants can't confirm changes");
    // even a server that skips its own checks gets nowhere: the assistant cannot even store a challenge,
    // and the passkey row itself is refused by the RESTRICTIVE policies
    expect(await errorOf(registerPasskey(db, bot, new SoftAuthenticator(), { claims: claimsOf(A), hasFreshGrantFor: async () => null }))).toBe("Couldn't start Face ID verification");
    expect(await sensitive(db, bot, "INSERT INTO public.device_passkeys(owner_id,credential_id,public_key) VALUES ($1,'bot','k')", [A.uid])).toMatch(/row-level security/);
    expect(await passkeysOf(db, A.uid)).toEqual([]);
  }, T);

  it("allowed with a password grant, with an emailed-code grant (accounts without a password) and with an existing passkey; each registration is audited", async () => {
    const P = freshUser(), G = freshUser();
    const p1 = new SoftAuthenticator(), p2 = new SoftAuthenticator(), g1 = new SoftAuthenticator();
    expect(await passwordStepUp(db, P)).toEqual({ recorded: true });
    expect(await registerPasskey(db, P, p1)).toEqual({ ok: true, recorded: false });
    await expireGrants(db, P.uid);
    // the newly stored key (app encoding: base64 COSE) verifies a real assertion and yields a passkey grant
    expect(await passkeyConfirm(db, P, p1)).toEqual({ ok: true, recorded: true });
    expect(await registerPasskey(db, P, p2)).toEqual({ ok: true, recorded: false });
    expect(await passkeysOf(db, P.uid)).toEqual([p1.id, p2.id].sort());
    const stored = (await rows<{ public_key: string }>(db, "SELECT public_key FROM public.device_passkeys WHERE credential_id=$1", [p1.id]))[0]?.public_key;
    expect(stored).toBe(Buffer.from(p1.cose()).toString("base64"));
    // Google-only account: emailed code, scope credential
    expect(await emailCodeStepUp(db, G)).toEqual({ recorded: true });
    expect(await registerPasskey(db, G, g1)).toEqual({ ok: true, recorded: false });
    expect(await passkeysOf(db, G.uid)).toEqual([g1.id]);
    const reg = (await events(db, P.uid)).filter((e) => e.event === "passkey_registered");
    expect(reg).toEqual([
      { event: "passkey_registered", action: "register_passkey", method: "password", session_id: P.sessionId, client_id: null },
      { event: "passkey_registered", action: "register_passkey", method: "passkey", session_id: P.sessionId, client_id: null },
    ]);
    expect((await events(db, G.uid)).map((e) => [e.event, e.method])).toEqual([["step_up_recorded", "email_otp"], ["passkey_registered", "email_otp"]]);
  }, T);

  it("an emailed-code grant authorises ONLY passkey registration: never erasure, sharing, passkey removal or assistant revocation", async () => {
    const G = freshUser();
    const g1 = new SoftAuthenticator();
    await emailCodeStepUp(db, G);
    await registerPasskey(db, G, g1);
    const grant = (await rows<{ method: string; scope: string; session_id: string }>(db, "SELECT method, scope, session_id FROM public.step_up_grants WHERE owner_id=$1", [G.uid]))[0];
    expect(grant).toEqual({ method: "email_otp", scope: "credential", session_id: G.sessionId });
    expect(await asUser(db, G, async () => (await rows(db, "SELECT public.has_recent_step_up() a, public.has_recent_step_up_for('register_passkey') r, public.has_recent_step_up_for('delete_my_finance_data') d"))[0]))
      .toEqual({ a: false, r: true, d: false });
    for (const [action, sql, params] of [
      ["delete_my_finance_data", "SELECT public.delete_my_finance_data()", []],
      ["grant_entity_access", "SELECT public.grant_entity_access('c1','someone@x.in',false)", []],
      ["remove_device_passkey", "SELECT public.remove_device_passkey($1)", [g1.id]],
      ["revoke_assistant_client", "SELECT public.revoke_assistant_client($1)", [MCP]],
    ] as const) expect(await sensitive(db, G, sql, [...params]), action).toBe(`STEP_UP_REQUIRED: ${action}`);
    // require_recent_step_up itself never accepts the credential scope, even when asked for register_passkey
    expect(await sensitive(db, G, "SELECT public.require_recent_step_up('register_passkey')")).toBe("Unknown sensitive action register_passkey");
    expect(await passkeysOf(db, G.uid)).toEqual([g1.id]);
    // the database refuses an email code with scope 'all'
    expect((await svc("record_step_up", { _owner: G.uid, _method: "email_otp", _scope: "all" })).error?.message).toMatch(/only confirm passkey registration/);
  }, T);

  it("counter updates during unlock keep working without any grant; the counter never decreases; keys cannot be replaced in place", async () => {
    const A = freshUser();
    const a = new SoftAuthenticator();
    await passwordStepUp(db, A);
    await registerPasskey(db, A, a);
    await expireGrants(db, A.uid);
    expect(await passkeyConfirm(db, A, a, "unlock")).toEqual({ ok: true, recorded: false });
    expect(await passkeyConfirm(db, A, a, "unlock")).toEqual({ ok: true, recorded: false });
    expect((await rows<{ c: number }>(db, "SELECT counter::int c FROM public.device_passkeys WHERE credential_id=$1", [a.id]))[0]?.c).toBe(2);
    expect(await asUser(db, A, async () => (await rows<{ ok: boolean }>(db, "SELECT public.has_recent_step_up() ok"))[0]?.ok)).toBe(false); // unlock never grants
    expect(await sensitive(db, A, "UPDATE public.device_passkeys SET public_key='x' WHERE credential_id=$1", [a.id])).toBe("permission denied for table device_passkeys");
    expect(await sensitive(db, A, "UPDATE public.device_passkeys SET owner_id=$2 WHERE credential_id=$1", [a.id, USERS[29]])).toBe("permission denied for table device_passkeys");
    // the signature counter only moves forward, for the client and for every other role
    expect(await sensitive(db, A, "UPDATE public.device_passkeys SET counter=1 WHERE credential_id=$1", [a.id])).toBe("PASSKEY_COUNTER_REGRESSION: the signature counter cannot decrease");
    // superuser (table owner, bypasses RLS): the trigger still refuses
    expect(await errorOf(rows(db, "UPDATE public.device_passkeys SET counter=0 WHERE credential_id=$1", [a.id]))).toBe("PASSKEY_COUNTER_REGRESSION: the signature counter cannot decrease");
    expect(await errorOf(rows(db, "UPDATE public.device_passkeys SET public_key='x' WHERE credential_id=$1", [a.id]))).toBe("PASSKEY_IMMUTABLE: register a new passkey instead of changing a stored one");
    expect(await sensitive(db, A, "UPDATE public.device_passkeys SET counter=2 WHERE credential_id=$1", [a.id])).toBe(""); // unchanged is allowed
    expect(await sensitive(db, A, "UPDATE public.device_passkeys SET counter=7 WHERE credential_id=$1", [a.id])).toBe("");
    expect((await rows<{ c: number }>(db, "SELECT counter::int c FROM public.device_passkeys WHERE credential_id=$1", [a.id]))[0]?.c).toBe(7);
    a.counter = 7;
    expect(await passkeyConfirm(db, A, a, "unlock")).toEqual({ ok: true, recorded: false }); // normal increment 7 -> 8
    expect((await rows<{ c: number }>(db, "SELECT counter::int c FROM public.device_passkeys WHERE credential_id=$1", [a.id]))[0]?.c).toBe(8);
  }, T);

  it("the 4-digit PIN can never record a grant: refused by the app rule, record_step_up, the limiter and the table", async () => {
    const A = freshUser();
    expect(() => assertStepUpMethod("pin")).toThrow();
    const calls: string[] = [];
    const spy: RpcClient = { rpc: async (fn: string) => { calls.push(fn); return { data: null, error: null }; } };
    await expect(recordStepUp(spy, A.uid, "pin")).rejects.toThrow();
    expect(calls).toEqual([]);
    expect((await svc("record_step_up", { _owner: A.uid, _method: "pin" })).error?.message).toMatch(/passkey, password or email_otp/);
    expect((await svc("begin_step_up_attempt", { _owner: A.uid, _method: "pin" })).error?.message).toMatch(/passkey, password or email_otp/);
    expect(await errorOf(rows(db, "INSERT INTO public.step_up_grants(owner_id,method,expires_at) VALUES ($1,'pin',now()+interval '1 minute')", [A.uid]))).toMatch(/check constraint/);
    expect(await rows(db, "SELECT 1 FROM public.step_up_grants WHERE method NOT IN ('passkey','password','email_otp')")).toEqual([]);
  }, T);
});

// ================================================================================================
describe("2. sensitive actions end to end with a real passkey assertion", () => {
  it("(i) success: options -> assertion -> server verification -> session-bound grant -> sensitive RPCs succeed as the user", async () => {
    const A = freshUser();
    const a = new SoftAuthenticator(), spare = new SoftAuthenticator();
    await passwordStepUp(db, A);
    await registerPasskey(db, A, a);
    await registerPasskey(db, A, spare);
    await expireGrants(db, A.uid);
    expect(await sensitive(db, A, "SELECT public.remove_device_passkey($1)", [spare.id])).toBe("STEP_UP_REQUIRED: remove_device_passkey");
    expect(await passkeyConfirm(db, A, a)).toEqual({ ok: true, recorded: true });
    const g = (await rows(db, "SELECT method, scope, session_id FROM public.step_up_grants WHERE owner_id=$1 AND expires_at > clock_timestamp()", [A.uid]));
    expect(g).toEqual([{ method: "passkey", scope: "all", session_id: A.sessionId }]);
    expect(await sensitive(db, A, "SELECT public.remove_device_passkey($1)", [spare.id])).toBe("");
    expect(await sensitive(db, A, "SELECT public.revoke_assistant_client($1)", [MCP])).toBe("");
    expect(await sensitive(db, A, "SELECT public.delete_my_finance_data()")).toBe("");
    expect(await passkeysOf(db, A.uid)).toEqual([a.id]);
  }, T);

  it("(ii) expiry: an expired grant no longer authorises; an expired challenge is refused (and consumed)", async () => {
    const A = freshUser();
    const a = new SoftAuthenticator();
    await passwordStepUp(db, A);
    await registerPasskey(db, A, a);
    await expireGrants(db, A.uid);
    await passkeyConfirm(db, A, a);
    expect(await sensitive(db, A, "SELECT public.revoke_assistant_client($1)", [MCP])).toBe("");
    await expireGrants(db, A.uid);
    expect(await sensitive(db, A, "SELECT public.revoke_assistant_client($1)", [MCP])).toBe("STEP_UP_REQUIRED: revoke_assistant_client");
    let now = Date.parse("2026-11-09T10:00:00Z");
    const d = passkeyDeps(db, A, { now: () => now });
    const o = await passkeyOptionsCore(d, "stepup");
    now += 300_001;
    expect(await errorOf(verifyPasskeyCore(d, "stepup", a.assert(o.options)))).toBe("Face ID request expired; try again");
    expect(await rows(db, "SELECT 1 FROM public.passkey_challenges WHERE owner_id=$1", [A.uid])).toEqual([]);
    expect(await sensitive(db, A, "SELECT public.revoke_assistant_client($1)", [MCP])).toBe("STEP_UP_REQUIRED: revoke_assistant_client");
  }, T);

  it("(iii) replay: one assertion works once; an unlock challenge cannot step up; counter regression is refused; other sessions' and users' grants never help", async () => {
    const A = freshUser(), B = freshUser();
    const a = new SoftAuthenticator(), b = new SoftAuthenticator();
    for (const [w, k] of [[A, a], [B, b]] as const) { await passwordStepUp(db, w); await registerPasskey(db, w, k); await expireGrants(db, w.uid); }
    const d = passkeyDeps(db, A);
    const o = await passkeyOptionsCore(d, "stepup");
    const assertion = a.assert(o.options);
    expect(await verifyPasskeyCore(d, "stepup", assertion)).toEqual({ ok: true, recorded: true });
    expect(await errorOf(verifyPasskeyCore(d, "stepup", assertion))).toBe("Face ID request expired; try again"); // challenge consumed
    await passkeyOptionsCore(d, "stepup"); // a new challenge exists: the old assertion still fails
    expect(await errorOf(verifyPasskeyCore(d, "stepup", assertion))).toMatch(/Unexpected authentication response challenge/);
    await expireGrants(db, A.uid);
    // unlock challenge used for a step-up
    const u = await passkeyOptionsCore(d, "unlock");
    expect(await errorOf(verifyPasskeyCore(d, "stepup", a.assert(u.options)))).toBe("Face ID request expired; try again");
    // counter regression (cloned authenticator)
    const before = a.counter;
    const o2 = await passkeyOptionsCore(d, "stepup");
    expect(await errorOf(verifyPasskeyCore(d, "stepup", a.assert(o2.options, { counter: before - 1 })))).toMatch(/counter value .* was lower than expected/);
    expect(await asUser(db, A, async () => (await rows<{ ok: boolean }>(db, "SELECT public.has_recent_step_up() ok"))[0]?.ok)).toBe(false);
    // another session of A, and user B, confirm; A's first session still has no grant
    a.counter = before;
    expect(await passkeyConfirm(db, otherSession(A), a)).toEqual({ ok: true, recorded: true });
    expect(await passkeyConfirm(db, B, b)).toEqual({ ok: true, recorded: true });
    expect(await sensitive(db, A, "SELECT public.revoke_assistant_client($1)", [MCP])).toBe("STEP_UP_REQUIRED: revoke_assistant_client");
    // a token without a session claim does not match a session-bound grant either
    expect(await sensitive(db, { uid: A.uid }, "SELECT public.revoke_assistant_client($1)", [MCP])).toBe("STEP_UP_REQUIRED: revoke_assistant_client");
  }, T);

  it("(iv) ownership: another user's credential cannot confirm for me; I cannot remove another user's passkey; assistants are refused at every step", async () => {
    const A = freshUser(), B = freshUser();
    const a = new SoftAuthenticator(), b = new SoftAuthenticator();
    for (const [w, k] of [[A, a], [B, b]] as const) { await passwordStepUp(db, w); await registerPasskey(db, w, k); await expireGrants(db, w.uid); }
    const d = passkeyDeps(db, A);
    // B's authenticator answers A's challenge: RLS hides B's key from A
    let o = await passkeyOptionsCore(d, "stepup");
    expect(await errorOf(verifyPasskeyCore(d, "stepup", b.assert(o.options)))).toBe("Passkey not found");
    // defence in depth: even a lookup that bypasses RLS (superuser) is refused by the owner check
    const leaky = passkeyDeps(db, A, { findKey: async (id) => (await rows<{ owner_id: string; credential_id: string; public_key: string; counter: number }>(db,
      "SELECT owner_id, credential_id, public_key, counter::int counter FROM public.device_passkeys WHERE credential_id=$1", [id]))[0] ?? null });
    o = await passkeyOptionsCore(leaky, "stepup");
    expect(await errorOf(verifyPasskeyCore(leaky, "stepup", b.assert(o.options)))).toBe("Passkey not found");
    expect(await asUser(db, A, async () => (await rows<{ ok: boolean }>(db, "SELECT public.has_recent_step_up() ok"))[0]?.ok)).toBe(false);
    // A (confirmed) cannot remove B's passkey; nothing changes
    await passkeyConfirm(db, A, a);
    expect(await sensitive(db, A, "SELECT public.remove_device_passkey($1)", [b.id])).toBe("Passkey not found");
    expect(await passkeysOf(db, B.uid)).toEqual([b.id]);
    // assistants: options, verify, the RPC (even with the user's fresh grant) and the grant check
    const bot: Who = { ...A, clientId: MCP };
    expect(await errorOf(passkeyOptionsCore(passkeyDeps(db, bot), "stepup"))).toBe("Connected assistants can't confirm changes");
    expect(await errorOf(verifyPasskeyCore(passkeyDeps(db, bot), "stepup", a.assert(o.options)))).toBe("Connected assistants can't confirm changes");
    expect(await errorOf(passwordStepUp(db, bot))).toBe("Connected assistants can't confirm changes");
    expect(await sensitive(db, bot, "SELECT public.remove_device_passkey($1)", [a.id])).toBe("STEP_UP_REQUIRED: remove_device_passkey");
    expect(await sensitive(db, bot, "SELECT public.delete_my_finance_data()")).toBe("STEP_UP_REQUIRED: delete_my_finance_data");
    expect(await asUser(db, bot, async () => (await rows<{ ok: boolean }>(db, "SELECT public.has_recent_step_up() ok"))[0]?.ok)).toBe(false);
    expect(await passkeysOf(db, A.uid)).toEqual([a.id]);
  }, T);

  it("(v) audit: security_events rows for each success with action, method and session; private to the owner; not writable by clients", async () => {
    const A = freshUser(), B = freshUser();
    const a = new SoftAuthenticator(), spare = new SoftAuthenticator();
    await passwordStepUp(db, A);
    await registerPasskey(db, A, a);
    await registerPasskey(db, A, spare);
    await expireGrants(db, A.uid);
    await passkeyConfirm(db, A, a);
    await sensitive(db, A, "SELECT public.remove_device_passkey($1)", [spare.id]);
    await sensitive(db, A, "SELECT public.revoke_assistant_client($1)", [MCP]);
    const S = A.sessionId ?? null;
    expect(await events(db, A.uid)).toEqual([
      { event: "step_up_recorded", action: null, method: "password", session_id: S, client_id: null },
      { event: "passkey_registered", action: "register_passkey", method: "password", session_id: S, client_id: null },
      { event: "passkey_registered", action: "register_passkey", method: "password", session_id: S, client_id: null },
      { event: "step_up_recorded", action: null, method: "passkey", session_id: S, client_id: null },
      { event: "sensitive_action_authorised", action: "remove_device_passkey", method: "passkey", session_id: S, client_id: null },
      { event: "passkey_removed", action: "remove_device_passkey", method: null, session_id: S, client_id: null },
      { event: "sensitive_action_authorised", action: "revoke_assistant_client", method: "passkey", session_id: S, client_id: null },
      { event: "assistant_client_revoked", action: "revoke_assistant_client", method: null, session_id: S, client_id: null },
    ]);
    // a refused action leaves no 'authorised' row (it rolls back with the action)
    await sensitive(db, A, "SELECT public.remove_device_passkey('does-not-exist')");
    expect((await events(db, A.uid)).length).toBe(8);
    // owner sees own rows; another owner sees none of them
    expect((await asUser(db, A, () => rows(db, "SELECT 1 FROM public.security_events"))).length).toBe(8);
    expect(await asUser(db, B, () => rows(db, "SELECT 1 FROM public.security_events WHERE owner_id=$1", [A.uid]))).toEqual([]);
    // clients (and the service role) cannot insert, change or delete events, nor call the internal writer
    expect(await sensitive(db, A, "INSERT INTO public.security_events(owner_id,event) VALUES ($1,'passkey_removed')", [A.uid])).toBe("permission denied for table security_events");
    expect(await sensitive(db, A, "UPDATE public.security_events SET event='passkey_removed'")).toBe("permission denied for table security_events");
    expect(await sensitive(db, A, "DELETE FROM public.security_events")).toBe("permission denied for table security_events");
    expect(await sensitive(db, A, "SELECT public.log_security_event($1,'passkey_removed',NULL,NULL,NULL)", [A.uid])).toMatch(/permission denied for function log_security_event/);
    expect(await errorOf(asService(db, () => rows(db, "DELETE FROM public.security_events")))).toBe("permission denied for table security_events");
    expect(await errorOf(asService(db, () => rows(db, "SELECT public.log_security_event($1,'passkey_removed',NULL,NULL,NULL)", [A.uid])))).toMatch(/permission denied/);
    expect((await events(db, A.uid)).length).toBe(8);
  }, T);

  it("(vi) password path: wrong passwords are counted across calls and server instances, lock out at 5, and a success records a session-bound grant", async () => {
    const A = freshUser();
    for (let i = 0; i < 5; i++) {
      // a new limiter object per call stands for another server instance / request
      expect(await errorOf(passwordStepUp(db, A, "wrong", sharedLimiter(db)))).toBe("Couldn't verify your password. Try again.");
    }
    expect(await errorOf(passwordStepUp(db, A, "right", sharedLimiter(db)))).toBe("Too many failed confirmations. Wait 15 minutes and try again.");
    expect(await rows(db, "SELECT 1 FROM public.step_up_grants WHERE owner_id=$1", [A.uid])).toEqual([]);
    expect((await events(db, A.uid)).map((e) => e.event)).toEqual([...Array(5).fill("step_up_failed"), "step_up_rate_limited"]);
    // window passes (move the attempts back as superuser), then the right password works and binds to the session
    await rows(db, "UPDATE public.step_up_attempts SET started_at=started_at-interval '16 minutes', finished_at=finished_at-interval '16 minutes' WHERE owner_id=$1", [A.uid]);
    expect(await passwordStepUp(db, A)).toEqual({ recorded: true });
    expect(await rows(db, "SELECT method, scope, session_id FROM public.step_up_grants WHERE owner_id=$1", [A.uid])).toEqual([{ method: "password", scope: "all", session_id: A.sessionId }]);
    expect(await sensitive(db, A, "SELECT public.revoke_assistant_client($1)", [MCP])).toBe("");
    expect(await sensitive(db, otherSession(A), "SELECT public.revoke_assistant_client($1)", [MCP])).toBe("STEP_UP_REQUIRED: revoke_assistant_client");
  }, T);
});

// ================================================================================================
describe("3. shared step-up rate limit in the database", () => {
  const call = svc;

  it("5 failures then refusal; the refusal holds for every caller and method; failed passkey step-ups share the count", async () => {
    const A = freshUser();
    const a = new SoftAuthenticator();
    await passwordStepUp(db, A); await registerPasskey(db, A, a); await expireGrants(db, A.uid);
    const ev0 = (await events(db, A.uid)).length;
    for (let i = 0; i < 3; i++) await errorOf(passwordStepUp(db, A, "wrong"));
    // two failed passkey step-ups (wrong origin) count too
    for (let i = 0; i < 2; i++) {
      const d = passkeyDeps(db, A);
      const o = await passkeyOptionsCore(d, "stepup");
      expect(await errorOf(verifyPasskeyCore(d, "stepup", a.assert(o.options, { origin: "https://evil.example" })))).toMatch(/Unexpected authentication response origin/);
    }
    expect(await errorOf(passkeyConfirm(db, A, a))).toBe("Too many failed confirmations. Wait 15 minutes and try again.");
    expect(await errorOf(emailCodeStepUp(db, A))).toBe("Too many failed confirmations. Wait 15 minutes and try again.");
    expect((await call("begin_step_up_attempt", { _owner: A.uid, _method: "password" })).data).toBeNull();
    expect((await events(db, A.uid)).slice(ev0).map((e) => e.event)).toEqual([...Array(5).fill("step_up_failed"), ...Array(3).fill("step_up_rate_limited")]);
  }, T);

  it("concurrent begins cannot exceed the limit, and unfinished attempts count as failures (fail closed)", async () => {
    const A = freshUser();
    const results = await Promise.all(Array.from({ length: 12 }, () => call("begin_step_up_attempt", { _owner: A.uid, _method: "password" })));
    expect(results.filter((r) => typeof r.data === "string").length).toBe(5);
    expect(results.filter((r) => r.data === null && !r.error).length).toBe(7);
    expect((await rows(db, "SELECT 1 FROM public.step_up_attempts WHERE owner_id=$1 AND outcome IS NULL", [A.uid])).length).toBe(5);
  }, T);

  it("a success after failures re-opens (history kept as evidence); window expiry re-opens; finished attempts cannot be re-finished", async () => {
    const A = freshUser();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) { const r = await call("begin_step_up_attempt", { _owner: A.uid, _method: "password" }); ids.push(String(r.data)); await call("finish_step_up_attempt", { _id: r.data, _ok: false }); }
    const ok = await call("begin_step_up_attempt", { _owner: A.uid, _method: "password" });
    await call("finish_step_up_attempt", { _id: ok.data, _ok: true });
    expect((await call("finish_step_up_attempt", { _id: ok.data, _ok: false })).error?.message).toMatch(/Unknown or already finished/);
    for (let i = 0; i < 5; i++) { const r = await call("begin_step_up_attempt", { _owner: A.uid, _method: "password" }); expect(typeof r.data, `after success ${i}`).toBe("string"); await call("finish_step_up_attempt", { _id: r.data, _ok: false }); }
    expect((await call("begin_step_up_attempt", { _owner: A.uid, _method: "password" })).data).toBeNull();
    expect((await rows(db, "SELECT 1 FROM public.step_up_attempts WHERE owner_id=$1", [A.uid])).length).toBe(10); // evidence kept
    await rows(db, "UPDATE public.step_up_attempts SET started_at=started_at-interval '15 minutes 1 second', finished_at=finished_at-interval '15 minutes 1 second' WHERE owner_id=$1", [A.uid]);
    expect(typeof (await call("begin_step_up_attempt", { _owner: A.uid, _method: "password" })).data).toBe("string");
  }, T);

  it("clients cannot read or write attempts or call the limiter or record_step_up; another owner is unaffected", async () => {
    const A = freshUser(), B = freshUser();
    for (let i = 0; i < 5; i++) await call("begin_step_up_attempt", { _owner: A.uid, _method: "password" });
    expect(typeof (await call("begin_step_up_attempt", { _owner: B.uid, _method: "password" })).data).toBe("string");
    for (const who of [A, { ...A, clientId: MCP }]) {
      expect(await sensitive(db, who, "SELECT * FROM public.step_up_attempts")).toBe("permission denied for table step_up_attempts");
      expect(await sensitive(db, who, "INSERT INTO public.step_up_attempts(owner_id,method) VALUES ($1,'password')", [A.uid])).toBe("permission denied for table step_up_attempts");
      expect(await sensitive(db, who, "DELETE FROM public.step_up_attempts")).toBe("permission denied for table step_up_attempts");
      for (const sql of ["SELECT public.begin_step_up_attempt($1,'password')", "SELECT public.finish_step_up_attempt($1::uuid,true)", "SELECT public.record_step_up($1,'password')"]) {
        expect(await sensitive(db, who, sql, [A.uid]), sql).toMatch(/permission denied for function/);
      }
    }
    await actAs(db, null); await db.exec("SET ROLE anon");
    expect(await errorOf(rows(db, "SELECT public.begin_step_up_attempt($1,'password')", [A.uid]))).toMatch(/permission denied/);
    await actAs(db, null);
    expect(await errorOf(asService(db, () => rows(db, "SELECT * FROM public.step_up_attempts")))).toBe("permission denied for table step_up_attempts");
  }, T);

  it("on today's production schema (no P4) the server keeps working: no grant is recorded and the in-memory limiter is used", async () => {
    const old = await fullSchemaDb([FILES[0] ?? "", FILES[1] ?? ""]);
    const A = { uid: uid(99), sessionId: sid(99) };
    await addUsers(old, { [A.uid]: EMAIL(A.uid) });
    let fallbackUsed = 0;
    const fallback: StepUpLimiter = { begin: async () => { fallbackUsed++; return { finish: async () => {} }; } };
    const r = await verifyPasswordStepUp({ userId: A.uid, claims: claimsOf(A), password: "right", limiter: createSharedStepUpLimiter(serviceRpc(old), fallback), admin: serviceRpc(old),
      getUser: async () => ({ id: A.uid, email: EMAIL(A.uid) }), verify: async () => A.uid });
    expect(r).toEqual({ recorded: false });
    expect(fallbackUsed).toBe(1);
    await old.close();
  }, T);
});

// ================================================================================================
describe("4. session binding and passkey removal (database)", () => {
  it("record_step_up stores one timestamp: every grant lasts exactly its lifetime and never trips the 5-minute CHECK", async () => {
    const A = freshUser();
    for (let i = 0; i < 40; i++) expect((await svc("record_step_up", { _owner: A.uid, _method: "password", _seconds: 300, _session: A.sessionId })).error).toBeNull();
    const spans = await rows<{ s: number }>(db, "SELECT extract(epoch FROM expires_at - created_at)::float8 s FROM public.step_up_grants WHERE owner_id=$1", [A.uid]);
    expect(spans.length).toBe(40);
    expect(new Set(spans.map((x) => x.s))).toEqual(new Set([300]));
  }, T);

  it("a grant from session A never authorises session B of the same user; an unbound grant (old server) works for any session", async () => {
    const A = freshUser();
    await svc("record_step_up", { _owner: A.uid, _method: "password", _session: A.sessionId });
    const B = otherSession(A);
    const check = async (w: Who) => asUser(db, w, async () => (await rows<{ ok: boolean }>(db, "SELECT public.has_recent_step_up() ok"))[0]?.ok);
    expect(await check(A)).toBe(true);
    expect(await check(B)).toBe(false);
    expect(await check({ uid: A.uid })).toBe(false);
    expect(await sensitive(db, B, "SELECT public.delete_my_finance_data()")).toBe("STEP_UP_REQUIRED: delete_my_finance_data");
    await expireGrants(db, A.uid);
    await svc("record_step_up", { _owner: A.uid, _method: "password" });
    expect(await check(B)).toBe(true);
    expect(await check({ uid: A.uid })).toBe(true);
  }, T);

  it("remove_device_passkey(_credential_id): removes exactly the owner's one row; foreign or unknown ids, no step-up and assistants change nothing; direct DELETE refused", async () => {
    const A = freshUser(), B = freshUser();
    const a1 = new SoftAuthenticator(), a2 = new SoftAuthenticator(), b1 = new SoftAuthenticator();
    await passwordStepUp(db, A); await registerPasskey(db, A, a1); await registerPasskey(db, A, a2);
    await passwordStepUp(db, B); await registerPasskey(db, B, b1);
    await expireGrants(db, A.uid);
    const snapshot = async () => ({ a: await passkeysOf(db, A.uid), b: await passkeysOf(db, B.uid) });
    const start = await snapshot();
    expect(await sensitive(db, A, "SELECT public.remove_device_passkey($1)", [a1.id])).toBe("STEP_UP_REQUIRED: remove_device_passkey");
    await passwordStepUp(db, A);
    expect(await sensitive(db, { ...A, clientId: MCP }, "SELECT public.remove_device_passkey($1)", [a1.id])).toBe("STEP_UP_REQUIRED: remove_device_passkey");
    expect(await sensitive(db, A, "SELECT public.remove_device_passkey($1)", [b1.id])).toBe("Passkey not found");
    expect(await sensitive(db, A, "SELECT public.remove_device_passkey($1)", ["unknown-credential"])).toBe("Passkey not found");
    expect(await sensitive(db, A, "SELECT public.remove_device_passkey(NULL)")).toBe("Passkey not found");
    expect(await asUser(db, A, () => rows(db, "DELETE FROM public.device_passkeys RETURNING 1"))).toEqual([]);
    expect(await snapshot()).toEqual(start);
    expect(await sensitive(db, A, "SELECT public.remove_device_passkey($1)", [a1.id])).toBe("");
    expect(await snapshot()).toEqual({ a: [a2.id], b: [b1.id] });
    // the remaining passkey still unlocks and its counter still updates
    expect(await passkeyConfirm(db, A, a2, "unlock")).toEqual({ ok: true, recorded: false });
  }, T);
});
