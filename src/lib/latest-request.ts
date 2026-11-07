// Latest-request guard: a newer request makes older responses stale so they can't overwrite newer choices.
export function createLatest() {
  let seq = 0;
  return {
    begin() { const id = ++seq; return { id, isCurrent: () => id === seq }; },
    cancel() { seq++; },
  };
}
