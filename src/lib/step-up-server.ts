// Server-side step-up rules, kept free of server-only imports so they can be tested directly.
// Only a verified passkey or the account password may record a grant; the PIN never reaches the server.
import { isMissingFunction } from "./step-up";

export type StepUpMethod = "passkey" | "password";
export const STEP_UP_SECONDS = 300;
export type PasskeyKind = "register" | "unlock" | "stepup";

export function assertStepUpMethod(method: string): StepUpMethod {
  if (method === "passkey" || method === "password") return method;
  throw new Error("This method can't confirm sensitive changes");
}

/** Any Supabase client (typed or not); only `rpc` is used. */
type RpcClient = { rpc: unknown };

/** Calls public.record_step_up as the service role. `recorded: false` means the database has no step-up support yet. */
export async function recordStepUp(admin: RpcClient, owner: string, method: string): Promise<{ recorded: boolean }> {
  const m = assertStepUpMethod(method);
  const call = admin.rpc as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string; code?: string } | null }>;
  const { error } = await call.call(admin, "record_step_up", { _owner: owner, _method: m, _seconds: STEP_UP_SECONDS });
  if (!error) return { recorded: true };
  if (isMissingFunction(error)) return { recorded: false };
  throw new Error("Couldn't record your confirmation. Please try again.");
}

/** External-assistant (OAuth client) tokens may never confirm sensitive changes. */
export function isAssistantClaims(claims: unknown) {
  const id = claims && typeof claims === "object" ? (claims as { client_id?: unknown }).client_id : undefined;
  return typeof id === "string" && id !== "";
}

export type SavedChallenge = { kind: string; origin: string; expires_at: string; challenge: string };

/** A challenge is single-use (deleted on read), bound to its kind and origin, and expires after five minutes. */
export function challengeUsable(saved: SavedChallenge | null | undefined, kind: PasskeyKind, origin: string, now = Date.now()): saved is SavedChallenge {
  return !!saved && saved.kind === kind && saved.origin === origin && Date.parse(saved.expires_at) >= now;
}

/** In-memory per-user limit on wrong passwords. Each server instance keeps its own count; the auth service adds its own limits. */
export function createAttemptLimiter(opts: { max?: number; windowMs?: number; now?: () => number } = {}) {
  const max = opts.max ?? 5, windowMs = opts.windowMs ?? 15 * 60_000, now = opts.now ?? Date.now;
  const fails = new Map<string, number[]>();
  const recent = (key: string) => (fails.get(key) ?? []).filter((t) => now() - t < windowMs);
  return {
    check(key: string) {
      const list = recent(key); fails.set(key, list);
      if (list.length >= max) throw new Error("Too many wrong passwords. Wait 15 minutes, or use Face ID / passkey.");
    },
    fail(key: string) { fails.set(key, [...recent(key), now()]); },
    reset(key: string) { fails.delete(key); },
  };
}
export type AttemptLimiter = ReturnType<typeof createAttemptLimiter>;

export type PasswordStepUpDeps = {
  userId: string;
  claims: unknown;
  password: string;
  /** The caller's own account, read with the caller's token. */
  getUser: () => Promise<{ id: string; email?: string | null; is_anonymous?: boolean | null } | null>;
  /** Signs in on an isolated, non-persistent client; returns the verified user id or null. Never touches the caller's session. */
  verify: (email: string, password: string) => Promise<string | null>;
  admin: RpcClient;
  limiter: AttemptLimiter;
};

export async function verifyPasswordStepUp(d: PasswordStepUpDeps): Promise<{ recorded: boolean }> {
  if (isAssistantClaims(d.claims)) throw new Error("Connected assistants can't confirm changes");
  if (!d.password) throw new Error("Enter your account password");
  d.limiter.check(d.userId);
  const user = await d.getUser();
  if (!user || user.id !== d.userId || !user.email || user.is_anonymous) throw new Error("Use Face ID / passkey, or sign out and sign in with your password.");
  let verified: string | null = null;
  try { verified = await d.verify(user.email, d.password); } catch { verified = null; }
  if (verified !== d.userId) { d.limiter.fail(d.userId); throw new Error("Couldn't verify your password. Try again."); }
  d.limiter.reset(d.userId);
  return recordStepUp(d.admin, d.userId, "password");
}
