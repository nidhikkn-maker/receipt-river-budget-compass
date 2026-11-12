// @vitest-environment node
// Release gate (review of 6394ac8): a guest whose identity was deleted but whose demo_sessions row was not must not be
// stuck as "skip-unconfirmed" forever, and stuck rows must not starve newer expired demos. The route
// (src/routes/api/public/jobs/cleanup-demos.ts) runs against a fake admin client holding demo_sessions, identities and
// the guest record tables. Fake clients only; no Cloud.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Err = { message: string; status?: number; code?: string } | null;
const h = vi.hoisted(() => ({
  calls: [] as string[],
  sessions: new Map<string, string>(), // owner -> created_at
  users: new Map<string, { is_anonymous: boolean }>(),
  records: {} as Record<string, Map<string, number>>, // table -> owner -> rows
  lookupError: {} as Record<string, unknown>,
  countError: {} as Record<string, unknown>,
  countNull: false,
  sessionError: null as unknown,
}));
const NOT_FOUND = { message: "User not found", status: 404, code: "user_not_found" };

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (opts: unknown) => ({ options: opts }) }));
vi.mock("@/integrations/supabase/cron-auth", () => ({ authenticateCronRequest: async () => null }));
vi.mock("@/integrations/supabase/client.server", () => {
  const query = (table: string) => {
    const f = { eq: [] as [string, string][], lt: null as [string, string] | null, range: null as [number, number] | null, head: false, del: false };
    const run = async (): Promise<{ data?: unknown; count?: number | null; error: unknown }> => {
      if (table === "demo_sessions") {
        let rows = [...h.sessions.entries()].map(([owner_id, created_at]) => ({ owner_id, created_at }));
        for (const [c, v] of f.eq) rows = rows.filter((r) => (r as Record<string, string>)[c] === v);
        if (f.lt) { const [c, v] = f.lt; rows = rows.filter((r) => (r as Record<string, string>)[c]! < v); }
        if (f.del) {
          h.calls.push(`delete:demo_sessions=${f.eq[0]?.[1]}`);
          if (h.sessionError) return { error: h.sessionError };
          for (const r of rows) h.sessions.delete(r.owner_id);
          return { error: null };
        }
        rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.owner_id.localeCompare(b.owner_id));
        if (f.range) rows = rows.slice(f.range[0], f.range[1] + 1);
        return { data: rows, error: null };
      }
      const owner = f.eq[0]?.[1] ?? "";
      const t = (h.records[table] ??= new Map());
      if (f.del) { h.calls.push(`delete:${table}=${owner}`); t.delete(owner); return { error: null }; }
      h.calls.push(`count:${table}=${owner}`);
      if (h.countError[table]) return { data: null, count: null, error: h.countError[table] };
      return { data: null, count: h.countNull ? null : (t.get(owner) ?? 0), error: null };
    };
    const b: Record<string, unknown> = {
      select: (_c: string, o?: { head?: boolean }) => { f.head = !!o?.head; return b; },
      delete: () => { f.del = true; return b; },
      eq: (c: string, v: string) => { f.eq.push([c, v]); return b; },
      lt: (c: string, v: string) => { f.lt = [c, v]; return b; },
      order: () => b,
      range: (a: number, z: number) => { f.range = [a, z]; return b; },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return b;
  };
  return { supabaseAdmin: {
    // the applied expired_demo_owners(): unordered, limit 200 (heap order = insertion order here)
    rpc: async () => ({ data: [...h.sessions.entries()].filter(([, c]) => c < new Date(Date.now() - 864e5).toISOString()).map(([o]) => o).slice(0, 200), error: null }),
    auth: { admin: {
      getUserById: async (id: string) => {
        h.calls.push(`lookup:${id}`);
        if (h.lookupError[id]) return { data: { user: null }, error: h.lookupError[id] };
        const u = h.users.get(id);
        return u ? { data: { user: { id, ...u } }, error: null } : { data: { user: null }, error: NOT_FOUND };
      },
      deleteUser: async (id: string) => { h.calls.push(`deleteUser:${id}`); h.users.delete(id); return { data: null, error: null as Err }; },
    } },
    from: query,
  } };
});

import { Route } from "@/routes/api/public/jobs/cleanup-demos";
import { demoCleanupDecision } from "@/lib/demo-cleanup";

const post = async () => {
  const handler = (Route as unknown as { options: { server: { handlers: { POST: (a: { request: Request }) => Promise<Response> } } } }).options.server.handlers.POST;
  const res = await handler({ request: new Request("https://x.test/api/public/jobs/cleanup-demos", { method: "POST" }) });
  return { status: res.status, body: await res.json() as { removed: number; failed: unknown[] } };
};
const old = (minutes: number) => new Date(Date.now() - 864e5 - minutes * 60e3).toISOString();
const TABLES = ["expenses", "accounts", "claim_receipt_corrections", "asset_disposal_requests", "finance_preferences"];
const seedGuest = (id: string, created: string, opts: { identity?: boolean; records?: boolean } = {}) => {
  h.sessions.set(id, created);
  if (opts.identity ?? true) h.users.set(id, { is_anonymous: true });
  if (opts.records ?? true) for (const t of TABLES) (h.records[t] ??= new Map()).set(id, 2);
};
const deletes = (id: string) => h.calls.filter((c) => c.startsWith("delete:") && c.endsWith(`=${id}`) && !c.startsWith("delete:demo_sessions"));

describe("demo cleanup: a guest whose identity is confirmed gone", () => {
  beforeEach(() => {
    h.calls.length = 0; h.sessions.clear(); h.users.clear(); h.records = {}; h.lookupError = {}; h.countError = {}; h.countNull = false; h.sessionError = null;
  });

  it("only a 404 user_not_found answer confirms the identity is missing", () => {
    expect(demoCleanupDecision({ user: null, error: NOT_FOUND })).toBe("identity-missing");
    expect(demoCleanupDecision({ user: null, error: { message: "User not found", status: 404 } })).toBe("skip-unconfirmed");
    expect(demoCleanupDecision({ user: null, error: { message: "x", status: 500, code: "user_not_found" } })).toBe("skip-unconfirmed");
    expect(demoCleanupDecision({ user: null, error: { message: "down", status: 503 } })).toBe("skip-unconfirmed");
    expect(demoCleanupDecision({ user: null })).toBe("skip-unconfirmed");
  });

  it("identity gone and every guest record gone (an earlier run's demo_sessions delete failed): the row is finished, nothing else deleted", async () => {
    seedGuest("stuck", old(5), { identity: false, records: false });
    expect(await post()).toEqual({ status: 200, body: { removed: 1, failed: [] } });
    expect(h.sessions.has("stuck")).toBe(false);
    expect(deletes("stuck")).toEqual([]);
    expect(h.calls).not.toContain("deleteUser:stuck");
    expect(h.calls.filter((c) => c.startsWith("count:")).sort()).toEqual(TABLES.map((t) => `count:${t}=stuck`).sort());
  });

  it("the corrections / disposal request tables not installed yet (42P01 / PGRST205) count as none", async () => {
    seedGuest("stuck", old(5), { identity: false, records: false });
    h.countError["claim_receipt_corrections"] = { code: "PGRST205", message: "not in schema cache" };
    h.countError["asset_disposal_requests"] = { code: "42P01", message: 'relation "public.asset_disposal_requests" does not exist' };
    expect(await post()).toEqual({ status: 200, body: { removed: 1, failed: [] } });
    expect(h.sessions.has("stuck")).toBe(false);
  });

  it("on any doubt the row and records stay: records remain, a count fails, the count is not exact, the lookup fails", async () => {
    // records remain for a missing identity
    seedGuest("left", old(5), { identity: false, records: false });
    h.records["accounts"] = new Map([["left", 1]]);
    expect((await post()).body.removed).toBe(0);
    expect(h.sessions.has("left")).toBe(true);
    expect(deletes("left")).toEqual([]);
    // a count query error (other than a missing corrections table)
    h.records = {}; h.calls.length = 0;
    h.countError["expenses"] = { code: "57014", message: "timeout" };
    expect((await post()).body.removed).toBe(0);
    expect(h.sessions.has("left")).toBe(true);
    h.countError = { claim_receipt_corrections: { code: "42501", message: "permission denied" } };
    expect((await post()).body.removed).toBe(0);
    expect(h.sessions.has("left")).toBe(true);
    h.countError = { asset_disposal_requests: { code: "42501", message: "permission denied" } };
    expect((await post()).body.removed).toBe(0);
    expect(h.sessions.has("left")).toBe(true);
    // P14 disposal requests remaining for a missing identity also keep the row (G10)
    h.countError = {}; h.records = { asset_disposal_requests: new Map([["left", 1]]) };
    expect((await post()).body.removed).toBe(0);
    expect(h.sessions.has("left")).toBe(true);
    h.records = {};
    // a count that is not a number
    h.countError = {}; h.countNull = true;
    expect((await post()).body.removed).toBe(0);
    expect(h.sessions.has("left")).toBe(true);
    // a lookup error that is not a confirmed missing identity
    h.countNull = false; h.lookupError["left"] = { message: "auth down", status: 503 };
    expect((await post()).body.removed).toBe(0);
    expect(h.sessions.has("left")).toBe(true);
    expect(deletes("left")).toEqual([]);
  });

  it("a demo_sessions delete that fails again is reported and retried next run", async () => {
    seedGuest("stuck", old(5), { identity: false, records: false });
    h.sessionError = { message: "timeout" };
    expect(await post()).toEqual({ status: 500, body: { removed: 0, failed: [{ table: "demo_sessions", error: "timeout" }] } });
    h.sessionError = null;
    expect(await post()).toEqual({ status: 200, body: { removed: 1, failed: [] } });
  });

  it("200+ older rows that must stay never starve a newer expired guest; expired rows are taken oldest first; unexpired demos are untouched", async () => {
    for (let i = 0; i < 210; i++) { seedGuest(`kept-${String(i).padStart(3, "0")}`, old(600 - i), { identity: false, records: false }); (h.records["expenses"] ??= new Map()).set(`kept-${String(i).padStart(3, "0")}`, 1); }
    seedGuest("fresh-guest", old(1));
    seedGuest("active", new Date(Date.now() - 60e3).toISOString());
    expect(await post()).toEqual({ status: 200, body: { removed: 1, failed: [] } });
    expect(h.sessions.has("fresh-guest")).toBe(false);
    expect(h.calls).toContain("deleteUser:fresh-guest");
    expect(h.sessions.size).toBe(211);
    expect(h.calls.some((c) => c.endsWith("=active") || c === "lookup:active")).toBe(false);
    const lookups = h.calls.filter((c) => c.startsWith("lookup:"));
    expect(lookups[0]).toBe("lookup:kept-000");
    expect(lookups.at(-1)).toBe("lookup:fresh-guest");
  });

  it("auth API down: lookups stop after 10 consecutive errors, the stop is reported (500), nothing is deleted", async () => {
    for (let i = 0; i < 1200; i++) { const id = `g-${String(i).padStart(4, "0")}`; seedGuest(id, old(2000 - i)); h.lookupError[id] = { message: "auth down", status: 503 }; }
    const res = await post();
    expect(res.status).toBe(500);
    expect(res.body.removed).toBe(0);
    expect(res.body.failed).toEqual([{ table: "auth.users", error: "cleanup stopped after 10 consecutive identity lookup errors (last: auth down)" }]);
    expect(h.calls.filter((c) => c.startsWith("lookup:")).length).toBe(10);
    expect(h.calls.filter((c) => c.startsWith("delete:") || c.startsWith("deleteUser:") || c.startsWith("count:"))).toEqual([]);
    expect(h.sessions.size).toBe(1200);
  });

  it("lookups per run are capped at 400 even when every looked-up row must stay; a success resets the error streak", async () => {
    // identity missing with records left: never acted on, never an error, so only the lookup cap bounds the run
    for (let i = 0; i < 1200; i++) { const id = `k-${String(i).padStart(4, "0")}`; seedGuest(id, old(2000 - i), { identity: false, records: false }); (h.records["expenses"] ??= new Map()).set(id, 1); }
    // interleave lookup errors below the streak limit
    for (let i = 0; i < 1200; i += 10) for (let j = 0; j < 9; j++) h.lookupError[`k-${String(i + j).padStart(4, "0")}`] = { message: "flaky", status: 503 };
    const res = await post();
    expect(res).toEqual({ status: 200, body: { removed: 0, failed: [] } });
    expect(h.calls.filter((c) => c.startsWith("lookup:")).length).toBe(400);
    expect(h.calls.filter((c) => c.startsWith("delete:") || c.startsWith("deleteUser:"))).toEqual([]);
    expect(h.sessions.size).toBe(1200);
  });

  it("a normal run is unaffected: a few lookup errors are skipped and the remaining guests are removed", async () => {
    for (let i = 0; i < 5; i++) { seedGuest(`down-${i}`, old(100 - i)); h.lookupError[`down-${i}`] = { message: "auth down", status: 503 }; }
    for (let i = 0; i < 3; i++) seedGuest(`ok-${i}`, old(10 - i));
    expect(await post()).toEqual({ status: 200, body: { removed: 3, failed: [] } });
    for (let i = 0; i < 5; i++) { expect(h.sessions.has(`down-${i}`)).toBe(true); expect(deletes(`down-${i}`)).toEqual([]); }
    for (let i = 0; i < 3; i++) expect(h.sessions.has(`ok-${i}`)).toBe(false);
  });
});
