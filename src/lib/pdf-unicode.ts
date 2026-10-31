// Tamil and other non-Latin text in jsPDF tables. jsPDF's built-in fonts are Latin-only and it
// cannot shape Indic scripts, so such cells are drawn by the browser (which shapes correctly) onto
// a canvas and placed as an image. Without a canvas (tests/SSR) they fall back to "?".
/* eslint-disable @typescript-eslint/no-explicit-any */

const PUNCT = (s: string) => s.replace(/₹/g, "INR ").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...");
const COMPLEX = /[^\x20-\x7E\xA0-\xFF\n]/;
export const FONT_STACK = '"Noto Sans Tamil", "Noto Sans", system-ui, sans-serif';

let canvasOk: boolean | null = null;
export function canDrawUnicode(): boolean {
  if (canvasOk === null) { try { canvasOk = typeof document !== "undefined" && !!document.createElement("canvas").getContext("2d"); } catch { canvasOk = false; } }
  return canvasOk;
}

/** Strict Latin text for plain doc.text() calls (titles, headers). */
export const plain = (s: string) => PUNCT(s).replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
/** Table cell text: keeps non-Latin characters when they can be drawn as images. */
export const cell = (s: string) => (canDrawUnicode() ? PUNCT(s) : plain(s));
export const hasComplex = (s: string) => COMPLEX.test(s);

/** Waits for the Tamil web font so the first PDF already renders it. */
export async function loadPdfFonts() {
  try { if (typeof document !== "undefined" && document.fonts) await Promise.race([document.fonts.load('16px "Noto Sans Tamil"', "தமிழ்"), new Promise((r) => setTimeout(r, 2500))]); } catch { /* fallback font */ }
}

function render(text: string, widthMm: number, fontPt: number, rgb: [number, number, number]) {
  const scale = 4; const pxPerMm = 3.78 * scale; const fontPx = fontPt * 0.3528 * pxPerMm;
  const c = document.createElement("canvas"); const g = c.getContext("2d")!;
  g.font = `${fontPx}px ${FONT_STACK}`;
  const maxW = widthMm * pxPerMm; const lines: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const w of para.split(/(\s+)/)) { const t = cur + w; if (g.measureText(t).width > maxW && cur.trim()) { lines.push(cur.trimEnd()); cur = w.trimStart(); } else cur = t; }
    lines.push(cur);
  }
  const lh = fontPx * 1.25;
  c.width = Math.ceil(Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width))) + 2); c.height = Math.ceil(lh * lines.length + fontPx * 0.3);
  g.font = `${fontPx}px ${FONT_STACK}`; g.fillStyle = `rgb(${rgb.join(",")})`; g.textBaseline = "top";
  lines.forEach((l, i) => g.fillText(l, 0, i * lh));
  return { url: c.toDataURL("image/png"), w: c.width / pxPerMm, h: c.height / pxPerMm };
}

/** Wraps autoTable options so non-Latin cells are drawn as shaped images. */
export function withUnicode<T extends Record<string, any>>(doc: any, opts: T): T {
  if (!canDrawUnicode()) return opts;
  const hold = new WeakMap<object, string>();
  return {
    ...opts,
    didParseCell: (h: any) => { opts["didParseCell"]?.(h); const t = (h.cell.text as string[]).join("\n"); if (hasComplex(t)) hold.set(h.cell, t); },
    willDrawCell: (h: any) => { opts["willDrawCell"]?.(h); if (hold.has(h.cell)) h.cell.text = []; },
    didDrawCell: (h: any) => {
      opts["didDrawCell"]?.(h);
      const t = hold.get(h.cell); if (!t) return;
      const pl = h.cell.padding("left"), pr = h.cell.padding("right"), pt = h.cell.padding("top");
      const col = h.cell.styles.textColor; const rgb: [number, number, number] = Array.isArray(col) ? [col[0], col[1], col[2]] : typeof col === "number" ? [col, col, col] : [25, 25, 25];
      const img = render(t, h.cell.width - pl - pr, h.cell.styles.fontSize, rgb);
      const k = Math.min(1, (h.cell.height - pt) / img.h);
      const x = h.cell.styles.halign === "right" ? h.cell.x + h.cell.width - pr - img.w * k : h.cell.x + pl;
      doc.addImage(img.url, "PNG", x, h.cell.y + pt, img.w * k, img.h * k);
    },
  };
}
