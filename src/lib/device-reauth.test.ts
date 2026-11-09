import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), create: vi.fn(), otp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: mocks.getUser } } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
import { sendDeviceUnlockCode, verifyDevicePassword, verifyDeviceUnlockCode } from "./device-reauth";

describe("Device password verification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://auth.example.test");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner", email: "owner@example.test" } }, error: null });
    mocks.create.mockReturnValue({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut, signInWithOtp: mocks.otp, verifyOtp: mocks.verifyOtp } });
    mocks.signOut.mockResolvedValue({ error: null });
  });
  it("verifies the same owner without persisting or replacing the app session", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    await verifyDevicePassword("owner", "test-password");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "owner@example.test", password: "test-password" });
    expect(mocks.create.mock.calls[0]?.[2].auth).toMatchObject({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("rejects a different authenticated owner and cleans up the temporary session", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(verifyDevicePassword("owner", "test-password")).rejects.toThrow("Couldn't verify");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("keeps the lock on incorrect passwords", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: "Invalid credentials" } });
    await expect(verifyDevicePassword("owner", "wrong")).rejects.toThrow("Couldn't verify");
  });
  it("refuses anonymous accounts without creating a verifier", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner", is_anonymous: true } }, error: null });
    await expect(verifyDevicePassword("owner", "test-password")).rejects.toThrow("Sign out");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects an account switch during verification", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "owner", email: "owner@example.test" } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: "other" } }, error: null });
    await expect(verifyDevicePassword("owner", "test-password")).rejects.toThrow("account changed");
  });
});
describe("Device email-code verification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://auth.example.test");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner", email: "owner@example.test" } }, error: null });
    mocks.create.mockReturnValue({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut, signInWithOtp: mocks.otp, verifyOtp: mocks.verifyOtp } });
    mocks.signOut.mockResolvedValue({ error: null });
  });
  it("sends a code to the owner's own email without creating accounts or persisting a session", async () => {
    mocks.otp.mockResolvedValue({ data: {}, error: null });
    await sendDeviceUnlockCode("owner");
    expect(mocks.otp).toHaveBeenCalledWith({ email: "owner@example.test", options: { shouldCreateUser: false } });
    expect(mocks.create.mock.calls[0]?.[2].auth).toMatchObject({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  });
  it("explains the auth service's sending limit", async () => {
    mocks.otp.mockResolvedValue({ data: {}, error: { status: 429, message: "rate limit" } });
    await expect(sendDeviceUnlockCode("owner")).rejects.toThrow("Too many codes");
  });
  it("accepts a code only for the locked owner and revokes the temporary session locally", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    await verifyDeviceUnlockCode("owner", "123 456");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "owner@example.test", token: "123456", type: "email" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("refuses a code that verifies another account", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(verifyDeviceUnlockCode("owner", "123456")).rejects.toThrow("different account");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("refuses wrong or malformed codes and guests", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Token has expired or is invalid" } });
    await expect(verifyDeviceUnlockCode("owner", "123456")).rejects.toThrow("didn't work");
    await expect(verifyDeviceUnlockCode("owner", "12ab")).rejects.toThrow("Enter the code");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner", is_anonymous: true } }, error: null });
    await expect(sendDeviceUnlockCode("owner")).rejects.toThrow("Sign out");
    expect(mocks.otp).not.toHaveBeenCalled();
  });
});
