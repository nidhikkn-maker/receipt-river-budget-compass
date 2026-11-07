import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  NOTE_MAX,
  PROBLEM_KINDS,
  buildReceiptProblem,
  deviceSummaryLines,
  problemLabel,
  type DeviceFacts,
  type ProblemKindId,
} from "@/lib/device-report";
import type { Json } from "@/integrations/supabase/types";

/** Reports about the receipt viewer (zoom, pan, double-tap) with the device and browser that saw them. */

const KINDS = PROBLEM_KINDS.map((kind) => kind.id) as [string, ...string[]];

const factsSchema = z.object({
  ua: z.string().max(500).optional(),
  mobile: z.boolean().optional(),
  platform: z.string().max(60).optional(),
  brands: z.array(z.object({ brand: z.string().max(40), version: z.string().max(30) })).max(12).optional(),
  screenWidth: z.number().max(30000).optional(),
  screenHeight: z.number().max(30000).optional(),
  viewportWidth: z.number().max(30000).optional(),
  viewportHeight: z.number().max(30000).optional(),
  pixelRatio: z.number().max(40).optional(),
  maxTouchPoints: z.number().max(60).optional(),
  pointerEvents: z.boolean().optional(),
  orientation: z.string().max(40).optional(),
  standalone: z.boolean().optional(),
  log: z.array(z.string().max(120)).max(30).optional(),
});

const reportedAt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short" });

/** Saves the report in the owner's own account, then tries to email it to them. */
export const reportReceiptProblem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(KINDS),
    note: z.string().max(NOTE_MAX + 50).default(""),
    receiptName: z.string().max(200).default(""),
    receiptType: z.string().max(100).default(""),
    zoom: z.number().min(0).max(100).default(1),
    facts: factsSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const row = buildReceiptProblem(data);
    const { data: saved, error } = await context.supabase.from("receipt_problem_reports").insert({
      owner_id: context.userId,
      kind: row.kind,
      note: row.note,
      receipt_name: row.receiptName,
      receipt_type: row.receiptType,
      facts: row.facts as unknown as Json,
    }).select("id").maybeSingle();
    if (error || !saved) throw new Error("Couldn't save your report — please try again");

    const email = (context.claims as { email?: string } | undefined)?.email;
    let emailed = false;
    if (email) {
      try {
        const { data: profile } = await context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const out = await sendTemplateEmail("receipt-problem-report", email, {
          templateData: {
            ownerName: profile?.full_name || "",
            kindLabel: problemLabel(row.kind),
            note: row.note,
            deviceLines: deviceSummaryLines(row.facts),
            receiptName: row.receiptName,
            receiptType: row.receiptType,
            at: reportedAt(new Date().toISOString()),
            settingsUrl: "https://ledgerline.biz/settings",
          },
          idempotencyKey: `receipt-problem-${saved.id}`,
        });
        emailed = out.sent;
      } catch {
        emailed = false;
      }
      if (emailed) {
        await context.supabase.from("receipt_problem_reports").update({ emailed: true }).eq("id", saved.id).eq("owner_id", context.userId);
      }
    }
    return { ok: true as const, id: saved.id, emailed };
  });

export interface ReceiptProblem {
  id: string;
  kind: ProblemKindId;
  label: string;
  note: string;
  receiptName: string;
  receiptType: string;
  lines: string[];
  ua: string;
  log: string[];
  emailed: boolean;
  at: string;
}

/** Newest reports first, each with its device lines already read into words. */
export const listReceiptProblems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReceiptProblem[]> => {
    const { data, error } = await context.supabase.from("receipt_problem_reports").select("*").eq("owner_id", context.userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error("Couldn't load your problem reports");
    return (data ?? []).map((row) => {
      const facts = (row.facts ?? {}) as unknown as DeviceFacts;
      return {
        id: row.id,
        kind: row.kind as ProblemKindId,
        label: problemLabel(row.kind),
        note: row.note,
        receiptName: row.receipt_name,
        receiptType: row.receipt_type,
        lines: deviceSummaryLines(facts),
        ua: facts.ua ?? "",
        log: Array.isArray(facts.log) ? facts.log : [],
        emailed: row.emailed,
        at: reportedAt(row.created_at),
      };
    });
  });

/** Removes one of the owner's own reports; RLS scopes the delete to that owner. */
export const deleteReceiptProblem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("receipt_problem_reports").delete().eq("owner_id", context.userId).eq("id", data.id);
    if (error) throw new Error("Couldn't remove that report");
    return { ok: true as const };
  });
