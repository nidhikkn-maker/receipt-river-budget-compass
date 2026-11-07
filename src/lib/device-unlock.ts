// A short-lived UI handoff only. This never establishes an account session.
let handoff: { ownerId: string; expiresAt: number } | undefined;

export function rememberDeviceUnlock(ownerId: string, now = Date.now()) {
  handoff = { ownerId, expiresAt: now + 30_000 };
}

export function consumeDeviceUnlock(ownerId: string, now = Date.now()) {
  const saved = handoff;
  handoff = undefined;
  return Boolean(saved && saved.ownerId === ownerId && now < saved.expiresAt);
}