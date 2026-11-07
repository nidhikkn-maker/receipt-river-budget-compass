import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileProblem } from "@/lib/upload-link";

export const Route = createFileRoute("/u/$token")({
  head: () => ({
    meta: [
      { title: "Upload statements · Ledgerline" },
      { name: "description", content: "Securely upload bank and card statements to your client's Ledgerline." },
      { property: "og:title", content: "Upload statements · Ledgerline" },
      { property: "og:description", content: "A private upload link for statements. No sign-in needed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UploadPage,
});

type Info = { active: boolean; ownerName?: string; remaining?: number; expiresAt?: string };
type Item = { name: string; status: "waiting" | "sending" | "done" | "failed"; error?: string | undefined };

function UploadPage() {
  const { token } = Route.useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/public/upload/${encodeURIComponent(token)}`).then((r) => r.json()).then(setInfo).catch(() => setInfo({ active: false }));
  }, [token]);

  const send = async (list: FileList | null) => {
    if (!list?.length || !info?.active) return;
    const files = [...list].slice(0, info.remaining ?? 0);
    const start = items.length;
    setItems((p) => [...p, ...files.map((f) => ({ name: f.name, status: "waiting" as const, error: fileProblem(f.name, f.size) ?? undefined }))]);
    setBusy(true);
    let left = info.remaining ?? 0;
    for (const [i, f] of files.entries()) {
      const set = (s: Partial<Item>) => setItems((p) => p.map((x, j) => (j === start + i ? { ...x, ...s } : x)));
      const problem = fileProblem(f.name, f.size);
      if (problem) { set({ status: "failed", error: problem }); continue; }
      set({ status: "sending" });
      const body = new FormData(); body.append("file", f);
      try {
        const r = await fetch(`/api/public/upload/${encodeURIComponent(token)}`, { method: "POST", body });
        const j = await r.json().catch(() => ({}));
        if (r.ok) { set({ status: "done" }); left--; } else set({ status: "failed", error: j.error ?? "Upload failed" });
      } catch { set({ status: "failed", error: "No connection — try again" }); }
    }
    setInfo((p) => (p ? { ...p, remaining: left } : p));
    setBusy(false);
  };

  const done = items.filter((i) => i.status === "done").length;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-10">
      <p className="text-sm font-semibold tracking-wide text-primary">Ledgerline</p>
      {!info ? <p className="mt-8 text-muted-foreground">Checking link…</p> : !info.active ? (
        <div className="mt-8 rounded-xl border bg-card p-6">
          <h1 className="text-xl font-semibold">This link is no longer active</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please ask for a new upload link.</p>
        </div>
      ) : (
        <>
          <h1 className="mt-3 text-2xl font-semibold">Upload statements for {info.ownerName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add bank or card statements (PDF, Excel, CSV or photos, up to 20 MB each). You can add {info.remaining} more files.
            This page only accepts files — it can't show any records. Works until {new Date(info.expiresAt!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
          </p>
          <input ref={input} type="file" multiple aria-label="Statement files" className="hidden" accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(e) => { void send(e.target.files); e.target.value = ""; }} />
          <Button className="mt-6 w-full" size="lg" disabled={busy || !info.remaining} onClick={() => input.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />{busy ? "Uploading…" : "Choose statements"}
          </Button>
          {items.length > 0 && (
            <div className="mt-6 rounded-xl border bg-card">
              <p className="border-b px-4 py-3 text-sm font-medium">{done} of {items.length} uploaded</p>
              <ul className="divide-y">
                {items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    {it.status === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : it.status === "failed" ? <XCircle className="h-4 w-4 shrink-0 text-destructive" /> : <span className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-muted" />}
                    <span className="min-w-0 flex-1 truncate">{it.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{it.status === "failed" ? it.error : it.status === "done" ? "Uploaded" : it.status === "sending" ? "Uploading…" : "Waiting"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {done > 0 && !busy && <p className="mt-4 text-sm text-muted-foreground">Thank you — {info.ownerName} will review them in Ledgerline.</p>}
        </>
      )}
    </main>
  );
}
