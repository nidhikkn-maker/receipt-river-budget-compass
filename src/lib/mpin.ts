// Device-only 4-digit MPIN for quickly reopening an already signed-in account.
// The PIN never leaves the device: only a salted PBKDF2 hash is kept, keyed by owner.
// It unlocks the device lock; it never creates or replaces a sign-in session.
export const MPIN_LENGTH = 4;
export const MPIN_MAX_TRIES = 5;
const key = (owner: string) => `ll-mpin-${owner}`;

type Stored = { salt: string; hash: string; fails: number };

export function isValidPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) return false;
  // Refuse trivially guessable PINs.
  if (/^(\d)\1{3}$/.test(pin)) return false;
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return false;
  return true;
}

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, owner: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${owner}:${pin}`), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 150_000 }, base, 256));
}

function read(owner: string, store: Storage): Stored | null {
  try { const v = JSON.parse(store.getItem(key(owner)) ?? "null"); return v && typeof v.hash === "string" ? v : null; } catch { return null; }
}

export function hasMpin(owner: string, store: Storage = localStorage) { return Boolean(owner && read(owner, store)); }
export function clearMpin(owner: string, store: Storage = localStorage) { store.removeItem(key(owner)); }

export async function setMpin(owner: string, pin: string, store: Storage = localStorage) {
  if (!owner) throw Error("Open your account first.");
  if (!isValidPin(pin)) throw Error("Choose 4 digits that aren't repeated or in a simple sequence.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  store.setItem(key(owner), JSON.stringify({ salt: b64(salt), hash: await derive(pin, owner, salt), fails: 0 } satisfies Stored));
}

export type PinResult = { ok: true } | { ok: false; left: number; reset: boolean };

/** Wrong PINs count down; after MPIN_MAX_TRIES the PIN is erased and the account password is required. */
export async function verifyMpin(owner: string, pin: string, store: Storage = localStorage): Promise<PinResult> {
  const s = read(owner, store);
  if (!s) return { ok: false, left: 0, reset: true };
  const same = (await derive(pin, owner, unb64(s.salt))) === s.hash;
  if (same) { store.setItem(key(owner), JSON.stringify({ ...s, fails: 0 })); return { ok: true }; }
  const fails = s.fails + 1;
  if (fails >= MPIN_MAX_TRIES) { clearMpin(owner, store); return { ok: false, left: 0, reset: true }; }
  store.setItem(key(owner), JSON.stringify({ ...s, fails }));
  return { ok: false, left: MPIN_MAX_TRIES - fails, reset: false };
}
