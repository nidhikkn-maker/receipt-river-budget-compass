import { supabase } from "@/integrations/supabase/client";
import { isMissingFunction, requestStepUp, StepUpCancelled, type StepUpPrompt } from "./step-up";

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

/**
 * Phase 1 functions that the generated database types may not list yet. Calls still go through the
 * signed-in client, so RLS and the database's own checks apply exactly as for typed calls.
 */
export function rpcUntyped(name: string, args?: Record<string, unknown>): Promise<RpcResult> {
  const call = supabase.rpc as unknown as (fn: string, params?: Record<string, unknown>) => PromiseLike<RpcResult>;
  return Promise.resolve(call.call(supabase, name, args));
}

/** true/false from the database, or null when this database has no step-up support yet. */
export async function hasRecentStepUp(): Promise<boolean | null> {
  const r = await rpcUntyped("has_recent_step_up");
  if (r.error) return isMissingFunction(r.error) ? null : false;
  return r.data === true;
}

/**
 * Ask for re-confirmation before a long or multi-step sensitive action, so it cannot fail midway.
 * Skipped when a fresh grant exists. When the database has no step-up support yet, today's behaviour is
 * kept unless `always` is set (for actions the app itself protects, such as signing out other devices).
 */
export async function ensureStepUp(action: string, opts: { always?: boolean; prompt?: StepUpPrompt } = {}): Promise<void> {
  let fresh: boolean | null;
  try { fresh = await hasRecentStepUp(); } catch { fresh = false; }
  if (fresh === true) return;
  if (fresh === null && !opts.always) return;
  if (!await (opts.prompt ?? requestStepUp)(action)) throw new StepUpCancelled();
}
