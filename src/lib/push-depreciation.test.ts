// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { dispatchDepreciationReminders } from "./push-dispatch.server";
const send = vi.hoisted(() => vi.fn());
vi.mock("./push-crypto.server", () => ({ sendDevicePush: send }));

function db(notifications: Record<string, boolean> = {}) {
  const claims = new Set<string>();
  const q = (table: string) => {
    const b: any = { select: () => b, eq: () => b, delete: () => b,
      maybeSingle: async () => ({ data: { data: { reminders: true, notifications } }, error: null }),
      insert: async (r: any) => { const k = r.owner_id + r.item_key; if (claims.has(k)) return { error: { code: "23505" } }; claims.add(k); return { error: null }; },
      then: (f: any) => f({ data: table === "push_subscriptions" ? [{ id: "phone", owner_id: "o" }] : [], error: null }) };
    return b;
  };
  return { from: q } as any;
}
beforeEach(() => { send.mockReset(); send.mockResolvedValue({ ok: true }); });
describe("depreciation phone reminder", () => {
  it("sends once per month with no figures, rerun skipped", async () => {
    const d = db();
    expect((await dispatchDepreciationReminders(d, "s", ["o"], "2026-10", "2026-11-01")).sent).toBe(1);
    expect((await dispatchDepreciationReminders(d, "s", ["o"], "2026-10", "2026-11-02")).sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![2].body).not.toMatch(/\d/);
    expect(send.mock.calls[0]![2].url).toBe("/inbox");
  });
  it("respects the switch being off", async () => {
    expect((await dispatchDepreciationReminders(db({ depreciation: false }), "s", ["o"], "2026-10", "2026-11-01")).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
  it("sends nothing when nothing was prepared", async () => {
    expect((await dispatchDepreciationReminders(db(), "s", [], "2026-10", "2026-11-01")).sent).toBe(0);
  });
});
