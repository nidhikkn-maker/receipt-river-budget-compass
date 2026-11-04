import { fileToLocal, localDrafts, localToFile, putLocalDraft } from "./offline";

/* Receipt photos taken offline are kept as encrypted device drafts marked pendingScan. When the connection
   returns they are read once (prefilling merchant, amount, date and currency only) before the normal draft
   sync uploads them. Category and saving always stay with the owner, so nothing enters the ledger by itself. */
export async function queueOfflineScan(owner: string, files: File[]): Promise<string> {
  const id = crypto.randomUUID();
  await putLocalDraft(owner, { id, data: { pendingScan: true, title: "Receipt photo (taken offline)" }, files: await Promise.all(files.map((f) => fileToLocal(f))), updatedAt: new Date().toISOString() });
  return id;
}

export async function pendingOfflineScans(owner: string): Promise<number> {
  return (await localDrafts(owner).catch(() => [])).filter((d) => d.data["pendingScan"]).length;
}

type Extract = (a: { data: { dataUrl: string; mimeType: string; includeItems: boolean } }) => Promise<{ ok: true; result: { merchant?: string | null; amount?: number | null; date?: string | null; currency?: string | null; title?: string | null; subtotal?: number | null; tax?: number | null; tip?: number | null; round_off?: number | null; text?: string | null } } | { ok: false; error: string }>;

let running: Promise<number> | null = null;
/** One run at a time: a retry tapped while a reconnect run is going joins that run instead of reading twice. */
export function processOfflineScans(owner: string, extract: Extract): Promise<number> {
  running ??= runScans(owner, extract).finally(() => { running = null; });
  return running;
}
async function runScans(owner: string, extract: Extract): Promise<number> {
  if (!navigator.onLine) return 0;
  let done = 0;
  const { prepareForReading } = await import("./image-prep");
  for (const d of await localDrafts(owner)) {
    if (!d.data["pendingScan"] || !d.files[0]) continue;
    const f = localToFile(d.files[0]);
    try {
      const raw = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(f); });
      const prepared = await prepareForReading(raw, f.type);
      const res = await extract({ data: { ...prepared, includeItems: false } });
      if (!res.ok) { await putLocalDraft(owner, { ...d, data: { ...d.data, error: res.error, errorKind: "reading", attempts: Number(d.data["attempts"] ?? 0) + 1, lastTriedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }); continue; }
      const data: Record<string, unknown> = { ...d.data, pendingScan: false, error: undefined };
      {
        const x = res.result;
        Object.assign(data, {
          extracted: true, txnType: "expense",
          ...(x.merchant ? { merchant: x.merchant } : {}), ...(x.title || x.merchant ? { title: x.title || x.merchant } : {}),
          ...(x.amount != null ? { amount: String(x.amount) } : {}), ...(x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? { date: x.date } : {}),
          ...(x.currency && /^[A-Za-z]{3}$/.test(x.currency) ? { currency: x.currency.toUpperCase() } : {}),
          receiptDetails: { subtotal: x.subtotal ?? null, tax: x.tax ?? null, tip: x.tip ?? null, roundOff: x.round_off != null && Math.abs(x.round_off) <= 1 ? x.round_off : null, text: x.text ?? "" },
        });
      }
      await putLocalDraft(owner, { ...d, data, updatedAt: new Date().toISOString() }); // same id: the synced draft row is upserted, never duplicated
      done++;
    } catch (e) { await putLocalDraft(owner, { ...d, data: { ...d.data, error: e instanceof Error ? e.message : "Couldn't connect", errorKind: "upload", attempts: Number(d.data["attempts"] ?? 0) + 1, lastTriedAt: new Date().toISOString() }, updatedAt: d.updatedAt }).catch(() => {}); }
  }
  return done;
}

/** Photos still on this phone, and how many of those failed their last attempt (kept so they can be retried). */
export async function offlineScanStatus(owner: string): Promise<{ waiting: number; failed: number }> {
  const list = (await localDrafts(owner).catch(() => [])).filter((d) => d.data["pendingScan"]);
  return { waiting: list.length, failed: list.filter((d) => d.data["error"]).length };
}
export const RETRY_SCANS_EVENT = "ll-retry-offline-scans";
export const requestScanRetry = () => window.dispatchEvent(new Event(RETRY_SCANS_EVENT));

export interface OfflineScanRow { id: string; name: string; takenAt: string; error: string | null; kind: "reading" | "upload" | null; attempts: number; lastTriedAt: string | null; thumb: string | null }
export async function offlineScanRows(owner: string): Promise<OfflineScanRow[]> {
  return (await localDrafts(owner).catch(() => [])).filter((d) => d.data["pendingScan"]).map((d) => {
    const f = d.files[0]; const err = d.data["error"];
    return { id: d.id, name: f?.name ?? "Receipt photo", takenAt: d.updatedAt, error: typeof err === "string" && err ? err : null, kind: (d.data["errorKind"] as OfflineScanRow["kind"]) ?? null, attempts: Number(d.data["attempts"] ?? 0), lastTriedAt: (d.data["lastTriedAt"] as string) ?? null, thumb: f && f.type.startsWith("image/") ? URL.createObjectURL(localToFile(f)) : null };
  });
}
