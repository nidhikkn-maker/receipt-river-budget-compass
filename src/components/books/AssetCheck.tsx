import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { emptyBooks } from "@/lib/books/types";
import { matchAssetLabel, physicalCheck } from "@/lib/books/asset-verification";

/** Camera decoding is lazy and device-only. Confirmation rechecks the current owner's register. */
export function AssetCheck() {
  const { preferences, savePreferences } = useStore();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [condition, setCondition] = useState<"ok" | "damaged" | "missing">("ok");
  const [note, setNote] = useState("");
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const scanId = useRef("");
  const assets = preferences.assets ?? [];
  const asset = assets.find((a) => a.id === selected);
  const resolve = (text: string) => {
    setCode(text); setSelected("");
    const match = matchAssetLabel(text, assets);
    if (!match.ok) { setError(match.reason); return; }
    setSelected(match.asset.id); setCondition(match.asset.condition ?? "ok"); setError("");
    scanId.current = crypto.randomUUID();
  };

  useEffect(() => {
    if (!open || !camera) return;
    let cancelled = false;
    let controls: { stop: () => void } | undefined;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (cancelled || !video.current) return;
      controls = await new BrowserMultiFormatReader().decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current, (result) => {
        if (cancelled || !result) return;
        resolve(result.getText()); setCamera(false);
      });
      if (cancelled) controls.stop();
    })().catch(() => { if (!cancelled) { setCamera(false); setError("Camera could not open. Choose a label photo or enter its tag."); } });
    return () => { cancelled = true; controls?.stop(); };
  }, [open, camera]); // label lookup is repeated against current records at save

  const readPhoto = async (file: File) => {
    const attempt = ++generation.current;
    setReading(true); setError(""); setSelected(""); setCamera(false);
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      if (attempt === generation.current) resolve(result.getText());
    } catch { if (attempt === generation.current) setError("No readable QR code or barcode found. Enter the asset tag instead."); }
    finally { URL.revokeObjectURL(url); if (attempt === generation.current) setReading(false); }
  };
  const confirm = async () => {
    const match = matchAssetLabel(code, preferences.assets ?? []);
    if (!match.ok || match.asset.id !== selected) { setError(match.ok ? "The matching asset changed. Scan again." : match.reason); return; }
    const books = preferences.books ?? emptyBooks();
    if (books.assetEvents.some((e) => e.id === scanId.current)) { setOpen(false); return; }
    try {
      const check = physicalCheck(match.asset, new Date().toISOString().slice(0, 10), condition, note, scanId.current);
      await savePreferences({ ...preferences, assets: (preferences.assets ?? []).map((a) => a.id === selected ? check.asset : a), books: { ...books, assetEvents: [...books.assetEvents, check.event] } });
      toast.success("Physical check saved"); setOpen(false);
    } catch { setError("Could not save this check. Your scan is still here — try again."); }
  };

  return <>
    <Button variant="outline" onClick={() => { setCode(""); setSelected(""); setError(""); setNote(""); setOpen(true); }}><ScanLine className="size-4" />Check asset label</Button>
    <Dialog open={open} onOpenChange={(v) => { generation.current++; setReading(false); setOpen(v); if (!v) setCamera(false); }}>
      <DialogContent><DialogHeader><DialogTitle>Physical asset check</DialogTitle><DialogDescription>Scan a label</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setError(""); setCamera((v) => !v); }}><Camera className="size-4" />{camera ? "Stop camera" : "Open camera"}</Button><Button variant="outline" loading={reading} onClick={() => photo.current?.click()}><ImagePlus className="size-4" />Label photo</Button></div>
        <input ref={photo} type="file" accept="image/*" aria-label="Asset label photo" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void readPhoto(file); }} />
        {camera && <video ref={video} muted playsInline autoPlay aria-label="Asset label camera" className="aspect-[4/3] w-full rounded-lg bg-secondary object-cover" />}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); generation.current++; setReading(false); setCamera(false); resolve(code); }}><Input aria-label="Asset tag or code" placeholder="Asset tag or code" value={code} onChange={(e) => { generation.current++; setReading(false); setCode(e.target.value); setSelected(""); setError(""); }} /><Button type="submit" variant="outline">Find</Button></form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {asset && <div className="space-y-3"><div><p className="font-semibold">{asset.name}</p><p className="text-sm text-muted-foreground">{[asset.tag, asset.location, asset.custodian].filter(Boolean).join(" · ")}</p></div>
          <label className="block text-sm">Condition<select aria-label="Physical condition" className="mt-1 w-full rounded-md border bg-background p-2" value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)}><option value="ok">OK</option><option value="damaged">Damaged</option><option value="missing">Missing</option></select></label>
          <Input aria-label="Physical check note" placeholder="Inspection note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={confirm} disabled={reading}>Confirm physical check</Button>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}