// Minimal Reflect metadata polyfill for tsyringe (used by @peculiar/x509 via SimpleWebAuthn).
// The "reflect-metadata" package was tree-shaken out of the edge bundle, which crashed every request.
type Key = unknown;
const store = new WeakMap<object, Map<Key, Map<Key, unknown>>>();
const R = Reflect as unknown as Record<string, unknown>;
function map(target: object, prop: Key, create: boolean) {
  let t = store.get(target);
  if (!t) { if (!create) return undefined; t = new Map(); store.set(target, t); }
  let p = t.get(prop);
  if (!p) { if (!create) return undefined; p = new Map(); t.set(prop, p); }
  return p;
}
if (typeof R.getMetadata !== "function") {
  R.defineMetadata = (k: Key, v: unknown, target: object, prop?: Key) => { map(target, prop, true)!.set(k, v); };
  R.getOwnMetadata = (k: Key, target: object, prop?: Key) => map(target, prop, false)?.get(k);
  R.hasOwnMetadata = (k: Key, target: object, prop?: Key) => !!map(target, prop, false)?.has(k);
  R.getMetadata = (k: Key, target: object, prop?: Key): unknown => {
    for (let o: object | null = target; o; o = Object.getPrototypeOf(o)) {
      const m = map(o, prop, false);
      if (m?.has(k)) return m.get(k);
    }
    return undefined;
  };
  R.hasMetadata = (k: Key, target: object, prop?: Key) => (R.getMetadata as (...a: unknown[]) => unknown)(k, target, prop) !== undefined;
  R.metadata = (k: Key, v: unknown) => (target: object, prop?: Key) => { map(target, prop, true)!.set(k, v); };
}
export {};
