const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Unambiguous date for people reading Indian or US formats alike: "2026-11-09" → "09 Nov 2026". Display only:
 * stored values stay ISO (YYYY-MM-DD). Anything that is not a real ISO date is returned unchanged.
 */
export function displayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = MONTHS[Number(mo) - 1];
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (!month || new Date(t).getUTCDate() !== Number(d)) return iso;
  return `${d} ${month} ${y}`;
}
