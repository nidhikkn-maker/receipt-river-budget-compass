import { describe, expect, it, vi } from "vitest";
import { assertStepUpMethod, challengeUsable, createAttemptLimiter, isAssistantClaims, recordStepUp, verifyPasswordStepUp, type PasswordStepUpDeps } from "./step-up-server";
import { relyingPartyFor } from "./passkey-origin";

const admin = (error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ error }) });

describe("recordStepUp", () => {
  it("records a five-minute grant for the verified owner", async () => {
    const a = admin();
    await expect(recordStepUp(a, "owner", "passkey")).resolves.toEqual({ recorded: true });
    expect(a.rpc).toHaveBeenCalledWith("record_step_up", { _owner: "owner", _method: "passkey", _seconds: 300 });
  });
  it("never records a PIN", async () => {
    const a = admin();
    await expect(recordStepUp(a, "owner", "pin")).rejects.toThrow();
    expect(() => assertStepUpMethod("pin")).toThrow();
    expect(a.rpc).not.toHaveBeenCalled();
  });
  it("keeps today's behaviour on a database without record_step_up", async () => {
    await expect(recordStepUp(admin({ code: "PGRST202", message: "Could not find the function public.record_step_up" }), "o", "password")).resolves.toEqual({ recorded: false });
  });
  it("reports other failures", async () => {
    await expect(recordStepUp(admin({ code: "500", message: "boom" }), "o", "password")).rejects.toThrow("Couldn't record");
  });
});

describe("passkey step-up challenge", () => {
  const rp = relyingPartyFor("https://ledgerline.biz", { NODE_ENV: "production" });
  const saved = (over = {}) => ({ kind: "stepup", origin: rp.origin, challenge: "c", expires_at: new Date(10_000).toISOString(), ...over });
  it("accepts only an unexpired challenge of the same kind from the allowlisted origin", () => {
    expect(challengeUsable(saved(), "stepup", rp.origin, 5_000)).toBe(true);
    expect(challengeUsable(saved({ kind: "unlock" }), "stepup", rp.origin, 5_000)).toBe(false);
    expect(challengeUsable(saved(), "unlock", rp.origin, 5_000)).toBe(false);
    expect(challengeUsable(saved({ origin: "https://www.ledgerline.biz" }), "stepup", rp.origin, 5_000)).toBe(false);
    expect(challengeUsable(saved(), "stepup", rp.origin, 20_000)).toBe(false);
    expect(challengeUsable(null, "stepup", rp.origin, 0)).toBe(false);
  });
  it("refuses origins outside the allowlist", () => {
    expect(() => relyingPartyFor("https://evil.lovable.app", { NODE_ENV: "production" })).toThrow();
  });
  it("refuses external-assistant tokens", () => {
    expect(isAssistantClaims({ client_id: "chatgpt" })).toBe(true);
    expect(isAssistantClaims({ client_id: "" })).toBe(false);
    expect(isAssistantClaims(undefined)).toBe(false);
  });
});

describe("password step-up", () => {
  const deps = (over: Partial<PasswordStepUpDeps> = {}): PasswordStepUpDeps => ({
    userId: "owner", claims: { sub: "owner" }, password: "secret",
    getUser: async () => ({ id: "owner", email: "me@example.com", is_anonymous: false }),
    verify: vi.fn(async () => "owner"),
    admin: admin(), limiter: createAttemptLimiter(), ...over,
  });
  it("records a grant only after the password verifies for the same account", async () => {
    const d = deps();
    await expect(verifyPasswordStepUp(d)).resolves.toEqual({ recorded: true });
    expect(d.verify).toHaveBeenCalledWith("me@example.com", "secret");
    expect((d.admin as ReturnType<typeof admin>).rpc).toHaveBeenCalledWith("record_step_up", { _owner: "owner", _method: "password", _seconds: 300 });
  });
  it("does not record on a wrong password or a different account", async () => {
    for (const verify of [vi.fn(async () => null), vi.fn(async () => "someone-else"), vi.fn(async () => { throw Error("network"); })]) {
      const d = deps({ verify });
      await expect(verifyPasswordStepUp(d)).rejects.toThrow("Couldn't verify");
      expect((d.admin as ReturnType<typeof admin>).rpc).not.toHaveBeenCalled();
    }
  });
  it("refuses guests, accounts without email, and assistant tokens", async () => {
    await expect(verifyPasswordStepUp(deps({ getUser: async () => ({ id: "owner", email: null, is_anonymous: true }) }))).rejects.toThrow("Face ID");
    await expect(verifyPasswordStepUp(deps({ getUser: async () => ({ id: "other", email: "x@y.z" }) }))).rejects.toThrow();
    const d = deps({ claims: { client_id: "assistant" } });
    await expect(verifyPasswordStepUp(d)).rejects.toThrow("assistants");
    expect(d.verify).not.toHaveBeenCalled();
  });
  it("limits wrong passwords per user and resets after success", async () => {
    let now = 0;
    const limiter = createAttemptLimiter({ max: 3, windowMs: 1000, now: () => now });
    const wrong = deps({ limiter, verify: vi.fn(async () => null) });
    for (let i = 0; i < 3; i++) await expect(verifyPasswordStepUp(wrong)).rejects.toThrow("Couldn't verify");
    const right = deps({ limiter });
    await expect(verifyPasswordStepUp(right)).rejects.toThrow("Too many");
    expect(right.verify).not.toHaveBeenCalled();
    // Another user is unaffected.
    await expect(verifyPasswordStepUp(deps({ limiter, userId: "u2", getUser: async () => ({ id: "u2", email: "u2@x.y" }), verify: vi.fn(async () => "u2") }))).resolves.toEqual({ recorded: true });
    now = 1500;
    await expect(verifyPasswordStepUp(right)).resolves.toEqual({ recorded: true });
  });
});
