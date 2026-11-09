import { describe, expect, it, vi } from "vitest";
import { assertStepUpMethod, challengeUsable, createAttemptLimiter, createSharedStepUpLimiter, isAssistantClaims, memoryStepUpLimiter, recordStepUp, requestEmailCodeStepUp, scopeFor, sessionIdFromClaims, verifyEmailCodeStepUp, verifyPasswordStepUp, type EmailCodeStepUpDeps, type PasswordStepUpDeps } from "./step-up-server";
import { relyingPartyFor } from "./passkey-origin";

const admin = (error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ error }) });

describe("recordStepUp", () => {
  it("records a five-minute grant for the verified owner", async () => {
    const a = admin();
    await expect(recordStepUp(a, "owner", "passkey")).resolves.toEqual({ recorded: true });
    expect(a.rpc).toHaveBeenCalledWith("record_step_up", { _owner: "owner", _method: "passkey", _seconds: 300 });
  });
  it("binds the grant to the confirming session and records email codes with scope credential only", async () => {
    const a = admin();
    const S = "11111111-2222-4333-8444-555555555555";
    await recordStepUp(a, "owner", "password", S);
    expect(a.rpc).toHaveBeenLastCalledWith("record_step_up", { _owner: "owner", _method: "password", _seconds: 300, _session: S });
    await recordStepUp(a, "owner", "email_otp", S);
    expect(a.rpc).toHaveBeenLastCalledWith("record_step_up", { _owner: "owner", _method: "email_otp", _seconds: 300, _session: S, _scope: "credential" });
    expect(scopeFor("email_otp")).toBe("credential");
    expect(scopeFor("passkey")).toBe("all");
    expect(sessionIdFromClaims({ session_id: S })).toBe(S);
    expect(sessionIdFromClaims({ session_id: "not-a-uuid" })).toBeNull();
    expect(sessionIdFromClaims(undefined)).toBeNull();
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
    admin: admin(), limiter: memoryStepUpLimiter(), ...over,
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
    const limiter = memoryStepUpLimiter(createAttemptLimiter({ max: 3, windowMs: 1000, now: () => now }));
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

describe("shared database limiter", () => {
  const rpcs = (begin: unknown, finish: unknown = { error: null }) => ({ rpc: vi.fn(async (fn: string) => (fn === "begin_step_up_attempt" ? begin : finish)) });
  it("begins and finishes attempts in the database", async () => {
    const a = rpcs({ data: "attempt-1", error: null });
    const attempt = await createSharedStepUpLimiter(a).begin("owner", "password", null);
    await attempt.finish(false);
    expect(a.rpc).toHaveBeenCalledWith("begin_step_up_attempt", { _owner: "owner", _method: "password", _session: null });
    expect(a.rpc).toHaveBeenCalledWith("finish_step_up_attempt", { _id: "attempt-1", _ok: false });
  });
  it("refuses when the database says the owner is locked out (NULL attempt)", async () => {
    await expect(createSharedStepUpLimiter(rpcs({ data: null, error: null })).begin("owner", "passkey", null)).rejects.toThrow("Too many failed confirmations");
  });
  it("falls back to the in-memory limiter only when the functions are missing", async () => {
    const fallback = { begin: vi.fn(async () => ({ finish: async () => {} })) };
    await createSharedStepUpLimiter(rpcs({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }), fallback).begin("owner", "password", null);
    expect(fallback.begin).toHaveBeenCalled();
    await expect(createSharedStepUpLimiter(rpcs({ data: null, error: { code: "500", message: "boom" } }), fallback).begin("owner", "password", null)).rejects.toThrow("Couldn't check");
    expect(fallback.begin).toHaveBeenCalledTimes(1);
  });
});

describe("email code step-up (accounts without a password)", () => {
  const deps = (over: Partial<EmailCodeStepUpDeps> = {}): EmailCodeStepUpDeps => ({
    userId: "owner", claims: { sub: "owner" }, code: "123456",
    getUser: async () => ({ id: "owner", email: "me@example.com", is_anonymous: false }),
    verifyCode: vi.fn(async () => "owner"),
    admin: admin(), limiter: memoryStepUpLimiter(), ...over,
  });
  it("records an email_otp grant with scope credential after the code verifies for the same account", async () => {
    const d = deps();
    await expect(verifyEmailCodeStepUp(d)).resolves.toEqual({ recorded: true });
    expect(d.verifyCode).toHaveBeenCalledWith("me@example.com", "123456");
    expect((d.admin as ReturnType<typeof admin>).rpc).toHaveBeenCalledWith("record_step_up", { _owner: "owner", _method: "email_otp", _seconds: 300, _scope: "credential" });
  });
  it("never records on a wrong code, another account, a malformed code, guests or assistants", async () => {
    for (const verifyCode of [vi.fn(async () => null), vi.fn(async () => "someone-else"), vi.fn(async () => { throw Error("network"); })]) {
      const d = deps({ verifyCode });
      await expect(verifyEmailCodeStepUp(d)).rejects.toThrow("didn't work");
      expect((d.admin as ReturnType<typeof admin>).rpc).not.toHaveBeenCalled();
    }
    await expect(verifyEmailCodeStepUp(deps({ code: "12" }))).rejects.toThrow("Enter the code");
    await expect(verifyEmailCodeStepUp(deps({ getUser: async () => ({ id: "owner", email: null, is_anonymous: true }) }))).rejects.toThrow("no email");
    const bot = deps({ claims: { client_id: "assistant" } });
    await expect(verifyEmailCodeStepUp(bot)).rejects.toThrow("assistants");
    expect(bot.verifyCode).not.toHaveBeenCalled();
  });
  it("sends a code only to the caller's own email and never for assistants", async () => {
    const send = vi.fn(async () => {});
    await expect(requestEmailCodeStepUp({ userId: "owner", claims: {}, getUser: async () => ({ id: "owner", email: "me@example.com" }), send })).resolves.toEqual({ sent: true });
    expect(send).toHaveBeenCalledWith("me@example.com");
    await expect(requestEmailCodeStepUp({ userId: "owner", claims: { client_id: "x" }, getUser: async () => ({ id: "owner", email: "me@example.com" }), send })).rejects.toThrow("assistants");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
