// Re-confirmation ("step-up") for sensitive actions. The database decides when it is needed
// (require_recent_step_up raises "STEP_UP_REQUIRED: <action>"); the app asks for Face ID / passkey
// or the account password, the server records a five-minute grant, and the same call is retried once.
// The 4-digit PIN can never satisfy step-up (Decision 30).
export const STEP_UP_PREFIX = "STEP_UP_REQUIRED";

export function errorMessage(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return "";
}

export function isStepUpRequired(e: unknown) {
  return errorMessage(e).trim().startsWith(STEP_UP_PREFIX);
}

/** The action named by the database, e.g. "delete_my_finance_data". */
export function stepUpAction(e: unknown) {
  const m = errorMessage(e).trim();
  return m.startsWith(STEP_UP_PREFIX) ? m.slice(STEP_UP_PREFIX.length).replace(/^\s*:\s*/, "").trim() : "";
}

/** True when the database does not have this function yet (current production schema). */
export function isMissingFunction(e: unknown) {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  if (code === "PGRST202" || code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(errorMessage(e));
}

export class StepUpCancelled extends Error {
  constructor() { super("Confirmation wasn't completed, so nothing was changed."); this.name = "StepUpCancelled"; }
}

export type StepUpPrompt = (action: string) => Promise<boolean>;

type Pending = { action: string; resolve: (ok: boolean) => void };
let listener: ((p: { action: string } | null) => void) | null = null;
const queue: Pending[] = [];

/** Ask the mounted StepUpHost to confirm the person. Resolves false if no host is mounted or it is cancelled. */
export const requestStepUp: StepUpPrompt = (action) => new Promise<boolean>((resolve) => {
  if (!listener) { resolve(false); return; }
  queue.push({ action, resolve });
  if (queue.length === 1) listener(queue[0] ?? null);
});

export function settleStepUp(ok: boolean) {
  const current = queue.shift();
  current?.resolve(ok);
  listener?.(queue[0] ?? null);
}

export function subscribeStepUp(fn: (p: { action: string } | null) => void) {
  listener = fn; fn(queue[0] ?? null);
  return () => {
    if (listener !== fn) return;
    listener = null;
    // Nothing can answer pending requests any more: they count as cancelled.
    while (queue.length) queue.shift()?.resolve(false);
  };
}

function resultError(r: unknown): unknown {
  return r && typeof r === "object" && "error" in r ? (r as { error: unknown }).error : null;
}

/**
 * Run `fn` (a Supabase RPC returning `{ data, error }`, or anything that throws). When it fails with
 * STEP_UP_REQUIRED, ask the person to confirm and retry the same call exactly once. Other errors pass
 * through unchanged, and a second STEP_UP_REQUIRED is returned/thrown as-is rather than prompting again.
 */
export async function withStepUp<T>(fn: () => PromiseLike<T>, prompt: StepUpPrompt = requestStepUp): Promise<T> {
  let needed: unknown = null;
  try {
    const first = await fn();
    const error = resultError(first);
    if (!isStepUpRequired(error)) return first;
    needed = error;
  } catch (e) {
    if (!isStepUpRequired(e)) throw e;
    needed = e;
  }
  if (!await prompt(stepUpAction(needed))) throw new StepUpCancelled();
  return await fn();
}
