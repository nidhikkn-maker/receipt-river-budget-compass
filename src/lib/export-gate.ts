// P0-006 / RB-P1-02: every file the app hands to a person (download or share) passes this gate first. The server authorises
// it for the caller's own records, a shared company or the Finance team list (workspace and company isolation), asks for a
// step-up where the kind is sensitive, and (with P15) writes the append-only export audit: who, whose data, which company,
// kind, rows, bytes, SHA-256 of these exact bytes. Nothing is handed over if the server refuses.
import { toast } from "sonner";
import { deliverFile, downloadBlob } from "./reports";
import { withStepUp } from "./step-up";
import { exportProblem, sha256Hex, type ExportKind } from "./exports";
import { authoriseExport } from "./exports.functions";

export interface ExportSpec { kind: ExportKind; ownerId?: string | null | undefined; entityId?: string | null | undefined; rows?: number | undefined }

/** The blob's bytes (Response fallback for runtimes whose Blob lacks arrayBuffer/text). */
const blobBytes = async (blob: Blob) => new Uint8Array(typeof blob.arrayBuffer === "function" ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer());
const blobText = async (blob: Blob) => new TextDecoder().decode(await blobBytes(blob));

/** Rows in a CSV (lines after the header), a JSON list, or the given count. */
async function rowsOf(blob: Blob, given: number | undefined): Promise<number> {
  if (given != null) return Math.max(0, Math.floor(given));
  if (/csv/.test(blob.type)) { const t = await blobText(blob); return Math.max(0, t.split(/\r?\n/).filter((l) => l.trim()).length - 1); }
  if (/json/.test(blob.type)) { try { const v: unknown = JSON.parse(await blobText(blob)); return Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0; } catch { return 0; } }
  return 0;
}

/** Authorise on the server; resolves true when the file may be handed over. Shows the reason when it may not. */
export async function authoriseFile(spec: ExportSpec, blob: Blob, fileName: string): Promise<boolean> {
  const bytes = await blobBytes(blob);
  const data = { kind: spec.kind, ownerId: spec.ownerId ?? null, entityId: spec.entityId ?? null, fileName: fileName.slice(0, 200), rows: await rowsOf(blob, spec.rows), bytes: bytes.length, sha256: await sha256Hex(bytes) };
  try {
    const r = await withStepUp(() => authoriseExport({ data }));
    if (!r.ok) { toast.error(exportProblem(r.error)); return false; }
    return true;
  } catch (e) { toast.error(exportProblem((e as Error).message)); return false; }
}

/** Download after server authorisation. */
export async function exportFile(spec: ExportSpec, blob: Blob, fileName: string): Promise<void> {
  if (await authoriseFile(spec, blob, fileName)) downloadBlob(blob, fileName);
}
/** Share sheet on phones / download elsewhere, after server authorisation. */
export async function exportDeliver(spec: ExportSpec, blob: Blob, fileName: string): Promise<void> {
  if (await authoriseFile(spec, blob, fileName)) await deliverFile(blob, fileName);
}
