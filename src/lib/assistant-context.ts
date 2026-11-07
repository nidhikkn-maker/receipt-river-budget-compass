import { z } from "zod";

export const AssistantInput = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(20),
}).strip().refine((d) => d.messages.at(-1)?.role === "user", "The last message must be from you.");

/** No request data or saved record text ever becomes a system instruction. */
export function assistantMessages(messages: z.infer<typeof AssistantInput>["messages"], facts: unknown) {
  return [{ role: "user" as const, content: JSON.stringify({
    kind: "untrusted_financial_context",
    facts,
    history: messages.slice(0, -1),
    question: messages.at(-1)?.content,
  }) }];
}