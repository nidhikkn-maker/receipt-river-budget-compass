import { requireRealAccount } from "@/lib/real-account-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizePreferences, type FinancePreferences } from "./preferences";
export const extractStatement = createServerFn({ method: "POST" })
  .middleware([requireRealAccount])
  .inputValidator((raw: unknown) => z.object({ dataUrl: z.string().startsWith("data:").max(20_000_000), mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]) }).parse(raw))
  .handler(async ({ data, context }) => {
    const prefs = await context.supabase.from("finance_preferences").select("data").eq("owner_id", context.userId).maybeSingle();
    if (prefs.error) return { ok: false as const, error: "Couldn't read your AI privacy settings." };
    const settings = normalizePreferences(prefs.data?.data as Partial<FinancePreferences> | null);
    if (!settings.aiEnabled || !settings.aiReadsDocuments) return { ok: false as const, error: "AI document reading is turned off in Settings." };
    try {
      const { readStatementWithAI } = await import('./statement-reader.server');
      const lines = await readStatementWithAI(data.dataUrl, data.mimeType);
      return lines.length ? { ok: true as const, lines } : { ok: false as const, error: "No readable transaction rows found. Try a clearer scan or CSV export." };
    } catch { return { ok: false as const, error: "Couldn't read this statement. Try a clearer scan or CSV export." }; }
  });