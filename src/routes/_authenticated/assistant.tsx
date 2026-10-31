import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAssistant } from "@/lib/assistant.functions";
import { useAssistantFacts } from "@/lib/use-position";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "AI assistant — Ledgerline" },
      { name: "description", content: "Ask about your spending, upcoming payments, safe-to-spend and loans." },
      { property: "og:title", content: "AI assistant — Ledgerline" },
      { property: "og:description", content: "Ask about your spending, upcoming payments, safe-to-spend and loans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Assistant,
});

const SUGGESTIONS = [
  "How much did I spend this month?", "Which category is highest?", "Can I afford ₹50,000 today?",
  "What are my upcoming payments?", "Which subscriptions can I review?", "How can I repay my loans faster?",
];
type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

function Assistant() {
  const facts = useAssistantFacts(30);
  const ask = useServerFn(askAssistant);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...msgs.filter((m) => !m.error), { role: "user" as const, content: t }];
    setMsgs(next); setQ(""); setBusy(true);
    try {
      const r = await ask({ data: { messages: next.slice(-12).map(({ role, content }) => ({ role, content })), facts } });
      setMsgs((m) => [...m, r.ok ? { role: "assistant", content: r.text } : { role: "assistant", content: r.error, error: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Couldn't reach the assistant.", error: true }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageTitle eyebrow="AI" title="Ask about your money" sub="Answers use the app's own calculations — actual, estimated and hypothetical figures are labelled." />
      <div className="space-y-3 pb-28">
        {!msgs.length && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="min-h-11 rounded-full border bg-card px-4 text-sm hover:bg-secondary">{s}</button>)}
          </div>
        )}
        {msgs.map((m, k) => (
          <div key={k} className={cn("max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : m.error ? "border border-destructive text-destructive" : "border bg-card")}>
            {m.role === "assistant" && !m.error && <Sparkles className="mb-1 h-4 w-4 text-primary" />}
            {m.content.replace(/\*\*/g, "")}
          </div>
        ))}
        {busy && <div className="w-fit rounded-3xl border bg-card px-4 py-3 text-sm text-muted-foreground">Thinking…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(q); }} className="fixed inset-x-3 bottom-24 z-20 mx-auto flex max-w-3xl gap-2 rounded-3xl border bg-background p-2 shadow-float lg:bottom-6 lg:left-28">
        <Input aria-label="Your question" placeholder="Ask anything about your finances…" value={q} onChange={(e) => setQ(e.target.value)} className="border-0 shadow-none focus-visible:ring-0" />
        <Button type="submit" size="icon" disabled={busy || !q.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
      </form>
    </>
  );
}
