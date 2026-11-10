// P0-006 / RB-P1-02 (KK 9 Nov): sensitive exports are authorised server-side with workspace isolation, step-up where the
// existing pattern requires it, and an append-only audit (who, whose data, which company, kind, rows, bytes, SHA-256, when).
// Shared rules for the export server functions (exports.functions.ts) and the browser gate (export-gate.ts). With the proposed
// P15 SQL the database decides (authorise_export, export_audit); before P15 the server function applies the same scope rules
// from the caller's own grants and lets only the caller's own exports through (they cannot be audited until P15 exists).
import { isMissingFunction } from "./step-up";

export const EXPORT_KINDS = {
  backup: { sensitive: true, scope: "own" },
  report: { sensitive: false, scope: "own" },
  ledger_csv: { sensitive: false, scope: "own" },
  evidence: { sensitive: true, scope: "own" },
  company_pack: { sensitive: true, scope: "own" },
  tax_filing: { sensitive: true, scope: "own" },
  personal: { sensitive: false, scope: "own" },
  shared_company: { sensitive: false, scope: "shared_company" },
  team_company_tax: { sensitive: true, scope: "team" },
} as const;
export type ExportKind = keyof typeof EXPORT_KINDS;
export interface ExportRequest { kind: ExportKind; ownerId?: string | null | undefined; entityId?: string | null | undefined; fileName: string; rows: number; bytes: number; sha256: string }
export interface ExportGrant { exportId: string | null; audited: boolean }

interface Res { data: unknown; error: { message: string; code?: string } | null }
interface Q extends PromiseLike<Res> { select(c: string): Q; eq(k: string, v: unknown): Q; is(k: string, v: null): Q; limit(n: number): Q }
export interface ExportDb { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Res>; from: (table: string) => Q }

/** SHA-256 (hex) of the exact bytes handed to the person. */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const view = new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); // an ArrayBuffer-backed copy
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", view)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The server decision. Throws the database/server refusal; returns the audit id (null only before P15, own exports). */
export async function authoriseExportFor(db: ExportDb, userId: string, req: ExportRequest): Promise<ExportGrant> {
  const kind = EXPORT_KINDS[req.kind];
  if (!kind) throw Error("P15_INVALID: unknown export kind");
  const r = await db.rpc("authorise_export", { p_kind: req.kind, p_owner: req.ownerId ?? null, p_entity: req.entityId ?? null, p_file: req.fileName, p_rows: req.rows, p_bytes: req.bytes, p_sha256: req.sha256 });
  if (!r.error) return { exportId: String(r.data), audited: true };
  if (!isMissingFunction(r.error)) throw Error(r.error.message);
  // Before P15: the same scope rules, checked here from the caller's own grants (read with the caller's token). Nothing can be
  // audited until P15 exists; the response says so (audited: false).
  const owner = req.ownerId ?? userId;
  if (kind.scope === "own") {
    if (owner !== userId) throw Error("P15_NOT_PERMITTED: this export covers your own records only");
    return { exportId: null, audited: false };
  }
  if (kind.scope === "shared_company") {
    if (owner === userId || !req.entityId) throw Error("P15_NOT_PERMITTED: you are not granted export of that company's records");
    const m = await db.from("entity_members").select("id").eq("owner_id", owner).eq("entity_id", req.entityId).eq("member_id", userId).is("revoked_at", null).limit(1);
    if (m.error) throw Error("Couldn't check your access. Nothing was exported; try again.");
    if (!Array.isArray(m.data) || !m.data.length) throw Error("P15_NOT_PERMITTED: you are not granted export of that company's records");
    return { exportId: null, audited: false };
  }
  const can = await db.rpc("can_do", { _action: "view_company_tax" });
  const role = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "finance").limit(1);
  if (can.error || role.error) throw Error("Couldn't check your access. Nothing was exported; try again.");
  if (can.data !== true || !Array.isArray(role.data) || !role.data.length) throw Error("P15_NOT_PERMITTED: the company tax list is exported by Finance with the company-tax switch");
  return { exportId: null, audited: false };
}

/** Plain wording for the refusal codes. */
export function exportProblem(message: string): string {
  const code = /^(P15_[A-Z_]+|STEP_UP_REQUIRED):/.exec(message)?.[1];
  const rest = message.replace(/^[A-Z0-9_]+: /, "");
  if (code === "STEP_UP_REQUIRED") return "Confirm it's you to export this file.";
  if (code) return rest.replace(/^./, (c) => c.toUpperCase());
  return message;
}
