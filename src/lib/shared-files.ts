// Files shared into the app from another app (WhatsApp, Photos, Files). The service worker keeps them
// on this device only; nothing is uploaded or saved until the owner picks a next step.
export const SHARED_CACHE = "ledgerline-shared";

export type SharedKind = "receipt" | "document" | "unsupported";
export function sharedKind(type: string): SharedKind {
  if (type.startsWith("image/")) return "receipt";
  if (type === "application/pdf") return "document";
  return "unsupported";
}

export function validBatch(batch: unknown): batch is string {
  return typeof batch === "string" && /^\d{10,16}$/.test(batch);
}

export async function readSharedBatch(batch: string): Promise<File[]> {
  if (!validBatch(batch) || typeof caches === "undefined") return [];
  const cache = await caches.open(SHARED_CACHE);
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith(`/__shared/${batch}/`));
  const files: File[] = [];
  for (const k of keys) {
    const res = await cache.match(k);
    if (!res) continue;
    const blob = await res.blob();
    if (!blob.size) continue;
    const name = decodeURIComponent(res.headers.get("x-file-name") || "shared-file");
    files.push(new File([blob], name, { type: res.headers.get("content-type") || blob.type }));
  }
  return files;
}

/** Removes this batch plus anything older than a day so shared files never pile up on the phone. */
export async function clearSharedBatch(batch: string, now = Date.now()): Promise<void> {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(SHARED_CACHE);
  for (const k of await cache.keys()) {
    const b = new URL(k.url).pathname.split("/")[2] ?? "";
    if (b === batch || (validBatch(b) && now - Number(b) > 86_400_000)) await cache.delete(k);
  }
}
