import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { ReceiptZoomViewer } from "./ReceiptZoomViewer";

export type SourceKind = "image" | "pdf" | "sheet" | "other";
export function sourceKind(f: File): SourceKind {
  const n = f.name.toLowerCase();
  if (f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/.test(n)) return "image";
  if (f.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (/\.(csv|xlsx?)$/.test(n) || /csv|spreadsheet|excel/.test(f.type)) return "sheet";
  return "other";
}
const size = (b: number) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** The real uploaded file, shown as-is: zoomable photo, every PDF page, or the first rows of a spreadsheet. */
export function SourcePreview({ file }: { file: File }) {
  const kind = sourceKind(file);
  const [url, setUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; setUrl(null); setRows(null); setPages(null); setFailed(false);
    if (kind === "image" || kind === "pdf") {
      const r = new FileReader(); r.onload = () => { if (live) setUrl(String(r.result)); }; r.onerror = () => live && setFailed(true); r.readAsDataURL(file);
    }
    if (kind === "pdf") void file.arrayBuffer().then(async (b) => { const { PDFDocument } = await import("pdf-lib"); const d = await PDFDocument.load(b, { ignoreEncryption: true }); if (live) setPages(d.getPageCount()); }).catch(() => {});
    if (kind === "sheet") void file.arrayBuffer().then(async (b) => {
      const XLSX = await import("xlsx"); const wb = XLSX.read(b, { type: "array" }); const ws = wb.Sheets[wb.SheetNames[0] ?? ""];
      const all = ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false }) : [];
      if (live) setRows(all.slice(0, 15).map((r) => r.map((c) => String(c ?? ""))));
    }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [file, kind]);
  return <figure className="space-y-2" aria-label={`Preview of ${file.name}`}>
    <figcaption className="flex items-center gap-2 text-xs text-muted-foreground">
      {kind === "sheet" ? <FileSpreadsheet className="size-4" /> : <FileText className="size-4" />}
      <span className="min-w-0 truncate font-medium text-foreground">{file.name}</span>
      <span>· {size(file.size)}{pages ? ` · ${pages} page${pages === 1 ? "" : "s"}` : ""}</span>
    </figcaption>
    {failed && <p role="alert" className="text-sm text-destructive">I couldn't open a preview of this file. It can still be read and checked.</p>}
    {(kind === "image" || kind === "pdf") && (url ? <ReceiptZoomViewer src={url} type={kind === "pdf" ? "application/pdf" : file.type || "image/jpeg"} name={file.name} /> : !failed && <div className="h-64 animate-pulse rounded-xl bg-muted" aria-label="Loading preview" />)}
    {kind === "sheet" && rows && <div className="max-h-80 overflow-auto rounded-xl border"><table className="w-full text-left text-xs"><tbody>{rows.map((r, i) => <tr key={i} className={i === 0 ? "bg-muted font-medium" : "border-t"}>{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>)}</tr>)}</tbody></table><p className="px-2 py-1 text-xs text-muted-foreground">First {rows.length} rows</p></div>}
    {kind === "other" && <p className="rounded-xl border p-3 text-sm text-muted-foreground">No preview for this kind of file.</p>}
  </figure>;
}
