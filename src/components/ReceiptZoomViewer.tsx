import { useEffect, useRef, useState } from "react";
import { Flag, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReceiptProblemDialog } from "@/components/ReceiptProblemDialog";
import { collectDeviceFacts, type DeviceFacts } from "@/lib/device-report";

const MIN = 1, MAX = 6;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

/** Receipt picture with wheel/pinch/button zoom and drag-to-pan, anchored at the cursor. */
/** Renders every PDF page into one tall sharp image so PDFs get the same zoom and pan as photos. */
async function pdfToImage(src: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = Uint8Array.from(atob(src.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: HTMLCanvasElement[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
    const page = await doc.getPage(n); const vp = page.getViewport({ scale: 2.5 });
    const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise; pages.push(c);
  }
  const out = document.createElement("canvas"); const gap = 24;
  out.width = Math.max(...pages.map((c) => c.width)); out.height = pages.reduce((h, c) => h + c.height, 0) + gap * (pages.length - 1);
  const ctx = out.getContext("2d")!; ctx.fillStyle = "#e5e7eb"; ctx.fillRect(0, 0, out.width, out.height);
  let y = 0; for (const c of pages) { ctx.drawImage(c, (out.width - c.width) / 2, y); y += c.height + gap; }
  return out.toDataURL("image/jpeg", 0.92);
}

export function ReceiptZoomViewer({ src, type, name, quiet = false }: { src: string; type: string; name: string; quiet?: boolean }) {
  const isPdf = type === "application/pdf";
  const [pdfImg, setPdfImg] = useState<string | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  useEffect(() => { if (!isPdf) return; let live = true; setPdfImg(null); setPdfFailed(false); pdfToImage(src).then((u) => live && setPdfImg(u), () => live && setPdfFailed(true)); return () => { live = false; }; }, [src, isPdf]);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view); viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const tap = useRef<{ x: number; y: number; t: number; moved: number; multi: boolean } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);

  const [smooth, setSmooth] = useState(false);
  const [report, setReport] = useState<DeviceFacts | null>(null);
  const sawTouch = useRef(false);
  /** The last few moves made in this viewer, sent with a problem report so a bug can be reproduced. */
  const log = useRef<string[]>([]);
  const note = (line: string) => { if (log.current[log.current.length - 1] !== line) log.current = [...log.current.slice(-11), line]; };
  /** Keep the zoomed picture covering the frame, like Photos on iPhone. */
  const bound = (v: { z: number; x: number; y: number }) => {
    const r = box.current?.getBoundingClientRect(); if (!r || v.z <= 1) return { z: 1, x: 0, y: 0 };
    const x = Math.min(0, Math.max(r.width - r.width * v.z, v.x)); const y = Math.min(0, Math.max(r.height - r.height * v.z, v.y));
    if (x !== v.x || y !== v.y) note("drag stopped at edge");
    return { z: v.z, x, y };
  };
  const zoomAt = (next: number, px: number, py: number, animate = false) => {
    const v = viewRef.current; const z = clamp(next); const k = z / v.z;
    if (Math.abs(z - next) > 0.001) note(`zoom limit at ${Math.round(z * 100)}%`);
    setSmooth(animate); setView(bound({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k }));
  };
  const center = () => { const r = box.current?.getBoundingClientRect(); return r ? [r.width / 2, r.height / 2] as const : [0, 0] as const; };

  useEffect(() => {
    const el = box.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const r = el.getBoundingClientRect();
      zoomAt(viewRef.current.z * Math.exp(-dy * 0.002), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => { setView({ z: 1, x: 0, y: 0 }); log.current = []; sawTouch.current = false; }, [src]);

  const shown = isPdf ? pdfImg : src;
  if (isPdf && pdfFailed) return <div className="space-y-2"><object data={src} type={type} aria-label={`Receipt ${name}`} className="h-[28rem] w-full rounded-2xl border bg-muted" /><p className="text-xs text-muted-foreground">This PDF couldn't be prepared for zooming, so it's shown as is.</p></div>;
  if (!isPdf && !type.startsWith("image/")) return <p className="text-sm text-muted-foreground">Preview not available for this file.</p>;

  const onDown = (e: React.PointerEvent) => { setSmooth(false); if (pointers.current.size === 0) { tap.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0, multi: false }; if (!sawTouch.current) { sawTouch.current = true; note(`first touch (${e.pointerType})`); } } else if (tap.current) tap.current.multi = true; e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), z: viewRef.current.z }; } };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId); if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tap.current) tap.current.moved = Math.max(tap.current.moved, Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y));
    const r = box.current!.getBoundingClientRect();
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomAt(pinch.current.z * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinch.current.d) ** 0.6, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
    } else if (viewRef.current.z > 1) setView((v) => bound({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
  };
  const onUp = (e: React.PointerEvent) => {
    const wasPinch = pinch.current;
    pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null;
    if (wasPinch && pointers.current.size === 0) note(`pinch ended at ${Math.round(viewRef.current.z * 100)}%`);
    if (e.type !== "pointerup" || pointers.current.size > 0) return;
    const t = tap.current; tap.current = null;
    if (!t || t.multi || t.moved > 10 || Date.now() - t.t > 300) { lastTap.current = null; return; }
    const prev = lastTap.current; const now = Date.now();
    if (prev && now - prev.t < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
      lastTap.current = null; const r = box.current!.getBoundingClientRect();
      const target = viewRef.current.z > 1 ? 1 : 2.5;
      note(`double-tap → ${Math.round(target * 100)}%`);
      zoomAt(target, e.clientX - r.left, e.clientY - r.top, true);
    } else lastTap.current = { x: e.clientX, y: e.clientY, t: now };
  };

  return (
    <div className="space-y-2">
      <div ref={box} role="img" aria-label={`Receipt ${name}, zoom ${Math.round(view.z * 100)}%`} className={quiet ? "cmp-source-frame relative overflow-hidden" : "relative h-[24rem] overflow-hidden rounded-2xl border bg-muted lg:h-[34rem]"} style={{ touchAction: "none", cursor: view.z > 1 ? "grab" : "zoom-in" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {!shown && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Preparing PDF…</div>}
        {shown && <img src={shown} alt="" draggable={false} className="h-full w-full select-none object-contain" style={{ transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transition: smooth ? "transform 220ms cubic-bezier(.2,.8,.2,1)" : "none" }} />}
      </div>
      <div className={quiet ? "flex justify-end" : "flex flex-wrap items-center justify-between gap-2"}>
        {!quiet && <p className="text-xs text-muted-foreground">Scroll, pinch or double-tap to zoom · drag to move</p>}
        <div className="flex items-center gap-1">
          {!quiet && <Button type="button" size="sm" variant="ghost" onClick={() => setReport({ ...collectDeviceFacts(), log: [...log.current] })}><Flag className="h-4 w-4" />Report a problem</Button>}
          <Button type="button" size="icon" variant="outline" aria-label="Zoom out" disabled={view.z <= MIN} onClick={() => { note("zoom out tapped"); zoomAt(view.z / 1.5, ...center(), true); }}><Minus className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="outline" aria-label="Zoom in" disabled={view.z >= MAX} onClick={() => { note("zoom in tapped"); zoomAt(view.z * 1.5, ...center(), true); }}><Plus className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="outline" aria-label="Reset zoom" onClick={() => { note("reset tapped"); setSmooth(true); setView({ z: 1, x: 0, y: 0 }); }}><RotateCcw className="h-4 w-4" /></Button>
        </div>
      </div>
      {report ? <ReceiptProblemDialog open onOpenChange={(next) => { if (!next) setReport(null); }} receipt={{ name, type }} zoom={view.z} facts={report} /> : null}
    </div>
  );
}
