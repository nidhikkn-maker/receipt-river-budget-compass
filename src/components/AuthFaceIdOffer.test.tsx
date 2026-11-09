// The post-sign-in Face ID offer on /auth (src/routes/auth.tsx): adding a passkey needs a fresh
// re-confirmation, shown by a StepUpHost mounted only for that offer. Real device-passkey, step-up-check,
// step-up and StepUpHost; server functions, Supabase and the browser WebAuthn call are mocked.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const OWNER = "owner";
const m = vi.hoisted(() => ({
  signedIn: false,
  nav: vi.fn(), confirm: vi.fn(), rpc: vi.fn(), signIn: vi.fn(),
  options: vi.fn(), verify: vi.fn(), startRegistration: vi.fn(),
  pw: vi.fn(), send: vi.fn(), code: vi.fn(),
}));
const user = () => (m.signedIn ? { id: OWNER, email: "kk@example.test", identities: [{ provider: "email" }], app_metadata: { provider: "email", providers: ["email"] } } : null);
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({ ...opts, useSearch: () => ({}) }),
  useNavigate: () => m.nav,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ cancelQueries: async () => {}, clear: () => {} }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@lovable.dev/cloud-auth-js/styles.css", () => ({}));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: { signInWithOAuth: vi.fn() } } }));
vi.mock("@/lib/confirm", () => ({ confirmAction: m.confirm }));
vi.mock("@/lib/passkeys.functions", () => ({ passkeyOptions: m.options, verifyPasskey: m.verify }));
vi.mock("@/lib/step-up.functions", () => ({ stepUpWithPassword: m.pw, requestStepUpEmailCode: m.send, stepUpWithEmailCode: m.code }));
vi.mock("@simplewebauthn/browser", () => ({ startRegistration: m.startRegistration, startAuthentication: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    getUser: async () => ({ data: { user: user() }, error: user() ? null : { message: "no session" } }),
    signInWithPassword: m.signIn,
  },
  rpc: m.rpc,
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
} }));
import { Route } from "@/routes/auth";

const Auth = (Route as unknown as { component: ComponentType }).component;

beforeEach(() => {
  localStorage.clear();
  m.signedIn = false;
  for (const f of [m.nav, m.confirm, m.rpc, m.signIn, m.options, m.verify, m.startRegistration, m.pw, m.send, m.code]) f.mockReset();
  m.signIn.mockImplementation(async () => { m.signedIn = true; return { error: null }; });
  m.confirm.mockResolvedValue(true);
  m.rpc.mockResolvedValue({ data: false, error: null }); // no fresh grant yet
  m.pw.mockResolvedValue({ recorded: true });
  m.options.mockResolvedValue({ kind: "register", options: JSON.stringify({ challenge: "c" }) });
  m.startRegistration.mockResolvedValue({ id: "cred" });
  m.verify.mockResolvedValue({ ok: true, recorded: false });
});
afterEach(cleanup);

async function signIn() {
  render(<Auth />);
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "kk@example.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "account-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(m.confirm).toHaveBeenCalled());
}

it("accepting the offer asks for re-confirmation first and registers only after the server records a grant", async () => {
  await signIn();
  expect(await screen.findByRole("dialog")).toHaveTextContent("Adding Face ID / a passkey needs a fresh check");
  expect(m.rpc).toHaveBeenCalledWith("has_recent_step_up_for", { _action: "register_passkey" });
  expect(m.options).not.toHaveBeenCalled();
  fireEvent.change(await screen.findByLabelText("Account password"), { target: { value: "account-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify password" }));
  await waitFor(() => expect(localStorage.getItem(`ll-lock-${OWNER}`)).toBe("1"));
  expect(m.pw).toHaveBeenCalledWith({ data: { password: "account-password" } });
  expect(m.pw.mock.invocationCallOrder[0]).toBeLessThan(m.options.mock.invocationCallOrder[0] ?? 0);
  expect(m.options).toHaveBeenCalledWith({ data: { kind: "register" } });
  expect(m.verify).toHaveBeenCalledWith({ data: { kind: "register", response: { id: "cred" } } });
  expect(localStorage.getItem(`ll-face-offer-${OWNER}`)).toBeNull();
  await waitFor(() => expect(m.nav).toHaveBeenCalledWith({ to: "/dashboard" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("cancelling the re-confirmation marks the offer 'later' as today and registers nothing", async () => {
  await signIn();
  await screen.findByRole("dialog");
  fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(localStorage.getItem(`ll-face-offer-${OWNER}`)).toBe("later"));
  expect(m.options).not.toHaveBeenCalled();
  expect(m.verify).not.toHaveBeenCalled();
  expect(localStorage.getItem(`ll-lock-${OWNER}`)).toBeNull();
  await waitFor(() => expect(m.nav).toHaveBeenCalledWith({ to: "/dashboard" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("declining the offer keeps today's behaviour: marked 'later', no confirmation dialog", async () => {
  m.confirm.mockResolvedValue(false);
  await signIn();
  await waitFor(() => expect(localStorage.getItem(`ll-face-offer-${OWNER}`)).toBe("later"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(m.rpc).not.toHaveBeenCalled();
});

it("the confirmation dialog is never shown on the remembered-account (locked) screen", async () => {
  m.signedIn = true;
  render(<Auth />);
  expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(m.rpc).not.toHaveBeenCalled();
});
