import { LoadError } from "./LoadError";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Row = { id: string; file_path: string; file_name: string; mime_type: string; uploaded_at: string };

/** Statements the accountant uploaded through the link, waiting to be read by the normal Statement Desk flow. */
export function AccountantInbox({ onFiles }: { onFiles: (files: File[]) => Promise<void> }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A failed read must not hide statements waiting from the accountant (P0-004).
  const load = () => supabase.from("accountant_uploads").select("id, file_path, file_name, mime_type, uploaded_at").is("consumed_at", null).order("uploaded_at").then(({ data, error }) => { setFailed(!!error); if (!error) setRows(data ?? []); });
  useEffect(() => { void load(); }, []);
  if (failed) return <LoadError what="statements sent by your accountant" onRetry={load} />;
  if (!rows.length) return null;

  const readAll = async () => {
    setBusy(true);
    const files: File[] = [], ids: string[] = [];
    for (const r of rows) {
      const { data } = await supabase.storage.from("statement-uploads").download(r.file_path);
      if (data) { files.push(new File([data], r.file_name, { type: r.mime_type })); ids.push(r.id); }
    }
    if (files.length < rows.length) toast.error(`${rows.length - files.length} file(s) couldn't be downloaded — they stay waiting`);
    await onFiles(files);
    // Marked as read once loaded into the desk; matching and posting still need your usual confirmation.
    if (ids.length) await supabase.from("accountant_uploads").update({ consumed_at: new Date().toISOString() }).in("id", ids);
    await load();
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <FileUp className="size-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm"><span className="font-medium">{rows.length} statement{rows.length === 1 ? "" : "s"} from your accountant</span> waiting to be matched.</p>
      <Button loading={busy} onClick={readAll}>Read & match</Button>
    </div>
  );
}
