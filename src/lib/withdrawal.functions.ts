import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { changeWithdrawal, type WithdrawalDb } from "./withdrawal.server";

const Input = z.object({ id: z.string().uuid(), action: z.enum(["withdraw", "restore"]), reason: z.string().max(500) });

/** RB-LED-01: Withdraw / Restore an entry. The server (and, with P10, the database) decides; see withdrawal.server.ts. */
export const setEntryWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    try {
      return await changeWithdrawal(context.supabase as unknown as WithdrawalDb, context.userId, data);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
