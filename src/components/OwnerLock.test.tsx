import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestUser = { id: string; email?: string; is_anonymous?: boolean; last_sign_in_at?: string; identities?: { provider: string }[]; app_metadata?: Record<string, unknown> };
const m = vi.hoisted(() => ({
  user: null as TestUser | null,
  passkeyRows: [] as unknown[],
  getUser: vi.fn(), getSession: vi.fn(), signOut: vi.fn(), nav: vi.fn(), passkey: vi.fn(),
  create: vi.fn(), otpSend: vi.fn(), otpVerify: vi.fn(), verifierSignOut: vi.fn(), passwordSignIn: vi.fn(),
  clearOffline: vi.fn(), clearPreparations: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: m.getUser, getSession: m.getSession, signOut: m.signOut, storageKey: "sb-test-auth-token" },
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: m.passkeyRows, error: null }) }) }) }),
} }));
vi.mock("@supabase/supabase-js", () => ({ createClient: m.create }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => m.nav }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ cancelQueries: async () => {}, clear: () => {} }) }));
vi.mock("@/lib/device-passkey", () => ({ useDevicePasskey: () => m.passkey }));
vi.mock("@/lib/offline", () => ({ clearOfflineOwner: m.clearOffline }));
vi.mock("@/lib/claim-preparations", () => ({ clearLocalPreparations: m.clearPreparations }));
import { OwnerLock } from "./OwnerLock";
import { hasMpin, setMpin } from "@/lib/mpin";
import { activityKey } from "@/lib/idle-policy";
import { rememberDeviceUnlock } from "@/lib/device-unlock";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 9, 10, 0, 0);
const OWNER = "owner";
const google: TestUser = { id: OWNER, email: "kk@example.test", identities: [{ provider: "google" }], app_metadata: { provider: "google", providers: ["google"] } };
const passwordUser: TestUser = { id: OWNER, email: "kk@example.test", identities: [{ provider: "email" }], app_metadata: { provider: "email", providers: ["email"] } };
const guest: TestUser = { id: OWNER, is_anonymous: true, identities: [], app_metadata: { provider: "anonymous" } };

const lastActivity = (minutesAgo: number) => localStorage.setItem(activityKey(OWNER), String(Date.now() - minutesAgo * MIN));
const view = () => render(<OwnerLock ownerId={OWNER}><p>Private ledger</p></OwnerLock>);
const pressPin = (pin: string) => { for (const d of pin) fireEvent.click(screen.getByRole("button", { name: d })); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  localStorage.clear(); sessionStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 }); // computer: 15 minutes
  for (const f of Object.values(m)) if (typeof f === "function" && "mockReset" in f) f.mockReset();
  m.passkeyRows = [];
  m.getUser.mockImplementation(async () => ({ data: { user: m.user }, error: null }));
  m.getSession.mockImplementation(async () => ({ data: { session: m.user ? { user: m.user } : null } }));
  m.signOut.mockResolvedValue({ error: null });
  m.nav.mockResolvedValue(undefined);
  m.passkey.mockRejectedValue(new Error("cancelled"));
  m.clearOffline.mockResolvedValue(undefined);
  m.clearPreparations.mockResolvedValue(undefined);
  vi.stubEnv("VITE_SUPABASE_URL", "https://auth.example.test");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  m.verifierSignOut.mockResolvedValue({ error: null });
  m.create.mockReturnValue({ auth: { signInWithOtp: m.otpSend, verifyOtp: m.otpVerify, signInWithPassword: m.passwordSignIn, signOut: m.verifierSignOut } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("fresh start", () => {
  it("opens locked after a long absence even though device lock is off", async () => {
    m.user = passwordUser; lastActivity(16);
    view();
    expect(await screen.findByRole("heading", { name: "Thapal is locked" })).toBeInTheDocument();
    expect(screen.queryByText("Private ledger")).not.toBeInTheDocument();
  });

  it("opens normally after a short absence and keeps counting from the saved activity", async () => {
    m.user = passwordUser; lastActivity(10);
    view();
    expect(await screen.findByText("Private ledger")).toBeInTheDocument();
    // 10 minutes away + 5 more = the 15-minute computer limit.
    act(() => { vi.setSystemTime(T0 + 5 * MIN); document.dispatchEvent(new Event("visibilitychange")); });
    expect(await screen.findByRole("heading", { name: "Thapal is locked" })).toBeInTheDocument();
  });

  it("a fresh sign-in with no activity record opens and records activity", async () => {
    m.user = { ...passwordUser, last_sign_in_at: new Date(T0 - 1 * MIN).toISOString() };
    view();
    expect(await screen.findByText("Private ledger")).toBeInTheDocument();
    expect(Number(localStorage.getItem(activityKey(OWNER)))).toBe(T0 - 1 * MIN);
  });

  it("no activity record and an old sign-in opens locked", async () => {
    m.user = { ...passwordUser, last_sign_in_at: new Date(T0 - 3 * 60 * MIN).toISOString() };
    view();
    expect(await screen.findByRole("heading", { name: "Thapal is locked" })).toBeInTheDocument();
  });

  it("a future activity time cannot keep an old session open", async () => {
    m.user = { ...passwordUser, last_sign_in_at: new Date(T0 - 3 * 60 * MIN).toISOString() };
    localStorage.setItem(activityKey(OWNER), String(T0 + 365 * 24 * 60 * MIN));
    view();
    expect(await screen.findByRole("heading", { name: "Thapal is locked" })).toBeInTheDocument();
  });

  it("a just-completed unlock on /auth is honoured once", async () => {
    m.user = passwordUser; lastActivity(60);
    rememberDeviceUnlock(OWNER);
    view();
    expect(await screen.findByText("Private ledger")).toBeInTheDocument();
  });
});

describe("guests", () => {
  it("a guest without MPIN or Face ID is signed out on inactivity and its device copies are cleared", async () => {
    m.user = guest; lastActivity(1);
    view();
    expect(await screen.findByText("Private ledger")).toBeInTheDocument();
    act(() => { vi.setSystemTime(T0 + 15 * MIN); document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(m.nav).toHaveBeenCalledWith({ to: "/auth", search: { ended: "guest-idle" }, replace: true }));
    expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(m.clearOffline).toHaveBeenCalledWith(OWNER);
    expect(m.clearPreparations).toHaveBeenCalledWith(OWNER);
    expect(localStorage.getItem(activityKey(OWNER))).toBeNull();
    expect(screen.queryByText("Private ledger")).not.toBeInTheDocument();
  });

  it("a guest reopening the app after a long absence is signed out, not shown the app", async () => {
    m.user = guest; lastActivity(30);
    view();
    await waitFor(() => expect(m.nav).toHaveBeenCalledWith({ to: "/auth", search: { ended: "guest-idle" }, replace: true }));
    expect(screen.queryByText("Private ledger")).not.toBeInTheDocument();
  });

  it("a guest with an MPIN is locked (not signed out) and unlocks with it", async () => {
    m.user = guest;
    await setMpin(OWNER, "2580");
    lastActivity(30);
    view();
    expect(await screen.findByText("Enter your MPIN")).toBeInTheDocument();
    expect(m.signOut).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Use account password" })).not.toBeInTheDocument();
    pressPin("2580");
    expect(await screen.findByText("Private ledger")).toBeInTheDocument();
  });
});

describe("unlock methods", () => {
  it("a Google-only account gets an email code, not a password, and unlocks only for the same owner", async () => {
    m.user = google; lastActivity(30);
    m.otpSend.mockResolvedValue({ data: {}, error: null });
    m.otpVerify.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
    view();
    await screen.findByRole("heading", { name: "Thapal is locked" });
    expect(screen.queryByRole("button", { name: "Use account password" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get a code by email" }));
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => expect(m.otpSend).toHaveBeenCalledWith({ email: "kk@example.test", options: { shouldCreateUser: false } }));
    expect(m.create.mock.calls[0]?.[2].auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
    // A new code can't be requested straight away.
    expect(await screen.findByRole("button", { name: /Send a new code in \d+ s/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Code sent to k/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code and unlock" }));
    expect(await screen.findByText("Private ledger")).toBeInTheDocument();
    expect(m.otpVerify).toHaveBeenCalledWith({ email: "kk@example.test", token: "123456", type: "email" });
    expect(m.verifierSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(m.signOut).not.toHaveBeenCalled(); // the app session is never replaced or signed out
  });

  it("refuses a code that verifies a different account", async () => {
    m.user = google; lastActivity(30);
    m.otpSend.mockResolvedValue({ data: {}, error: null });
    m.otpVerify.mockResolvedValue({ data: { user: { id: "someone-else" } }, error: null });
    view();
    await screen.findByRole("heading", { name: "Thapal is locked" });
    fireEvent.click(screen.getByRole("button", { name: "Get a code by email" }));
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => expect(m.otpSend).toHaveBeenCalled());
    fireEvent.change(await screen.findByLabelText(/Code sent to k/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code and unlock" }));
    expect(await screen.findByText(/different account/)).toBeInTheDocument();
    expect(screen.queryByText("Private ledger")).not.toBeInTheDocument();
    expect(m.verifierSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("a password account is offered its password and an email code", async () => {
    m.user = passwordUser; lastActivity(30);
    view();
    await screen.findByRole("heading", { name: "Thapal is locked" });
    expect(screen.getByRole("button", { name: "Use account password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get a code by email" })).toBeInTheDocument();
  });

  it("five wrong PINs remove the MPIN and require a full method", async () => {
    m.user = passwordUser;
    await setMpin(OWNER, "2580");
    lastActivity(30);
    view();
    await screen.findByText("Enter your MPIN");
    for (let left = 4; left >= 1; left--) {
      pressPin("1357");
      expect(await screen.findByText(`Wrong MPIN. ${left} ${left === 1 ? "try" : "tries"} left.`)).toBeInTheDocument();
    }
    pressPin("1357");
    expect(await screen.findByText(/Too many wrong tries, so the MPIN was removed\. Use your account password or a code sent to your email\./)).toBeInTheDocument();
    expect(hasMpin(OWNER)).toBe(false);
    expect(screen.queryByText("Enter your MPIN")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use MPIN" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use account password" })).toBeInTheDocument();
    expect(screen.queryByText("Private ledger")).not.toBeInTheDocument();
  }, 20_000);

  it("a guest whose MPIN is erased after five wrong tries is signed out", async () => {
    m.user = guest;
    await setMpin(OWNER, "2580");
    lastActivity(30);
    view();
    await screen.findByText("Enter your MPIN");
    for (let left = 4; left >= 1; left--) {
      pressPin("1357");
      await screen.findByText(`Wrong MPIN. ${left} ${left === 1 ? "try" : "tries"} left.`);
    }
    pressPin("1357");
    await waitFor(() => expect(m.nav).toHaveBeenCalledWith({ to: "/auth", search: { ended: "guest-idle" }, replace: true }), { timeout: 10_000 }); // five PBKDF2 checks can be slow under parallel load
    expect(screen.queryByText("Private ledger")).not.toBeInTheDocument();
  }, 20_000);
});
