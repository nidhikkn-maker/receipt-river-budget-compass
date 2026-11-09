// Passkey (WebAuthn) server rules with injected dependencies, so the same code runs in the server
// functions (passkeys.functions.ts) and in isolated end-to-end tests. Free of server-only imports.
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { challengeUsable, isAssistantClaims, REGISTER_PASSKEY, sessionIdFromClaims, type PasskeyKind, type SavedChallenge, type StepUpLimiter } from "./step-up-server";

export const CHALLENGE_MS = 300_000;

export type StoredPasskey = { owner_id?: string | null; credential_id: string; public_key: string; counter: number | string };

export type PasskeyDeps = {
  userId: string;
  claims: unknown;
  rp: { rpID: string; origin: string };
  now?: () => number;
  /** The caller's own credential ids (read with the caller's token, so RLS limits them to the caller). */
  listCredentialIds: () => Promise<string[]>;
  /** Saves the caller's single pending challenge (replaces any earlier one). */
  saveChallenge: (c: SavedChallenge) => Promise<void>;
  /** Deletes the caller's pending challenge and returns it (single use: deleted even when unusable). */
  takeChallenge: () => Promise<SavedChallenge | null>;
  /** Looks up a credential with the caller's token. */
  findKey: (credentialId: string) => Promise<StoredPasskey | null>;
  /** Registers a new credential with the caller's token (the database requires a fresh register_passkey grant). */
  insertKey: (row: { owner_id: string; credential_id: string; public_key: string; counter: number; transports: string[] }) => Promise<void>;
  updateCounter: (credentialId: string, counter: number) => Promise<void>;
  /**
   * Whether the database holds a fresh grant for this action for the caller's session (has_recent_step_up_for,
   * caller's token). null = the database has no step-up support yet (today's production schema): unchanged behaviour.
   */
  hasFreshGrantFor: (action: string) => Promise<boolean | null>;
  /** Records a passkey grant as the service role, bound to the session. */
  recordStepUp: (owner: string, method: "passkey", session: string | null) => Promise<{ recorded: boolean }>;
  /** Shared step-up rate limit; failed passkey step-ups count like wrong passwords. */
  limiter: StepUpLimiter;
};

const webauthn = () => import("@simplewebauthn/server");
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes).map((b) => String.fromCharCode(b)).join(""));
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function requireRegistrationGrant(d: PasskeyDeps) {
  const fresh = await d.hasFreshGrantFor(REGISTER_PASSKEY);
  if (fresh === false) throw new Error(`STEP_UP_REQUIRED: ${REGISTER_PASSKEY}`);
}

/** Options for register, unlock or stepup; the challenge is saved bound to its kind and origin for five minutes. */
export async function passkeyOptionsCore(d: PasskeyDeps, kind: PasskeyKind): Promise<{ kind: PasskeyKind; options: string }> {
  if ((kind === "stepup" || kind === "register") && isAssistantClaims(d.claims)) throw Error("Connected assistants can't confirm changes");
  if (kind === "register") await requireRegistrationGrant(d);
  const now = d.now ?? Date.now;
  const { generateRegistrationOptions, generateAuthenticationOptions } = await webauthn();
  let ids: string[];
  try { ids = await d.listCredentialIds(); } catch { throw Error("Couldn't load passkeys"); }
  const credentials = ids.map((id) => ({ id }));
  if (kind === "stepup" && !credentials.length) throw Error("No Face ID / passkey is set up for this account. Use your password.");
  const options = kind === "register"
    ? await generateRegistrationOptions({ rpName: "Thapal", rpID: d.rp.rpID, userName: d.userId, userID: new TextEncoder().encode(d.userId), attestationType: "none", excludeCredentials: credentials, authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" } })
    : await generateAuthenticationOptions({ rpID: d.rp.rpID, allowCredentials: credentials, userVerification: "required" });
  try { await d.saveChallenge({ challenge: options.challenge, origin: d.rp.origin, kind, expires_at: new Date(now() + CHALLENGE_MS).toISOString() }); }
  catch { throw Error("Couldn't start Face ID verification"); }
  return { kind, options: JSON.stringify(options) };
}

/** Verifies a registration or assertion against the consumed challenge; a verified "stepup" records a passkey grant. */
export async function verifyPasskeyCore(d: PasskeyDeps, kind: PasskeyKind, response: Record<string, unknown>): Promise<{ ok: true; recorded: boolean }> {
  if ((kind === "stepup" || kind === "register") && isAssistantClaims(d.claims)) throw Error("Connected assistants can't confirm changes");
  const now = d.now ?? Date.now;
  let challenge: SavedChallenge | null;
  try { challenge = await d.takeChallenge(); } catch { challenge = null; }
  if (!challengeUsable(challenge, kind, d.rp.origin, now())) throw Error("Face ID request expired; try again");
  const { verifyRegistrationResponse, verifyAuthenticationResponse } = await webauthn();
  if (kind === "register") {
    await requireRegistrationGrant(d);
    const result = await verifyRegistrationResponse({ response: response as unknown as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: d.rp.origin, expectedRPID: d.rp.rpID, requireUserVerification: true });
    if (!result.verified) throw Error("Face ID verification failed");
    const c = result.registrationInfo.credential;
    try { await d.insertKey({ owner_id: d.userId, credential_id: c.id, public_key: toBase64(c.publicKey), counter: c.counter, transports: c.transports ?? [] }); }
    catch { throw Error("Couldn't save passkey"); }
    return { ok: true, recorded: false };
  }
  const session = sessionIdFromClaims(d.claims);
  const id = typeof response["id"] === "string" ? response["id"] : "";
  // Only step-ups are counted by the shared limiter; unlock keeps its existing behaviour.
  const attempt = kind === "stepup" ? await d.limiter.begin(d.userId, "passkey", session) : null;
  let newCounter: number;
  try {
    const key = await d.findKey(id);
    // RLS already hides other owners' keys; the owner check is defence in depth for any other lookup.
    if (!key || (key.owner_id != null && key.owner_id !== d.userId)) throw Error("Passkey not found");
    const result = await verifyAuthenticationResponse({ response: response as unknown as AuthenticationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: d.rp.origin, expectedRPID: d.rp.rpID, requireUserVerification: true, credential: { id: key.credential_id, publicKey: fromBase64(key.public_key), counter: Number(key.counter) } });
    if (!result.verified) throw Error("Face ID verification failed");
    newCounter = result.authenticationInfo.newCounter;
  } catch (e) {
    await attempt?.finish(false);
    throw e;
  }
  await attempt?.finish(true);
  try { await d.updateCounter(id, newCounter); } catch { throw Error("Couldn't finish verification"); }
  if (kind !== "stepup") return { ok: true, recorded: false };
  return { ok: true, ...await d.recordStepUp(d.userId, "passkey", session) };
}
