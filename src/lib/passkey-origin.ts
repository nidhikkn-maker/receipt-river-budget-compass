// Passkey relying party: only exact, allowlisted origins may register or use passkeys (security review M-3).
// The request's Origin header alone is never trusted as the relying party.
export interface RelyingParty { origin: string; rpID: string }

/** Production defaults; override with PASSKEY_ALLOWED_ORIGINS (comma-separated exact origins). */
export const DEFAULT_PASSKEY_ORIGINS = [
  "https://ledgerline.biz",
  "https://www.ledgerline.biz",
  "https://id-preview--2c178514-2b71-421c-bc9a-e7c5e85ce4db.lovable.app",
];

const refuse = () => new Error("Passkeys are not available on this address");

/**
 * PASSKEY_ALLOWED_ORIGINS: exact origins (scheme://host[:port]); never a wildcard such as *.lovable.app,
 * because other customers' apps share that domain. PASSKEY_RP_ID: optional registrable domain for
 * production hosts (e.g. "ledgerline.biz") so www and apex share credentials.
 */
export function relyingPartyFor(originHeader: string | null | undefined, env: Record<string, string | undefined>): RelyingParty {
  if (!originHeader) throw new Error("Open this app in your browser to use Face ID");
  let url: URL;
  try { url = new URL(originHeader); } catch { throw refuse(); }
  if (url.origin !== originHeader) throw refuse();
  const allowed = (env["PASSKEY_ALLOWED_ORIGINS"]?.trim() ? env["PASSKEY_ALLOWED_ORIGINS"].split(",") : DEFAULT_PASSKEY_ORIGINS)
    .map((s) => s.trim()).filter((s) => s && !s.includes("*"));
  const devLocal = env["NODE_ENV"] !== "production" && url.protocol === "http:" && url.hostname === "localhost";
  if (!devLocal && (url.protocol !== "https:" || !allowed.includes(url.origin))) throw refuse();
  const rp = env["PASSKEY_RP_ID"]?.trim();
  const rpID = rp && (url.hostname === rp || url.hostname.endsWith(`.${rp}`)) ? rp : url.hostname;
  return { origin: url.origin, rpID };
}
