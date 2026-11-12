// Test-only: the exact catalog entries the proposed P14 rollback retains (brief G9: the read-only disposal audit trail),
// for the CATALOG query shared by p0-038-guc-authority-sql.test.ts and p19-finance-operation-authority-sql.test.ts
// (entries are "kind|name|value"). A reverse rollback through P14 must leave the previous catalog exactly, plus exactly
// these entries: no other leftover schema, function, trigger, policy, column or grant is hidden by this list.
const COLUMNS = ["id", "owner_id", "asset_id", "asset_name", "entity_id", "method", "disposal_date", "proceeds", "proceeds_entry_id", "evidence_document_ids",
  "reason", "book_value", "gain", "entry_id", "inputs", "requested_by", "requested_at", "status", "decided_by", "decided_at", "decision_reason"];
const POLICIES = ["Disposal requests: owner reads retained history", "P14 requests recorded only by the disposal workflow", "P14 requests cannot be changed",
  "P14 requests cannot be deleted", "P14 service reads disposal requests", "P14 demo cleanup removes guest requests"];

/** kind|name of every retained entry. */
export const P14_RETAINED_KEYS: readonly string[] = [
  "n|phase3_p14_audit", "n|phase3_p14_retained",
  "f|phase3_p14_audit.demo_guest(_owner uuid)", "f|phase3_p14_audit.removal_allowed(_owner uuid)", "f|phase3_p14_audit.guard()",
  "f|phase3_p14_audit.follow_erasure()", "f|phase3_p14_audit.track_retained()",
  "t|asset_disposal_requests.asset_disposal_requests_guard", "t|asset_disposal_requests.asset_disposal_requests_no_truncate",
  "t|asset_disposal_requests.asset_disposal_requests_retained_record", "t|expenses.p14_disposal_requests_follow_erasure",
  "r|asset_disposal_requests",
  ...POLICIES.map((p) => `p|public.asset_disposal_requests.${p}`),
  ...COLUMNS.map((c) => `c|asset_disposal_requests.${c}`),
].sort();

const key = (x: string) => x.split("|").slice(0, 2).join("|");

/**
 * Splits a catalog into the retained P14 entries and everything else. `retainedKeys` is sorted kind|name of the retained
 * entries (must equal P14_RETAINED_KEYS exactly); `acl` is the retained table's ACL entry; `rest` must equal the catalog
 * before P14 was installed.
 */
export function splitP14Retained(entries: readonly string[]) {
  const keys = new Set(P14_RETAINED_KEYS);
  const retained = entries.filter((x) => keys.has(key(x)));
  return {
    retainedKeys: retained.map(key).sort(),
    acl: retained.find((x) => x.startsWith("r|asset_disposal_requests|")),
    rest: entries.filter((x) => !keys.has(key(x))),
  };
}

/** The retained table's ACL entry: owner, authenticated SELECT (the owner-only read policy) and service_role SELECT, DELETE (E2 only). */
export const P14_RETAINED_ACL = "r|asset_disposal_requests|{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=rd/postgres}";
