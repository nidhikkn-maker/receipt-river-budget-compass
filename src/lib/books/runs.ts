/**
 * Durable Statement Desk document runs [v6 §3, §62]: every upload records the step it reached in the
 * owner-scoped document_runs table, so a failed or unfinished document can be resumed or retried
 * without repeating work or leaving half-saved records. The run id is also the document id, so a
 * retried save finds the copy it already stored instead of creating a second one.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { Step } from "./intake";

export type RunStatus = "running" | "waiting" | "failed" | "done" | "cancelled";
export interface DocRun {
  id: string; fileName: string; context: string; stage: Step; status: RunStatus; error: string | null;
  documentId: string | null; data: RunData; attempts: number; updatedAt: string;
}
/** What a run keeps between attempts: where the original is parked and what was read from it. */
export interface IntakeAttempt { id: string; documentId: string; data: import('../preferences').FinancePreferences; lock: boolean; expected: number; route: string }
export interface RunData { stashPath?: string | undefined; mimeType?: string | undefined; size?: number | undefined; read?: unknown; docType?: string | undefined; fields?: unknown; replacesId?: string | undefined; intakeAttempt?: IntakeAttempt | undefined }

/** A run owns exactly one document identity across every retry. */
export const documentIdForRun = (runId: string) => runId;

/** Runs the owner can still act on, newest first. */
export const isOpen = (r: Pick<DocRun, "status">) => r.status === "waiting" || r.status === "failed" || r.status === "running";
/** A run left "running" for over 15 minutes was interrupted (tab closed, network lost). */
export function effectiveStatus(r: Pick<DocRun, "status" | "updatedAt">, now = Date.now()): RunStatus {
  return r.status === "running" && now - Date.parse(r.updatedAt) > 15 * 60_000 ? "failed" : r.status;
}

const toRun = (x: { id: string; file_name: string; context: string; stage: string; status: string; error: string | null; document_id: string | null; data: Json; attempts: number; updated_at: string }): DocRun => ({
  id: x.id, fileName: x.file_name, context: x.context, stage: x.stage as Step, status: x.status as RunStatus, error: x.error,
  documentId: x.document_id, data: (x.data && typeof x.data === "object" ? x.data : {}) as RunData, attempts: x.attempts, updatedAt: x.updated_at,
});

async function owner(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Sign in again to continue");
  return id;
}

export async function startRun(id: string, file: File, context: string, extra: RunData = {}): Promise<DocRun> {
  const uid = await owner();
  const existing = await supabase.from("document_runs").select("*").eq("id", id).maybeSingle();
  if (existing.data) {
    const up = await supabase.from("document_runs").update({ status: "running", error: null, attempts: existing.data.attempts + 1, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (up.error) throw new Error(up.error.message);
    return toRun(up.data);
  }
  // Park the original so the run can resume on any device without re-uploading.
  const stashPath = `${uid}/runs/${id}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  const st = await supabase.storage.from("receipts").upload(stashPath, file, { contentType: file.type || "application/octet-stream", upsert: true });
  const data: RunData = { ...extra, mimeType: file.type, size: file.size, ...(st.error ? {} : { stashPath }) };
  const ins = await supabase.from("document_runs").insert({ id, owner_id: uid, file_name: file.name.slice(0, 200), context, stage: "Upload", status: "running", data: data as unknown as Json, attempts: 1 }).select("*").single();
  if (ins.error) throw new Error(ins.error.message);
  return toRun(ins.data);
}

export async function updateRun(id: string, patch: { stage?: Step; status?: RunStatus; error?: string | null; documentId?: string | null; data?: RunData }): Promise<void> {
  const row: Database["public"]["Tables"]["document_runs"]["Update"] = { updated_at: new Date().toISOString() };
  if (patch.stage) row["stage"] = patch.stage;
  if (patch.status) row["status"] = patch.status;
  if (patch.error !== undefined) row["error"] = patch.error === null ? null : patch.error.slice(0, 500);
  if (patch.documentId !== undefined) row["document_id"] = patch.documentId;
  if (patch.data) row["data"] = patch.data as unknown as Json;
  const { error } = await supabase.from("document_runs").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function openRuns(): Promise<DocRun[]> {
  const { data, error } = await supabase.from("document_runs").select("*").in("status", ["running", "waiting", "failed"]).order("updated_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRun);
}

/** Download the parked original for a resumed run. */
export async function runFile(r: DocRun): Promise<File> {
  if (!r.data.stashPath) throw new Error("The original was not kept for this run — upload it again");
  const { data, error } = await supabase.storage.from("receipts").download(r.data.stashPath);
  if (error || !data) throw new Error("Couldn't fetch the original for this run");
  return new File([data], r.fileName, { type: r.data.mimeType || data.type });
}

/** Finish or discard a run and remove its parked copy (the DocuRepo copy, if any, stays). */
export async function closeRun(r: Pick<DocRun, "id" | "data">, status: "done" | "cancelled"): Promise<void> {
  if (r.data.stashPath) await supabase.storage.from("receipts").remove([r.data.stashPath]);
  await updateRun(r.id, { status, data: { ...r.data, stashPath: undefined } });
}
