// Server-side step-up rules, kept free of server-only imports so they can be tested directly.
// Only a verified passkey, the account password or (for passkey registration only) an emailed one-time
// code may record a grant; the 4-digit PIN never reaches the server and is refused here and in the database.
import { isMissingFunction } from "./step-up";

export type StepUpMethod = "passkey" | "password" | "email_otp";
export type StepUpScope = "all" | "credential";
export const STEP_UP_SECONDS = 300;
export type PasskeyKind = "register" | "unlock" | "stepup";
/** The only action an email code ('credential' scope) may authorise. */
export const REGISTER_PASSKEY = "register_passkey";

export function assertStepUpMethod(method: string): StepUpMethod {
  if (method === "passkey" || method === "password" || method === "email_otp") return method;
  throw new Error("This method can't confirm sensitive changes");
}

/** passkey/password confirm every sensitive action; an email code only confirms passkey registration. */
export const scopeFor = (method: StepUpMethod): StepUpScope => (method === "email_otp" ? "credential" : "all");

/** Any Supabase client (typed or not); only `rpc` is used. */
export type RpcClient = { rpc: unknown };
type RpcResult = { data?: unknown; error: { message: string; code?: string } | null };
function rpcOf(client: RpcClient) {
  const call = client.rpc as unknown as (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
  return (fn: string, args?: Record<string, unknown>) => Promise.resolve(call.call(client, fn, args));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The auth session that issued the caller's token (JWT claim session_id), or null. Grants are bound to it. */
export function sessionIdFromClaims(claims: unknown): string | null {
  const s = claims && typeof claims === "object" ? (claims as { session_id?: unknown }).session_id : undefined;
  return typeof s === "string" && UUID.test(s) ? s : null;
}

/**
 * Calls public.record_step_up as the service role. `recorded: false` means the database has no step-up
 * support yet (today's production schema). With a session id the grant authorises only that session.
 */
export async function recordStepUp(admin: RpcClient, owner: string, method: string, session: string | null = null): Promise<{ recorded: boolean }> {
  const m = assertStepUpMethod(method);
  const args: Record<string, unknown> = { _owner: owner, _method: m, _seconds: STEP_UP_SECONDS };
  if (session) args["_session"] = session;
  if (m === "email_otp") args["_scope"] = "credential";
  const { error } = await rpcOf(admin)("record_step_up", args);
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

export const RATE_LIMITED_MESSAGE = "Too many failed confirmations. Wait 15 minutes and try again.";

/** In-memory per-user failure count. Only the fallback for a database without the shared limiter (see createSharedStepUpLimiter). */
export function createAttemptLimiter(opts: { max?: number; windowMs?: number; now?: () => number } = {}) {
  const max = opts.max ?? 5, windowMs = opts.windowMs ?? 15 * 60_000, now = opts.now ?? Date.now;
  const fails = new Map<string, number[]>();
  const recent = (key: string) => (fails.get(key) ?? []).filter((t) => now() - t < windowMs);
  return {
    check(key: string) {
      const list = recent(key); fails.set(key, list);
      if (list.length >= max) throw new Error(RATE_LIMITED_MESSAGE);
    },
    fail(key: string) { fails.set(key, [...recent(key), now()]); },
    reset(key: string) { fails.delete(key); },
  };
}
export type AttemptLimiter = ReturnType<typeof createAttemptLimiter>;

/** One verification attempt: finish(true) after the credential verified, finish(false) otherwise. */
export type StepUpAttempt = { finish(ok: boolean): Promise<void> };
/** Counts step-up verifications (password, passkey, email code) per owner; begin throws when locked out. */
export type StepUpLimiter = { begin(owner: string, method: StepUpMethod, session: string | null): Promise<StepUpAttempt> };

/** Adapter for the in-memory limiter (per server instance). */
export function memoryStepUpLimiter(limiter: AttemptLimiter = createAttemptLimiter()): StepUpLimiter {
  return {
    async begin(owner) {
      limiter.check(owner);
      return { async finish(ok) { if (ok) limiter.reset(owner); else limiter.fail(owner); } };
    },
  };
}

/**
 * Shared limiter in the database (begin_step_up_attempt / finish_step_up_attempt, service role): counts
 * failures and unfinished attempts across every server instance and concurrent request. On a database
 * without these functions (today's production schema, which also lacks record_step_up) it falls back to
 * the in-memory limiter, i.e. today's per-instance behaviour. Any other database error fails closed.
 */
export function createSharedStepUpLimiter(admin: RpcClient, fallback: StepUpLimiter = memoryStepUpLimiter()): StepUpLimiter {
  const rpc = rpcOf(admin);
  return {
    async begin(owner, method, session) {
      const { data, error } = await rpc("begin_step_up_attempt", { _owner: owner, _method: method, _session: session });
      if (error) {
        if (isMissingFunction(error)) return fallback.begin(owner, method, session);
        throw new Error("Couldn't check your confirmation. Please try again.");
      }
      // NULL means locked out: the database kept a 'step_up_rate_limited' audit row instead of raising.
      if (typeof data !== "string" || !data) throw new Error(RATE_LIMITED_MESSAGE);
      const id = data;
      return {
        async finish(ok) {
          const r = await rpc("finish_step_up_attempt", { _id: id, _ok: ok });
          // An unfinished attempt already counts as a failure, so a lost finish can only make the limit stricter.
          if (r.error) throw new Error("Couldn't record your confirmation. Please try again.");
        },
      };
    },
  };
}

/** Process-wide fallback used when the database has no shared limiter yet. */
export const fallbackStepUpLimiter = memoryStepUpLimiter();

type AccountUser = { id: string; email?: string | null; is_anonymous?: boolean | null };

export type PasswordStepUpDeps = {
  userId: string;
  claims: unknown;
  password: string;
  /** The caller's own account, read with the caller's token. */
  getUser: () => Promise<AccountUser | null>;
  /** Signs in on an isolated, non-persistent client; returns the verified user id or null. Never touches the caller's session. */
  verify: (email: string, password: string) => Promise<string | null>;
  admin: RpcClient;
  limiter: StepUpLimiter;
};

async function counted(limiter: StepUpLimiter, owner: string, method: StepUpMethod, session: string | null, check: () => Promise<boolean>) {
  const attempt = await limiter.begin(owner, method, session);
  let ok = false;
  try { ok = await check(); } catch { ok = false; }
  await attempt.finish(ok);
  return ok;
}

export async function verifyPasswordStepUp(d: PasswordStepUpDeps): Promise<{ recorded: boolean }> {
  if (isAssistantClaims(d.claims)) throw new Error("Connected assistants can't confirm changes");
  if (!d.password) throw new Error("Enter your account password");
  const session = sessionIdFromClaims(d.claims);
  const user = await d.getUser();
  if (!user || user.id !== d.userId || !user.email || user.is_anonymous) throw new Error("Use Face ID / passkey, or sign out and sign in with your password.");
  const email = user.email;
  const ok = await counted(d.limiter, d.userId, "password", session, async () => (await d.verify(email, d.password)) === d.userId);
  if (!ok) throw new Error("Couldn't verify your password. Try again.");
  return recordStepUp(d.admin, d.userId, "password", session);
}

export type EmailCodeAccountDeps = { claims: unknown; userId: string; getUser: () => Promise<AccountUser | null> };

async function emailAccount(d: EmailCodeAccountDeps) {
  if (isAssistantClaims(d.claims)) throw new Error("Connected assistants can't confirm changes");
  const user = await d.getUser();
  if (!user || user.id !== d.userId || !user.email || user.is_anonymous) throw new Error("This account has no email address to send a code to.");
  return user.email;
}

/** Sends a one-time sign-in code to the account's own email (never creates an account). */
export async function requestEmailCodeStepUp(d: EmailCodeAccountDeps & { send: (email: string) => Promise<void> }): Promise<{ sent: true }> {
  const email = await emailAccount(d);
  try { await d.send(email); } catch { throw new Error("Couldn't send a code. Please try again in a minute."); }
  return { sent: true };
}

export type EmailCodeStepUpDeps = EmailCodeAccountDeps & {
  code: string;
  /** Verifies the code on an isolated, non-persistent client; returns the verified user id or null. Never touches the caller's session. */
  verifyCode: (email: string, code: string) => Promise<string | null>;
  admin: RpcClient;
  limiter: StepUpLimiter;
};

/**
 * Trusted method for accounts without a password (e.g. Google sign-in): an emailed one-time code,
 * verified on the server, counted by the shared limiter, recorded as method email_otp with scope
 * 'credential', so it only ever authorises passkey registration.
 */
export async function verifyEmailCodeStepUp(d: EmailCodeStepUpDeps): Promise<{ recorded: boolean }> {
  const email = await emailAccount(d);
  const code = d.code.trim();
  if (!/^\d{6,10}$/.test(code)) throw new Error("Enter the code from the email");
  const session = sessionIdFromClaims(d.claims);
  const ok = await counted(d.limiter, d.userId, "email_otp", session, async () => (await d.verifyCode(email, code)) === d.userId);
  if (!ok) throw new Error("That code didn't work. Check the latest email and try again.");
  return recordStepUp(d.admin, d.userId, "email_otp", session);
}
