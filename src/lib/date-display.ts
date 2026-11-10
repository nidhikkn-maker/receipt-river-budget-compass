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

/** A calendar day (local midnight) for an ISO date, or undefined when it isn't a real date. No time zone shift. */
export function toLocalDate(iso: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : undefined;
}

/** The ISO date (YYYY-MM-DD) of a picked calendar day, from its local parts so no locale or time zone changes it. */
export function fromLocalDate(day: Date): string {
  return `${String(day.getFullYear()).padStart(4, "0")}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}
