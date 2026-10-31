import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePreferences, type FinancePreferences } from "./preferences";

const Input = z.object({ dataUrl: z.string().startsWith("data:").max(4_000_000), mimeType: z.string() });

const Extracted = z.object({
  title: z.string().nullable().describe("Short expense title, e.g. 'Taxi to airport' or 'Team lunch at Nando's'"),
  merchant: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD"),
  amount: z.number().nullable().describe("Grand total paid"),
  tax: z.number().nonnegative().nullable().describe("Total tax included on the receipt"),
  items: z.array(z.object({ name: z.string(), quantity: z.number().nonnegative(), amount: z.number().nonnegative() })).describe("Line items, amount is the line total in bill currency"),
  text: z.string().describe("Readable text from the receipt for document search"),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. INR, USD, EUR"),
  payment_method: z.enum(["cash", "upi", "credit_card", "debit_card", "forex_card", "company_card", "bank_transfer", "other"]).nullable(),
  description: z.string().nullable().describe("One-line business purpose guess from the items"),
  category: z.enum(["Groceries", "Dining", "Travel", "Fuel & Transport", "Shopping", "Bills & Utilities", "Rent & Home", "Health", "Education", "Entertainment", "Software & Subscriptions", "Office & Supplies", "Client & Business Meals", "Other"]).nullable(),
  scope: z.enum(["personal", "business"]).nullable().describe("business if it looks like a work/company expense (GST invoice to a company, office supplies, software, client meals, business travel), otherwise personal"),
});
export type ExtractedReceipt = z.infer<typeof Extracted>;

export const extractReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; result: ExtractedReceipt } | { ok: false; error: string }> => {
    const prefs=await context.supabase.from("finance_preferences").select("data").eq("owner_id",context.userId).maybeSingle();
    if(prefs.error)return {ok:false,error:"Couldn't read your AI privacy settings."};
    const settings=normalizePreferences(prefs.data?.data as Partial<FinancePreferences>|null);
    if(!settings.aiEnabled||!settings.aiReadsDocuments)return {ok:false,error:"AI document reading is turned off in Settings."};
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "Receipt reading is not configured." };
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output, NoObjectGeneratedError } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const isPdf = data.mimeType === "application/pdf";
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        output: Output.object({ schema: Extracted }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Read this receipt or bill. Extract title, merchant, YYYY-MM-DD date, grand total in original currency, tax total, individual line items (name, quantity, line total), readable receipt text, ISO currency, payment method, category, business/personal scope and description. Never invent unreadable amounts; return null for unknown scalar fields and an empty items array if unreadable. Tax is part of the grand total, not additional spending." },
              isPdf
                ? { type: "file", data: data.dataUrl, mediaType: "application/pdf", filename: "receipt.pdf" }
                : { type: "image", image: data.dataUrl, mediaType: data.mimeType },
            ],
          },
        ],
        providerOptions: {
          openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
        },
      });
      for await (const _ of result.textStream) { /* drain */ }
      return { ok: true, result: await result.output };
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) return { ok: false, error: "Couldn't read this receipt." };
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 429) return { ok: false, error: "Too many requests — try again in a moment." };
      if (status === 402) return { ok: false, error: "AI credits are used up for this workspace." };
      console.error(e);
      return { ok: false, error: "Receipt reading failed." };
    }
  });
