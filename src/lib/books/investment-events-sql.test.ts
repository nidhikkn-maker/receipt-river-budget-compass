// @vitest-environment node
// Persistence regression in isolated PostgreSQL; never touches real records.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mergeInvestmentDoc, type InvestDoc } from "../investments/demat";
import { statementActionAlerts } from "./investment-alerts";

const db = new PGlite();
beforeAll(async () => {
  await db.exec("CREATE TABLE public.security_holdings(id text PRIMARY KEY, events jsonb)");
  // Exercise the exact additive migration against the pre-migration shape.
  await db.exec("ALTER TABLE public.security_holdings DROP COLUMN events");
  await db.exec(readFileSync("drizzle/migrations/0064_retain_investment_statement_events.sql", "utf8"));
}, 20000);
afterAll(async () => db.close());

it("saved source events read back into one alert after an idempotent retry", async () => {
  const doc: InvestDoc = { kind: "transactions", broker: "Test", dpId: "", clientId: "", holder: "", asOf: null, holdings: [], trades: [], gains: [], events: [{ isin: "INE002A01018", name: "Controlled holding", date: "2026-10-20", kind: "dividend", quantity: null, amount: 500 }] };
  const holding = { isin: "INE002A01018", name: "Controlled holding", quantity: 100, asOf: null, statementValue: null, lots: [], gains: [], sources: [] };
  const merged = mergeInvestmentDoc([holding], doc, "original-document").holdings[0];
  if (!merged) throw new Error("Missing merged holding");
  await db.query("INSERT INTO public.security_holdings(id,events) VALUES ($1,$2::jsonb)", ["controlled", JSON.stringify(merged.events)]);
  const rows = await db.query<{ events: NonNullable<typeof merged.events> }>("SELECT events FROM public.security_holdings WHERE id='controlled'");
  const restored = { ...merged, events: rows.rows[0]?.events ?? [] };
  const retry = mergeInvestmentDoc([restored], doc, "retry-document");
  const alerts = statementActionAlerts([{ id: "account", holdings: retry.holdings }]);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]?.source).toBe("original-document");
  expect(alerts[0]?.note).toContain("500");
  expect(retry.holdings[0]?.quantity).toBe(100);
});

it("legacy rows default to no fabricated corporate actions", async () => {
  await db.exec("INSERT INTO public.security_holdings(id) VALUES ('legacy')");
  expect((await db.query("SELECT events FROM public.security_holdings WHERE id='legacy'")).rows).toEqual([{ events: [] }]);
});