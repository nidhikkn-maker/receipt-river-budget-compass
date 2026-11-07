import { z } from "zod";

const NavResponse = z.object({
 status: z.literal("SUCCESS"),
 meta: z.object({ scheme_code: z.number().int().positive(), scheme_name: z.string().trim().min(1).max(300) }),
 data: z.array(z.object({ date: z.string(), nav: z.string() })).min(1),
});
export interface FundQuote { schemeCode: string; schemeName: string; nav: number; date: string }

/** NAVs are daily published prices, never assumed to be today's intraday price. */
export function parseFundQuote(input: unknown, schemeCode: string, asOf: string): FundQuote {
 const result = NavResponse.parse(input);
 if (String(result.meta.scheme_code) !== schemeCode) throw Error("The price source returned a different fund");
 const rows = result.data.flatMap(row => {
  const match = row.date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return [];
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  const nav = Number(row.nav);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date || date > asOf || !Number.isFinite(nav) || nav <= 0) return [];
  return [{ date, nav }];
 }).sort((a,b) => b.date.localeCompare(a.date));
 const latest = rows[0];
 if (!latest) throw Error("No valid published NAV is available");
 return { schemeCode, schemeName: result.meta.scheme_name, ...latest };
}

export function fundHoldingValue(units: number, nav: number): number {
 if (!Number.isFinite(units) || units <= 0 || units > 1e12) throw Error("Enter a positive number of units");
 if (!Number.isFinite(nav) || nav <= 0) throw Error("Invalid NAV");
 const value = Math.round(units * nav * 100) / 100;
 if (!Number.isFinite(value) || value <= 0 || value > 1e14) throw Error("Holding value is outside the supported range");
 return value;
}