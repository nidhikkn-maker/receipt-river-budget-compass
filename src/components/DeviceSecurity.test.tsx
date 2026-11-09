import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rows: [] as unknown[], rpc: vi.fn(), del: vi.fn(), signOut: vi.fn(), confirm: vi.fn(), ensure: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ userId: "owner" }) }));
vi.mock("@/lib/confirm", () => ({ confirmAction: m.confirm }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a> }));
vi.mock("@/lib/step-up-check", async (orig) => ({ ...(await orig<typeof import("@/lib/step-up-check")>()), ensureStepUp: m.ensure }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: m.rpc,
  auth: { signOut: m.signOut },
  from: () => ({
    select: () => ({ eq: () => ({ order: async () => ({ data: m.rows, error: null }) }) }),
    delete: () => ({ eq: (_c1: string, v1: string) => ({ eq: (_c2: string, v2: string) => m.del(v1, v2) }) }),
  }),
} }));
import { AccountRecovery, PasskeyDevices, SignOutOtherDevices } from "./DeviceSecurity";
import { removePasskey, transportLabel } from "@/lib/passkey-devices";

beforeEach(() => {
  for (const f of [m.rpc, m.del, m.signOut, m.confirm, m.ensure]) f.mockReset();
  m.confirm.mockResolvedValue(true); m.ensure.mockResolvedValue(undefined);
  m.del.mockResolvedValue({ error: null }); m.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);

it("lists this account's passkeys with created date, transports and last use when available", async () => {
  m.rows = [
    { credential_id: "a", created_at: "2026-10-01T00:00:00Z", transports: ["internal", "hybrid"], last_used_at: "2026-11-08T00:00:00Z", id: "11111111-1111-1111-1111-111111111111" },
    { credential_id: "b", created_at: "2026-09-02T00:00:00Z", transports: [] },
  ];
  render(<PasskeyDevices />);
  expect(await screen.findByText("Built into this device · Phone nearby")).toBeInTheDocument();
  expect(screen.getByText(/Added 1 Oct 2026 · Last used 8 Nov 2026/)).toBeInTheDocument();
  expect(screen.getByText(/^Added 2 Sept? 2026$/)).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Remove passkey/ })).toHaveLength(2);
});

it("removes a passkey through remove_device_passkey after step-up", async () => {
  m.rows = [{ credential_id: "a", created_at: "2026-10-01T00:00:00Z", transports: ["internal"], id: "11111111-1111-1111-1111-111111111111" }];
  m.rpc.mockResolvedValue({ data: null, error: null });
  render(<PasskeyDevices />);
  fireEvent.click(await screen.findByRole("button", { name: /Remove passkey/ }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("remove_device_passkey", { _id: "11111111-1111-1111-1111-111111111111" }));
  expect(m.ensure).toHaveBeenCalledWith("remove_device_passkey", { always: true });
  expect(m.del).not.toHaveBeenCalled();
});

it("falls back to the owner-only delete on a database without remove_device_passkey, still after re-confirmation", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
  await removePasskey({ credential_id: "a", created_at: "", transports: [], id: "x" }, "owner");
  expect(m.ensure).toHaveBeenCalled();
  expect(m.del).toHaveBeenCalledWith("owner", "a");
  m.del.mockClear(); m.rpc.mockClear();
  await removePasskey({ credential_id: "b", created_at: "", transports: [] }, "owner");
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.del).toHaveBeenCalledWith("owner", "b");
});

it("never removes when re-confirmation is cancelled", async () => {
  m.ensure.mockRejectedValue(new Error("Confirmation wasn't completed"));
  await expect(removePasskey({ credential_id: "a", created_at: "", transports: [], id: "x" }, "owner")).rejects.toThrow();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.del).not.toHaveBeenCalled();
});

it("signs out other devices only after confirmation and step-up", async () => {
  render(<SignOutOtherDevices />);
  fireEvent.click(screen.getByRole("button", { name: /Sign out all other devices/ }));
  await waitFor(() => expect(m.signOut).toHaveBeenCalledWith({ scope: "others" }));
  expect(m.ensure).toHaveBeenCalledWith("sign_out_other_devices", { always: true });
});

it("explains secure recovery: email reset, never the PIN", () => {
  render(<AccountRecovery />);
  expect(screen.getByRole("link", { name: "Reset password" })).toHaveAttribute("href", "/reset-password");
  expect(screen.getByText(/can't recover your account or confirm sensitive changes/)).toBeInTheDocument();
  expect(transportLabel("bad")).toBe("Passkey");
});
