/**
 * Spreadsheet statements with a running Balance column: derive the opening and closing
 * figures only when every line has a balance and every step agrees with its amount to the
 * paisa, in one consistent order (oldest-first or newest-first) and one sign convention
 * (account: credits raise it; card: debits raise what is owed). Anything else returns null,
 * so the file keeps reporting "closing not printed" instead of a guessed figure.
 */
export type RunLine = { amount: number; direction: "debit" | "credit"; balance?: number | null };
const paise = (n: number) => Math.round(n * 100);

export function runningBalanceEnds(lines: readonly RunLine[]): { opening: number; closing: number; owed: boolean } | null {
  if (!lines.length || lines.some((l) => typeof l.balance !== "number" || !Number.isFinite(l.balance) || !Number.isFinite(l.amount))) return null;
  const fits: { opening: number; closing: number; owed: boolean }[] = [];
  for (const chron of [lines, [...lines].reverse()]) {
    for (const owed of [false, true]) {
      const step = (l: RunLine) => paise(l.amount) * ((l.direction === "credit") !== owed ? 1 : -1);
      let ok = true;
      for (let i = 1; i < chron.length && ok; i++) ok = paise(chron[i]!.balance!) - paise(chron[i - 1]!.balance!) === step(chron[i]!);
      if (ok) fits.push({ opening: (paise(chron[0]!.balance!) - step(chron[0]!)) / 100, closing: paise(chron.at(-1)!.balance!) / 100, owed });
    }
  }
  // A single line fits every reading; more than one distinct reading is ambiguous.
  const unique = new Map(fits.map((f) => [`${f.opening}|${f.closing}|${f.owed}`, f]));
  return unique.size === 1 ? [...unique.values()][0]! : null;
}
