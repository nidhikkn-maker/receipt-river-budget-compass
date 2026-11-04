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
  return (await localDrafts(owner).catch(() => [])).filter((d) => d.data.pendingScan).length;
}

type Extract = (a: { data: { dataUrl: string; mimeType: string; includeItems: boolean } }) => Promise<{ ok: true; result: { merchant?: string | null; amount?: number | null; date?: string | null; currency?: string | null; title?: string | null; subtotal?: number | null; tax?: number | null; tip?: number | null; round_off?: number | null; text?: string | null } } | { ok: false; error: string }>;

export async function processOfflineScans(owner: string, extract: Extract): Promise<number> {
  if (!navigator.onLine) return 0;
  let done = 0;
  const { prepareForReading } = await import("./image-prep");
  for (const d of await localDrafts(owner)) {
    if (!d.data.pendingScan || !d.files[0]) continue;
    const f = localToFile(d.files[0]);
    try {
      const raw = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(f); });
      const prepared = await prepareForReading(raw, f.type);
      const res = await extract({ data: { ...prepared, includeItems: false } });
      const data: Record<string, unknown> = { ...d.data, pendingScan: false };
      if (res.ok) {
        const x = res.result;
        Object.assign(data, {
          extracted: true, txnType: "expense",
          ...(x.merchant ? { merchant: x.merchant } : {}), ...(x.title || x.merchant ? { title: x.title || x.merchant } : {}),
          ...(x.amount != null ? { amount: String(x.amount) } : {}), ...(x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? { date: x.date } : {}),
          ...(x.currency && /^[A-Za-z]{3}$/.test(x.currency) ? { currency: x.currency.toUpperCase() } : {}),
          receiptDetails: { subtotal: x.subtotal ?? null, tax: x.tax ?? null, tip: x.tip ?? null, roundOff: x.round_off != null && Math.abs(x.round_off) <= 1 ? x.round_off : null, text: x.text ?? "" },
        });
      } else data.error = res.error;
      await putLocalDraft(owner, { ...d, data, updatedAt: new Date().toISOString() });
      done++;
    } catch { /* still offline or reading failed to connect: stays queued for the next reconnect */ }
  }
  return done;
}
