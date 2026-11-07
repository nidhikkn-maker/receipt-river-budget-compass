// In-app confirmation. Browser pop-ups (window.confirm) are blocked in the preview
// frame and some installed apps, where they silently return false.
export type ConfirmRequest = { message: string; title?: string; confirmLabel?: string; cancelLabel?: string };
type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };
let listener: ((p: Pending | null) => void) | null = null;
const queue: Pending[] = [];

export function confirmAction(req: ConfirmRequest | string): Promise<boolean> {
  const r = typeof req === 'string' ? { message: req } : req;
  return new Promise(resolve => {
    queue.push({ ...r, resolve });
    if (queue.length === 1) listener?.(queue[0] ?? null);
  });
}

export function settleConfirm(ok: boolean) {
  const current = queue.shift();
  current?.resolve(ok);
  listener?.(queue[0] ?? null);
}

export function subscribeConfirm(fn: (p: Pending | null) => void) {
  listener = fn; fn(queue[0] ?? null);
  return () => { if (listener === fn) listener = null; };
}
