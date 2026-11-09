import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
import { ensureStepUp, hasRecentStepUp } from "./step-up-check";
import { StepUpCancelled } from "./step-up";

const missing = { code: "PGRST202", message: "Could not find the function public.has_recent_step_up" };
beforeEach(() => mocks.rpc.mockReset());

it("skips the prompt when a fresh grant exists", async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const prompt = vi.fn();
  await ensureStepUp("restore_finance_backup", { prompt });
  expect(mocks.rpc).toHaveBeenCalledWith("has_recent_step_up", undefined);
  expect(prompt).not.toHaveBeenCalled();
});
it("asks before a long action when no grant exists, and stops if cancelled", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  await ensureStepUp("delete_my_finance_data", { prompt: async () => true });
  await expect(ensureStepUp("delete_my_finance_data", { prompt: async () => false })).rejects.toBeInstanceOf(StepUpCancelled);
});
it("keeps today's behaviour on the current production schema", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: missing });
  expect(await hasRecentStepUp()).toBeNull();
  const prompt = vi.fn().mockResolvedValue(true);
  await ensureStepUp("restore_finance_backup", { prompt });
  expect(prompt).not.toHaveBeenCalled();
  // App-protected actions (sign out other devices, passkey removal) still ask.
  await ensureStepUp("sign_out_other_devices", { always: true, prompt });
  expect(prompt).toHaveBeenCalledWith("sign_out_other_devices");
});
