import { p256 } from "@noble/curves/nist.js";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { pushSubscriptionSchema, type privateReminderPayload } from "./push-rules";

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
/** Deterministic P-256 identity derived from the app's encrypted, generated signing seed. */
export async function signingKeys(seed: string) {
  if (seed.length < 32) throw Error("Notification signing is unavailable");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ledgerline-web-push-v1:${seed}`)));
  const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const scalar = (BigInt(`0x${[...digest].map(x=>x.toString(16).padStart(2,"0")).join("")}`) % (order - 1n)) + 1n;
  const privateBytes = Uint8Array.from(scalar.toString(16).padStart(64,"0").match(/../g) ?? [], x=>parseInt(x,16));
  return { publicKey: base64url(p256.getPublicKey(privateBytes,false)), privateKey: base64url(privateBytes), subject: "https://lovable.dev" };
}

export async function sendDevicePush(seed: string, subscription: { endpoint: string; p256dh: string; auth: string }, message: ReturnType<typeof privateReminderPayload>) {
  const parsed = pushSubscriptionSchema.parse({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } });
  const payload = await buildPushPayload({ data: JSON.stringify(message), options: { ttl: 3600 } }, { endpoint: parsed.endpoint, expirationTime: null, keys: parsed.keys }, await signingKeys(seed));
  const response = await fetch(parsed.endpoint, { ...payload, redirect: "error", signal: AbortSignal.timeout(8000) });
  await response.body?.cancel();
  return { ok: response.ok, expired: response.status === 404 || response.status === 410 };
}