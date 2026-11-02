import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN = 1, MAX = 6;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

/** Receipt picture with wheel/pinch/button zoom and drag-to-pan, anchored at the cursor. */
export function ReceiptZoomViewer({ src, type, name }: { src: string; type: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view); viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  const zoomAt = (next: number, px: number, py: number) => {
    const v = viewRef.current; const z = clamp(next); const k = z / v.z;
    setView(z === 1 ? { z: 1, x: 0, y: 0 } : { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
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
  useEffect(() => { setView({ z: 1, x: 0, y: 0 }); }, [src]);

  if (!type.startsWith("image/")) {
    return <div className="space-y-2"><object data={src} type={type} aria-label={`Receipt ${name}`} className="h-[28rem] w-full rounded-2xl border bg-muted" /><p className="text-xs text-muted-foreground">Use the document's own zoom to inspect this PDF.</p></div>;
  }

  const onDown = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), z: viewRef.current.z }; } };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId); if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = box.current!.getBoundingClientRect();
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomAt(pinch.current.z * Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinch.current.d, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
    } else if (viewRef.current.z > 1) setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
  };
  const onUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };

  return (
    <div className="space-y-2">
      <div ref={box} role="img" aria-label={`Receipt ${name}, zoom ${Math.round(view.z * 100)}%`} className="relative h-[24rem] overflow-hidden rounded-2xl border bg-muted lg:h-[34rem]" style={{ touchAction: "none", cursor: view.z > 1 ? "grab" : "zoom-in" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoomAt(view.z > 1 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top); }}>
        <img src={src} alt="" draggable={false} className="h-full w-full select-none object-contain" style={{ transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Scroll, pinch or double-tap to zoom · drag to move</p>
        <div className="flex gap-1">
          <Button type="button" size="icon" variant="outline" aria-label="Zoom out" disabled={view.z <= MIN} onClick={() => zoomAt(view.z / 1.5, ...center())}><Minus className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="outline" aria-label="Zoom in" disabled={view.z >= MAX} onClick={() => zoomAt(view.z * 1.5, ...center())}><Plus className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="outline" aria-label="Reset zoom" onClick={() => setView({ z: 1, x: 0, y: 0 })}><RotateCcw className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
