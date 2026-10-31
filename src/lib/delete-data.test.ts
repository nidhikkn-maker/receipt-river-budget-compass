import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), list: vi.fn(), remove: vi.fn(), rpc: vi.fn(), clear: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: mocks.getUser }, storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) }, rpc: mocks.rpc } }));
vi.mock("./offline", () => ({ clearOfflineOwner: mocks.clear }));
import { deleteFinanceData } from "./delete-data";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.clear.mockResolvedValue(undefined);
});
it("refuses deletion offline", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  await expect(deleteFinanceData("owner")).rejects.toThrow("Reconnect");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("refuses a different signed-in owner", async () => {
  await expect(deleteFinanceData("other")).rejects.toThrow("sign in");
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("keeps files and offline records when the database rejects deletion", async () => {
  mocks.list.mockResolvedValue({ data: [{ name: "bill.jpg", id: "file" }], error: null });
  mocks.rpc.mockResolvedValue({ error: { message: "failed" } });
  await expect(deleteFinanceData("owner")).rejects.toThrow("files were kept");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
});
it("includes unlinked and nested owner files and clears only that owner's offline data", async () => {
  mocks.list.mockResolvedValueOnce({ data: [{ name: "bill.jpg", id: "file" }, { name: "docs", id: null }], error: null })
    .mockResolvedValueOnce({ data: [{ name: "statement.pdf", id: "doc" }], error: null });
  await deleteFinanceData("owner");
  expect(mocks.list.mock.calls.map((call) => call[0])).toEqual(["owner", "owner/docs"]);
  expect(mocks.remove).toHaveBeenCalledWith(["owner/bill.jpg", "owner/docs/statement.pdf"]);
  expect(mocks.clear).toHaveBeenCalledWith("owner");
  expect(mocks.rpc).toHaveBeenCalledWith("delete_my_finance_data");
  expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0] ?? 0);
});
it("reports file cleanup failures without skipping offline cleanup", async () => {
  mocks.list.mockResolvedValue({ data: [{ name: "bill.jpg", id: "file" }], error: null });
  mocks.remove.mockResolvedValue({ error: { message: "failed" } });
  await expect(deleteFinanceData("owner")).rejects.toThrow("Retry to finish");
  expect(mocks.clear).toHaveBeenCalledWith("owner");
});
it("stops before deleting records if file discovery fails", async () => {
  mocks.list.mockResolvedValue({ error: { message: "failed" } });
  await expect(deleteFinanceData("owner")).rejects.toThrow("Nothing was deleted");
  expect(mocks.rpc).not.toHaveBeenCalled();
});