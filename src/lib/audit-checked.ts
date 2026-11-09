// Records-check "checked" list rules. Pure so selection, marking and Undo are testable.

/** Select every visible key, keeping previously selected ones without duplicates. */
export function selectVisible(picked: string[], visible: string[]): string[] {
  return [...new Set([...picked, ...visible])];
}

/** Mark keys as checked (on) or restore them to open (off). Never touches records. */
export function setChecked(current: string[], keys: string[], on: boolean): string[] {
  // Audit marks are audit records (retention.ts): never truncated.
  if (on) return [...new Set([...current, ...keys])];
  const drop = new Set(keys);
  return current.filter((k) => !drop.has(k));
}

/** Split findings into open and checked lists. */
export function splitChecked<T extends { key: string }>(items: T[], checked: string[]): { open: T[]; done: T[] } {
  const set = new Set(checked);
  return { open: items.filter((i) => !set.has(i.key)), done: items.filter((i) => set.has(i.key)) };
}
