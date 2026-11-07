import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/AppShell";
import { FirstUseGuide } from "@/components/FirstUseGuide";

export const Route = createFileRoute("/_authenticated/start")({
  head: () => ({
    meta: [
      { title: "Getting started · Ledgerline" },
      { name: "description", content: "See, in everyday words, how Ledgerline handles receipts, statements, transfers, card bills, things you own and money paid back." },
      { property: "og:title", content: "Getting started · Ledgerline" },
      { property: "og:description", content: "Everyday money, explained without accounting jargon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Start,
});

function Start() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageTitle eyebrow="Getting started" title="Your money, in plain words" sub="Show me a receipt, a statement or a message, or tell me what happened. I'll explain what I found and ask before saving anything." />
      <FirstUseGuide />
    </div>
  );
}
