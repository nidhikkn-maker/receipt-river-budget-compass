// Rules for the accountant's statement upload link. Pure and runtime-neutral (Web Crypto only).

export const LINK_DAYS = 30;
export const MAX_FILES = 50; // at least 25 promised; 50 gives headroom
export const MAX_BYTES = 20 * 1024 * 1024;
export const ALLOWED = /\.(pdf|csv|xls|xlsx|png|jpe?g|webp)$/i;
export const PUBLIC_ORIGIN = "https://ledgerline.biz";

export type LinkRow = { id: string; expires_at: string; revoked_at: string | null; file_count: number; max_files: number };
export type LinkEvent = { linkId: string; kind: "created" | "emailed" | "opened" | "uploaded" | "turned_off" | "expired"; detail: string | null; at: string };

/** Newest-first history; expiry is derived from each link's end date (never stored), so it can't be missed. */
export function linkHistory(events: LinkEvent[], links: Pick<LinkRow, "id" | "expires_at" | "revoked_at">[], now = new Date()): LinkEvent[] {
  const expired = links.filter((l) => !l.revoked_at && new Date(l.expires_at) <= now).map((l) => ({ linkId: l.id, kind: "expired" as const, detail: null, at: l.expires_at }));
  return [...events, ...expired].sort((a, b) => b.at.localeCompare(a.at));
}

export type LinkState = "active" | "expired" | "revoked" | "full";

export function linkState(l: LinkRow, now = new Date()): LinkState {
  if (l.revoked_at) return "revoked";
  if (new Date(l.expires_at) <= now) return "expired";
  if (l.file_count >= l.max_files) return "full";
  return "active";
}

export function fileProblem(name: string, size: number): string | null {
  if (!ALLOWED.test(name)) return "Only PDF, Excel, CSV or photo files";
  if (size <= 0) return "Empty file";
  if (size > MAX_BYTES) return "Larger than 20 MB";
  return null;
}

/** True when the monthly email is due today (day of month in India) and none went out this month. */
export function sendDue(sendDay: number, lastSent: string | null, now = new Date()): boolean {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  if (ist.getUTCDate() !== sendDay) return false;
  if (!lastSent) return true;
  const last = new Date(new Date(lastSent).getTime() + 5.5 * 3600_000);
  return !(last.getUTCFullYear() === ist.getUTCFullYear() && last.getUTCMonth() === ist.getUTCMonth());
}

const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function mac(secret: string, id: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`accountant-upload:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id)));
}

/** Token = link id + signature; nothing secret is stored, and the owner's link can be shown again. */
export async function signToken(secret: string, linkId: string) { return `${linkId}.${await mac(secret, linkId)}`; }

export async function verifyToken(secret: string, token: string): Promise<string | null> {
  const [id, sig] = token.split(".");
  if (!id || !sig || !UUID.test(id)) return null;
  const want = await mac(secret, id);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? id : null;
}
