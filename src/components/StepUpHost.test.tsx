import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type TestUser = { id: string; email?: string; identities?: { provider: string }[]; app_metadata?: Record<string, unknown> };
const m = vi.hoisted(() => ({
  user: null as TestUser | null, passkeyRows: [] as unknown[],
  pw: vi.fn(), send: vi.fn(), code: vi.fn(), passkey: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/step-up.functions", () => ({ stepUpWithPassword: m.pw, requestStepUpEmailCode: m.send, stepUpWithEmailCode: m.code }));
vi.mock("@/lib/device-passkey", () => ({ useDevicePasskey: () => m.passkey }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: m.user }, error: m.user ? null : { message: "no session" } }) },
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: m.passkeyRows, error: null }) }) }) }),
  rpc: vi.fn(),
} }));
import { StepUpHost } from "./StepUpHost";
import { requestStepUp } from "@/lib/step-up";

const passwordUser: TestUser = { id: "owner", email: "kk@example.test", identities: [{ provider: "email" }], app_metadata: { provider: "email", providers: ["email"] } };
const googleUser: TestUser = { id: "owner", email: "kk@example.test", identities: [{ provider: "google" }], app_metadata: { provider: "google", providers: ["google"] } };

beforeEach(() => {
  for (const f of [m.pw, m.send, m.code, m.passkey]) f.mockReset();
  m.user = passwordUser; m.passkeyRows = [{ credential_id: "a" }];
  m.pw.mockResolvedValue({ recorded: true }); m.send.mockResolvedValue({ sent: true }); m.code.mockResolvedValue({ recorded: true }); m.passkey.mockResolvedValue({ ok: true, recorded: true });
});
afterEach(cleanup);

/** Mounts the host, asks for a confirmation and waits until the account's methods are known. */
async function ask(action: string) {
  render(<StepUpHost />);
  let settled: boolean | undefined;
  let p!: Promise<boolean>;
  act(() => { p = requestStepUp(action); void p.then((v) => { settled = v; }); });
  await screen.findByRole("dialog");
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument());
  return { result: () => settled, promise: () => p };
}
const settle = () => act(async () => { await Promise.resolve(); });

it("offers the emailed code only for adding a passkey", async () => {
  const other = await ask("delete_my_finance_data");
  await waitFor(() => expect(screen.getByLabelText("Account password")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /Email me a code/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await other.promise()).toBe(false);
  cleanup();
  await ask("register_passkey");
  expect(await screen.findByRole("button", { name: /Email me a code/ })).toBeInTheDocument();
});

it("shows the password only to accounts with one and Face ID / passkey only when one exists", async () => {
  m.passkeyRows = [];
  await ask("delete_my_finance_data");
  await waitFor(() => expect(screen.queryByRole("button", { name: /Use Face ID/ })).toBeNull());
  expect(screen.getByLabelText("Account password")).toBeInTheDocument();
  cleanup();
  m.user = googleUser; m.passkeyRows = [{ credential_id: "a" }];
  await ask("revoke_entity_access");
  await waitFor(() => expect(screen.queryByLabelText("Account password")).toBeNull());
  expect(screen.getByRole("button", { name: /Use Face ID/ })).toBeInTheDocument();
  cleanup();
  // Google-only account without a passkey: adding one works with the emailed code alone
  m.passkeyRows = [];
  await ask("register_passkey");
  await waitFor(() => expect(screen.queryByRole("button", { name: /Use Face ID/ })).toBeNull());
  expect(screen.queryByLabelText("Account password")).toBeNull();
  expect(screen.getByRole("button", { name: /Email me a code/ })).toBeInTheDocument();
  cleanup();
  // ... and other sensitive actions explain how to get a method instead of offering nothing silently
  await ask("delete_my_finance_data");
  expect(await screen.findByText(/Add Face ID \/ a passkey in Settings → Security first/)).toBeInTheDocument();
});

it("sends and verifies the emailed code through the server functions, then settles as confirmed", async () => {
  m.user = googleUser; m.passkeyRows = [];
  const r = await ask("register_passkey");
  fireEvent.click(await screen.findByRole("button", { name: /Email me a code/ }));
  await waitFor(() => expect(m.send).toHaveBeenCalledTimes(1));
  fireEvent.change(await screen.findByLabelText("Code from the email"), { target: { value: "424242" } });
  fireEvent.click(screen.getByRole("button", { name: /Verify code/ }));
  expect(await r.promise()).toBe(true);
  expect(m.code).toHaveBeenCalledWith({ data: { code: "424242" } });
  expect(m.pw).not.toHaveBeenCalled();
});

it("a wrong code shows the error and does not settle as success; Cancel then resolves false", async () => {
  m.user = googleUser; m.passkeyRows = [];
  m.code.mockRejectedValue(new Error("That code didn't work. Check the latest email and try again."));
  const r = await ask("register_passkey");
  fireEvent.click(await screen.findByRole("button", { name: /Email me a code/ }));
  fireEvent.change(await screen.findByLabelText("Code from the email"), { target: { value: "111111" } });
  fireEvent.click(screen.getByRole("button", { name: /Verify code/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work");
  await settle();
  expect(r.result()).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await r.promise()).toBe(false);
});

it("password and passkey confirmations call the server and settle as confirmed; a wrong password does not", async () => {
  const r = await ask("delete_my_finance_data");
  m.pw.mockRejectedValueOnce(new Error("Couldn't verify your password. Try again."));
  fireEvent.change(await screen.findByLabelText("Account password"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't verify your password");
  await settle();
  expect(r.result()).toBeUndefined();
  fireEvent.change(screen.getByLabelText("Account password"), { target: { value: "right" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify password" }));
  expect(await r.promise()).toBe(true);
  expect(m.pw).toHaveBeenLastCalledWith({ data: { password: "right" } });
  cleanup();
  const s = await ask("revoke_entity_access");
  fireEvent.click(await screen.findByRole("button", { name: /Use Face ID/ }));
  expect(await s.promise()).toBe(true);
  expect(m.passkey).toHaveBeenCalledWith("stepup");
});

it("Cancel resolves false without calling any server function", async () => {
  const r = await ask("register_passkey");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await r.promise()).toBe(false);
  for (const f of [m.pw, m.send, m.code, m.passkey]) expect(f).not.toHaveBeenCalled();
});

it("never offers the 4-digit PIN", async () => {
  for (const action of ["register_passkey", "delete_my_finance_data"]) {
    await ask(action);
    await waitFor(() => expect(screen.getByRole("button", { name: /Use Face ID/ })).toBeInTheDocument());
    expect(screen.queryByLabelText(/pin/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /pin/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^\d$/ })).toBeNull(); // no PIN pad digits
    expect(screen.getByText(/MPIN can't be used for this/)).toBeInTheDocument();
    cleanup();
  }
});
