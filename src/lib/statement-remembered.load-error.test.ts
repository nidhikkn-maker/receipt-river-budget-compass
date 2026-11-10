// P0-004 sweep (StatementInbox remembered account): a failed lookup of the account a statement used last time must
// be an error the screen shows with Retry, never "no remembered account" (which silently filed lines under All accounts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const net = vi.hoisted(() => ({ fail: true, rows: [] as { account_key: string }[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => Promise.resolve(done(net.fail ? { data: null, error: { message: "network" } } : { data: net.rows, error: null })) };
  for (const n of ["select", "eq", "neq", "order", "limit"]) q[n] = () => q; return q; } } }));
import { rememberedStatementAccount } from "./statement-remembered";
import { readFileSync } from "node:fs";

beforeEach(() => { net.fail = true; net.rows = []; });

describe("P0-004 remembered statement account", () => {
  it("throws on a failed read, and returns the remembered account (or none) once the read works", async () => {
    await expect(rememberedStatementAccount("hdfc-oct.csv", ["bank-1"])).rejects.toThrow(/Couldn't check which account/);
    net.fail = false;
    await expect(rememberedStatementAccount("hdfc-oct.csv", ["bank-1"])).resolves.toBeNull();
    net.rows = [{ account_key: "bank-1" }];
    await expect(rememberedStatementAccount("hdfc-oct.csv", ["bank-1"])).resolves.toBe("bank-1");
    await expect(rememberedStatementAccount("hdfc-oct.csv", ["other"])).resolves.toBeNull();
  });

  it("StatementInbox shows the failure with Retry instead of reading it as no remembered account", () => {
    const src = readFileSync("src/components/StatementInbox.tsx", "utf8");
    expect(src).toMatch(/rememberFailed && <LoadError[^>]*what="the account this statement used last time"[^>]*onRetry=\{\(\) => applyRemembered\(rememberFailed\)\}/);
    expect(src).not.toMatch(/const \{ data \} = await supabase\.from\("statement_line_imports"\)\.select\("account_key"\)/);
  });
});
