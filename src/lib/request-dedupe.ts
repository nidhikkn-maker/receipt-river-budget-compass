/**
 * Coalesce identical reads that are already in flight, so several parts of one
 * screen asking for the same records share one request. Nothing is cached after
 * the request settles, so every later read still sees fresh records.
 */
const inflight = new Map<string, Promise<unknown>>();

export function shareInflight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run().finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/** Run at most once per interval (per key); used for background session re-checks. */
const lastRun = new Map<string, number>();
export function throttled(key: string, intervalMs: number, run: () => void, now = Date.now()): boolean {
  const last = lastRun.get(key);
  if (last !== undefined && now - last < intervalMs) return false;
  lastRun.set(key, now); run(); return true;
}
