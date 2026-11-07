import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), create: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: mocks.getUser } } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
import { verifyDevicePassword } from "./device-reauth";

describe("Device password verification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://auth.example.test");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner", email: "owner@example.test" } }, error: null });
    mocks.create.mockReturnValue({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut } });
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