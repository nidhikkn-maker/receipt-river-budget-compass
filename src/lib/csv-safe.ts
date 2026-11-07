// Quote a CSV cell and neutralise spreadsheet formulas: text starting with = + - @ tab or CR
// is prefixed with ' so Excel/Sheets show it as plain text. Plain numbers stay numeric.
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
