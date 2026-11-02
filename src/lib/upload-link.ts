// Rules for the accountant's statement upload link. Pure and runtime-neutral (Web Crypto only).

export const LINK_DAYS = 30;
export const MAX_FILES = 50; // at least 25 promised; 50 gives headroom
export const MAX_BYTES = 20 * 1024 * 1024;
export const ALLOWED = /\.(pdf|csv|xls|xlsx|png|jpe?g|webp)$/i;
export const PUBLIC_ORIGIN = "https://ledgerline.biz";

export type LinkRow = { id: string; expires_at: string; revoked_at: string | null; file_count: number; max_files: number };
export type LinkEvent = { linkId: string; kind: "created" | "emailed" | "opened" | "uploaded" | "turned_off" | "expired" | "reminded" | "owner_notified"; detail: string | null; at: string };

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

export const REMINDER_AFTER_DAYS = 4;
/** One reminder per link: emailed at least 4 days ago, still open, and nothing uploaded yet. */
export function reminderDue(l: { emailedAt: string | null; fileCount: number; reminded: boolean; expiresAt: string; revokedAt: string | null }, now = new Date()): boolean {
  if (!l.emailedAt || l.reminded || l.fileCount > 0 || l.revokedAt) return false;
  if (new Date(l.expiresAt).getTime() <= now.getTime()) return false;
  return now.getTime() - new Date(l.emailedAt).getTime() >= REMINDER_AFTER_DAYS * 86400_000;
}

export const NOTIFY_GAP_MIN = 30;
/** Owner gets one "files uploaded" email per link per 30 minutes, so a 25-file batch sends one email. */
export function ownerNotifyDue(lastNotified: string | null, now = new Date()): boolean {
  return !lastNotified || now.getTime() - new Date(lastNotified).getTime() >= NOTIFY_GAP_MIN * 60_000;
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

/** One file the accountant sent through a link, and whether Statement Desk has read it yet. */
export type RequestUpload = { linkId: string; fileName: string; uploadedAt: string; consumedAt: string | null };
export type RequestLink = LinkRow & { created_at: string; last_emailed_at: string | null };

/** What happened about one month's upload request: email, opens, files, reminder, owner confirmation. */
export type UploadRequest = {
  id: string;
  month: string;
  createdOn: string;
  state: LinkState;
  expiresAt: string;
  emailedAt: string | null;
  emailedTo: string | null;
  openedAt: string | null;
  opens: number;
  files: number;
  maxFiles: number;
  names: string[];
  waiting: number;
  reminderAt: string | null;
  reminder: "sent" | "due" | "not-needed" | "waiting" | "closed";
  confirmAt: string | null;
  confirmTo: string | null;
};

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** Builds the monthly request list, newest first, from raw owner-scoped rows. Pure: nothing here reaches the database. */
export function requestReport(links: RequestLink[], events: LinkEvent[], uploads: RequestUpload[], now = new Date()): UploadRequest[] {
  const evOf = new Map<string, LinkEvent[]>();
  for (const e of events) { const a = evOf.get(e.linkId) ?? []; a.push(e); evOf.set(e.linkId, a); }
  const upOf = new Map<string, RequestUpload[]>();
  for (const u of uploads) { const a = upOf.get(u.linkId) ?? []; a.push(u); upOf.set(u.linkId, a); }
  const latest = (list: { at: string }[], kind: LinkEvent["kind"]) =>
    list.filter((e) => e.kind === kind).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

  return [...links]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((l) => {
      const ev = evOf.get(l.id) ?? [];
      const ups = (upOf.get(l.id) ?? []).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      const emailed = latest(ev, "emailed"), opened = latest(ev, "opened"),
        reminded = latest(ev, "reminded"), notified = latest(ev, "owner_notified");
      let reminder: UploadRequest["reminder"];
      if (reminded) reminder = "sent";
      else if (l.file_count > 0) reminder = "not-needed";
      else if (!l.last_emailed_at) reminder = "closed";
      else if (reminderDue({ emailedAt: l.last_emailed_at, fileCount: l.file_count, reminded: false, expiresAt: l.expires_at, revokedAt: l.revoked_at }, now)) reminder = "due";
      else if (linkState(l, now) === "active") reminder = "waiting";
      else reminder = "closed";
      return {
        id: l.id,
        month: MONTH.format(new Date(l.created_at)),
        createdOn: l.created_at,
        state: linkState(l, now),
        expiresAt: l.expires_at,
        emailedAt: l.last_emailed_at,
        emailedTo: emailed?.detail ?? null,
        openedAt: opened?.at ?? null,
        opens: ev.filter((e) => e.kind === "opened").length,
        files: l.file_count,
        maxFiles: l.max_files,
        names: ups.map((u) => u.fileName),
        waiting: ups.filter((u) => !u.consumedAt).length,
        reminderAt: reminded?.at ?? null,
        reminder,
        confirmAt: notified?.at ?? null,
        confirmTo: notified?.detail ?? null,
      };
    });
}

