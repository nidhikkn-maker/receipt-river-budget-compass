// @vitest-environment node
// The hourly demo cleanup route (src/routes/api/public/jobs/cleanup-demos.ts) with a fake admin client: a guest whose identity cannot be deleted
// keeps its demo_sessions row (so the next run retries it), is reported in `failed` and the run answers 500.
// Fake clients only; no Cloud.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as string[], deleteUserError: null as { message: string } | null, sessionError: null as { message: string } | null }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (opts: unknown) => ({ options: opts }) }));
vi.mock("@/integrations/supabase/cron-auth", () => ({ authenticateCronRequest: async () => null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async () => ({ data: ["guest-1"], error: null }),
    auth: { admin: {
      getUserById: async (id: string) => ({ data: { user: { id, is_anonymous: true } }, error: null }),
      deleteUser: async (id: string) => { h.calls.push(`deleteUser:${id}`); return { data: null, error: h.deleteUserError }; },
    } },
    from: (table: string) => ({ select: () => { const q = { lt: () => q, order: () => q, range: async () => ({ data: [{ owner_id: "guest-1", created_at: "2026-01-01T00:00:00Z" }], error: null }) }; return q; },
      delete: () => ({ eq: async (column: string, value: string) => {
      h.calls.push(`delete:${table}.${column}=${value}`);
      return { error: table === "demo_sessions" ? h.sessionError : null };
    } }) }),
  },
}));

import { Route } from "@/routes/api/public/jobs/cleanup-demos";

const post = async () => {
  const handler = (Route as unknown as { options: { server: { handlers: { POST: (a: { request: Request }) => Promise<Response> } } } }).options.server.handlers.POST;
  const res = await handler({ request: new Request("https://x.test/api/public/jobs/cleanup-demos", { method: "POST" }) });
  return { status: res.status, body: await res.json() };
};

describe("demo cleanup: the guest identity removal decides whether the demo session row goes", () => {
  beforeEach(() => { h.calls.length = 0; h.deleteUserError = null; h.sessionError = null; });

  it("identity removed: records, identity, then the demo_sessions row; counted as removed", async () => {
    expect(await post()).toEqual({ status: 200, body: { removed: 1, failed: [] } });
    expect(h.calls.slice(-2)).toEqual(["deleteUser:guest-1", "delete:demo_sessions.owner_id=guest-1"]);
  });

  it("identity removal fails: the demo_sessions row is kept for the next run, the guest is reported and the run answers 500", async () => {
    h.deleteUserError = { message: "User not deleted" };
    expect(await post()).toEqual({ status: 500, body: { removed: 0, failed: [{ table: "auth.users", error: "User not deleted" }] } });
    expect(h.calls).toContain("deleteUser:guest-1");
    expect(h.calls).not.toContain("delete:demo_sessions.owner_id=guest-1");
  });

  it("demo_sessions row removal fails after the identity went: reported, 500, not counted as removed", async () => {
    h.sessionError = { message: "timeout" };
    expect(await post()).toEqual({ status: 500, body: { removed: 0, failed: [{ table: "demo_sessions", error: "timeout" }] } });
  });
});
