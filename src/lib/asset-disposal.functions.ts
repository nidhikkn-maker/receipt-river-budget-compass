import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DISPOSAL_METHODS, cancelDisposal, decideDisposal, disposalProblem, previewDisposal, requestDisposal, type DisposalDb } from "./asset-disposal";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const RequestInput = z.object({
  assetId: z.string().min(1).max(64), method: z.enum(DISPOSAL_METHODS), date: day, proceeds: z.number().min(0).max(1_000_000_000),
  proceedsEntryId: z.string().uuid().nullable().optional(), evidence: z.array(z.string().uuid()).min(1).max(20), reason: z.string().trim().min(5).max(500),
});
const PreviewInput = z.object({ assetId: z.string().min(1).max(64), date: day, proceeds: z.number().min(0).max(1_000_000_000) });
const DecideInput = z.object({ requestId: z.string().uuid(), approve: z.boolean(), reason: z.string().trim().min(5).max(500) });
const CancelInput = z.object({ requestId: z.string().uuid(), reason: z.string().trim().min(5).max(500) });
const wrap = async <T>(run: () => Promise<T>) => {
  try { return { ok: true as const, ...(await run()) }; } catch (e) { return { ok: false as const, error: disposalProblem((e as Error).message) }; }
};

/** P0-015: the owner asks for a disposal; book value and gain are worked out on the server from the stored register. */
export const requestAssetDisposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RequestInput.parse(d))
  .handler(async ({ data, context }) => wrap(() => requestDisposal(context.supabase as unknown as DisposalDb, context.userId, data)));

/** R-E-I14: the server's plan (book value, gain/loss, the disposal entry and its posting) and the database's check; writes nothing. */
export const previewAssetDisposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data, context }) => wrap(() => previewDisposal(context.supabase as unknown as DisposalDb, context.userId, data)));

/** P0-015: the owner (step-up where installed) or a Finance approver for that company approves or rejects. */
export const decideAssetDisposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecideInput.parse(d))
  .handler(async ({ data, context }) => wrap(() => decideDisposal(context.supabase as unknown as DisposalDb, data)));

export const cancelAssetDisposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CancelInput.parse(d))
  .handler(async ({ data, context }) => wrap(() => cancelDisposal(context.supabase as unknown as DisposalDb, data)));
