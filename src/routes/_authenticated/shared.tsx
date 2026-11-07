import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { setPendingScan } from "@/lib/pending-scan";
import { clearSharedBatch, readSharedBatch, sharedKind, validBatch } from "@/lib/shared-files";

const desc = "Bills, receipts and payment screenshots shared from WhatsApp or other apps, kept on this phone until you choose what to do.";
export const Route = createFileRoute("/_authenticated/shared")({
  validateSearch: (s: Record<string, unknown>) => ({ batch: validBatch(s.batch) ? s.batch : undefined, error: typeof s.error === "string" ? s.error : undefined }),
  head: () => ({ meta: [
    { title: "Shared files — Ledgerline" }, { name: "description", content: desc },
    { property: "og:title", content: "Shared files — Ledgerline" }, { property: "og:description", content: desc },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Shared,
});

function Shared() {
  const { batch, error } = Route.useSearch();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[] | null>(null);
  useEffect(() => { if (batch) void readSharedBatch(batch).then(setFiles, () => setFiles([])); else setFiles([]); }, [batch]);
  const images = (files ?? []).filter((f) => sharedKind(f.type) === "receipt");
  const pdfs = (files ?? []).filter((f) => sharedKind(f.type) === "document");
  const discard = async () => { if (batch) await clearSharedBatch(batch); setFiles([]); };
  const scan = async () => { setPendingScan(images); if (batch) await clearSharedBatch(batch); void navigate({ to: "/new", search: { scan: true } as never }); };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <PageTitle title="Shared files" />
      {error && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">The app wasn't ready to receive that share. Open Ledgerline once while online, then share again.</p>}
      {files === null ? <p className="text-sm text-muted-foreground">Opening shared files…</p> : files.length === 0 ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>No shared files waiting.</p>
          <p>On Android, add Ledgerline to your home screen, then choose it from the Share menu in WhatsApp or Photos. On iPhone, the Share menu doesn't list web apps yet — save the image, then use Scan receipt or Upload.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y rounded-md border">
            {files.map((f, i) => <li key={i} className="flex items-center gap-3 p-3 text-sm">{sharedKind(f.type) === "receipt" ? <ImageIcon className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}<span className="flex-1 truncate">{f.name}</span><span className="text-muted-foreground">{Math.max(1, Math.round(f.size / 1024))} KB</span></li>)}
          </ul>
          <p className="text-xs text-muted-foreground">Nothing is saved yet. Receipts are read and shown for your review before any expense is created.</p>
          <div className="flex flex-wrap gap-2">
            {images.length > 0 && <Button onClick={scan}>Read {images.length === 1 ? "receipt" : `${images.length} receipts`}</Button>}
            {pdfs.length > 0 && <Button variant="outline" asChild><Link to="/statements">Open Statement Desk for PDFs</Link></Button>}
            <Button variant="ghost" onClick={discard}><Trash2 className="mr-1 h-4 w-4" />Discard</Button>
          </div>
        </>
      )}
    </div>
  );
}
