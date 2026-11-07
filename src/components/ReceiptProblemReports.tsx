import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { confirmAction } from "@/lib/confirm";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteReceiptProblem, listReceiptProblems, type ReceiptProblem } from "@/lib/receipt-problems.functions";

/** Every problem you reported from the receipt viewer, newest first, with the device that saw it. */
export function ReceiptProblemReports() {
  const list = useServerFn(listReceiptProblems);
  const remove = useServerFn(deleteReceiptProblem);
  const [rows, setRows] = useState<ReceiptProblem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void list().then((out) => active && setRows(out), () => active && setRows([]));
    return () => { active = false; };
  }, [list]);

  const drop = async (row: ReceiptProblem) => {
    if (busy || !await confirmAction("Remove this problem report? Nothing else changes.")) return;
    setBusy(row.id);
    try {
      await remove({ data: { id: row.id } });
      setRows((current) => (current ?? []).filter((item) => item.id !== row.id));
      toast.success("Report removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove that report");
    } finally {
      setBusy(null);
    }
  };

  if (!rows) return <p className="text-sm text-muted-foreground">Loading your reports…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No problem reports yet. When something feels wrong in a receipt picture, tap “Report a problem” there and it will land here.</p>;

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-2xl border bg-background/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.at}{row.receiptName ? ` · ${row.receiptName}` : ""}{row.emailed ? " · emailed" : ""}</p>
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void drop(row)}><Trash2 className="h-4 w-4" />Remove</Button>
          </div>
          {row.note ? <p className="mt-2 text-sm">{row.note}</p> : null}
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {row.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
          {row.log.length ? (
            <details className="mt-2">
              <summary className="min-h-8 cursor-pointer text-xs font-semibold select-none">Last moves before the report</summary>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {row.log.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
