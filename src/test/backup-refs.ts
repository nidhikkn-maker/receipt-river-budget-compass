// Test-only helpers: list every registered reference in backup data and find the ones that do not resolve.
import { COLUMN_JSON_REFS, COLUMN_REFS, PREFERENCE_REFS, REMAP_TABLES, collectRefs, type Encoding, type RemapTable } from "../lib/backup-remap";
import { BACKUP_TABLES, type Backup } from "../lib/backup";

export interface Ref { path: string; value: string; table: RemapTable | Encoding }

export function allRefs(data: Backup["data"]): Ref[] {
  const out: Ref[] = [];
  for (const t of BACKUP_TABLES) (data[t] ?? []).forEach((row, i) => {
    for (const [col, table] of Object.entries(COLUMN_REFS[t] ?? {})) { const v = row[col]; if (typeof v === "string" && v) out.push({ path: `${t}[${i}].${col}`, value: v, table }); }
    const rules = COLUMN_JSON_REFS[t];
    if (rules) out.push(...collectRefs(row, rules, `${t}[${i}]`));
    if (t === "finance_preferences") out.push(...collectRefs(row["data"], PREFERENCE_REFS, `${t}[${i}].data`));
  });
  return out;
}

export function rowIds(data: Backup["data"]): Map<RemapTable, Set<string>> {
  return new Map(REMAP_TABLES.map((t) => [t, new Set((data[t] ?? []).map((r) => r["id"]).filter((x): x is string => typeof x === "string"))]));
}

/** References whose target row is not present in `data`. */
export function orphans(data: Backup["data"]): Ref[] {
  const ids = rowIds(data);
  return allRefs(data).filter((r) => !ids.get(r.table as RemapTable)?.has(r.value));
}

/** Count rows and money per entity / account name / currency (entries), plus other money registers. */
export function moneyTotals(data: Backup["data"]) {
  const acctName = new Map((data.accounts ?? []).map((a) => [a["id"], a["name"]]));
  const by: Record<string, { n: number; amount: number; original: number }> = {};
  for (const e of data.expenses ?? []) {
    const k = `${String(e["entity_id"] ?? "personal")}|${String(acctName.get(e["account_id"]) ?? "none")}→${String(acctName.get(e["to_account_id"]) ?? "")}|${String(e["currency"])}`;
    const g = (by[k] ??= { n: 0, amount: 0, original: 0 });
    g.n++; g.amount = Math.round((g.amount + Number(e["amount"])) * 100) / 100; g.original = Math.round((g.original + Number(e["original_amount"] ?? e["amount"])) * 100) / 100;
  }
  return {
    entries: by,
    accounts: Object.fromEntries((data.accounts ?? []).map((a) => [String(a["name"]), Number(a["opening_balance"])])),
    loans: (data.loans ?? []).map((l) => Number(l["principal_outstanding"])).sort(),
    valuations: (data.asset_valuations ?? []).map((v) => `${String(acctName.get(v["account_id"]))}:${Number(v["value"])}`).sort(),
    holdings: (data.security_holdings ?? []).map((h) => `${String(h["isin"])}:${Number(h["quantity"])}:${Number(h["statement_value"])}`).sort(),
    rows: Object.fromEntries(BACKUP_TABLES.map((t) => [t, data[t]?.length ?? 0])),
  };
}
