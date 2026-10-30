import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ dataUrl: z.string().startsWith("data:").max(4_000_000), mimeType: z.string() });

const Extracted = z.object({
  title: z.string().nullable().describe("Short expense title, e.g. 'Taxi to airport' or 'Team lunch at Nando's'"),
  merchant: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD"),
  amount: z.number().nullable().describe("Grand total paid"),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. INR, USD, EUR"),
  payment_method: z.enum(["cash", "upi", "credit_card", "debit_card", "forex_card", "company_card", "bank_transfer", "other"]).nullable(),
  description: z.string().nullable().describe("One-line business purpose guess from the items"),
  category: z.enum(["Travel", "Meals", "Software", "Equipment", "Training", "Office", "Other"]).nullable(),
});
export type ExtractedReceipt = z.infer<typeof Extracted>;

export const extractReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; result: ExtractedReceipt } | { ok: false; error: string }> => {
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
              { type: "text", text: "Read this receipt or bill. Extract: a short expense title, merchant name, transaction date (YYYY-MM-DD), grand total paid as a number in the bill's own currency, the ISO currency code (infer from symbols like ₹, €, £, ¥, AED, S$ or the country/address), the payment method if shown (UPI ref/VPA → upi, card last-4 with credit/debit wording, cash, etc.), the best-fitting category, and a one-line description of what was bought. Use null for anything not visible." },
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
