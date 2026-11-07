import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, ExternalLink, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/lib/store";
import { extractBooking } from "@/lib/booking-extract.functions";
import { bookingDraft } from "@/lib/booking-import";

export function BookingDocumentImport({ tripName, onDraft }: { tripName: string; onDraft: (draft: ReturnType<typeof bookingDraft>) => void }) {
  const { addDocument, signedUrl, documents } = useStore();
  const extract = useServerFn(extractBooking);
  const input = useRef<HTMLInputElement>(null);
  const [docId, setDocId] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const pending = documents.filter((d) => d.notes === `Booking confirmation · ${tripName}`);
  useEffect(() => { if (!docId && pending[0]) { setDocId(pending[0].id); setName(pending[0].fileName); } }, [docId, documents, tripName]);
  const upload = async (file: File) => {
    setBusy(true); setStage("Saving confirmation…"); setError(""); setReady(false);
    try {
      if (!file.size || file.size > 10 * 1024 * 1024) throw Error("Choose a non-empty confirmation of 10 MB or less.");
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) throw Error("Choose a PDF, JPEG, PNG or WebP confirmation.");
      const id = await addDocument(file, { title: `${tripName} · ${file.name}`.slice(0, 200), docType: "other", docDate: null, amount: null, currency: "INR", merchant: null, notes: `Booking confirmation · ${tripName}`, transactionId: null, accountId: null, loanId: null, expiresOn: null });
      setDocId(id); setName(file.name);
      onDraft({ kind: "other", provider: "", ref: "", date: "", amount: "", due: "", cancel: "", traveller: "", location: "", currency: "INR", rate: "1", confirmation: "pending", document: id, note: "" });
      toast.success("Original confirmation saved");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save this confirmation"); }
    finally { setBusy(false); setStage(""); if (input.current) input.current.value = ""; }
  };
  const read = async () => {
    if (!docId || !consent) return;
    setBusy(true); setStage("Reading booking details…"); setError("");
    try {
      const result = await extract({ data: { documentId: docId, consent: true } });
      if (!result.ok) { setError(result.error); return; }
      onDraft(bookingDraft(result.result, docId)); setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read this confirmation"); }
    finally { setBusy(false); setStage(""); }
  };
  return <div className="mb-3 space-y-3 border-b pb-3">
    <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><FileUp className="h-4 w-4" />Import confirmation</Button>
    <input ref={input} type="file" className="sr-only" aria-label="Booking confirmation file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
    {pending.length > 0 && <select aria-label="Saved booking confirmation" className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-sm" value={docId} disabled={busy} onChange={(e) => { const d = pending.find((x) => x.id === e.target.value); if (d) { setDocId(d.id); setName(d.fileName); setReady(false); setError(""); } }}><option value="">Saved confirmations…</option>{pending.map((d) => <option key={d.id} value={d.id}>{d.fileName}</option>)}</select>}
    {docId && <div className="space-y-2">
      <Button variant="ghost" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left" onClick={async () => { const doc = documents.find((d) => d.id === docId); if (!doc) return; const url = await signedUrl(doc.filePath); if (url) window.open(url, "_blank", "noopener,noreferrer"); else toast.error("Couldn't open confirmation"); }}><ExternalLink className="h-4 w-4 shrink-0" /><span className="break-all text-sm">{name}</span></Button>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} disabled={busy} onCheckedChange={(v) => setConsent(v === true)} /><span>Allow AI to read this confirmation</span></label>
      <Button variant="secondary" disabled={!consent || busy} onClick={read}><ScanLine className="h-4 w-4" />Extract booking details</Button>
    </div>}
    <div aria-live="polite" className="text-sm text-muted-foreground">{stage || (ready ? "Details ready for review" : "")}</div>
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
  </div>;
}