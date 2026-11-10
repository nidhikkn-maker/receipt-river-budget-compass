// Render text specimens: node render-rows.cjs specs.json out.png -> writes out.png and out.json (row boxes)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const [specFile, out] = process.argv.slice(2);
const FP = path.resolve(__dirname, "../fontpkgs");
const fam = { Manrope: "manrope", "Plus Jakarta Sans": "plus-jakarta-sans", "DM Sans": "dm-sans", Geist: "geist-sans", "IBM Plex Sans": "ibm-plex-sans", "Hanken Grotesk": "hanken-grotesk", Sora: "sora", Outfit: "outfit", Urbanist: "urbanist", "Space Grotesk": "space-grotesk", Figtree: "figtree", Onest: "onest" };
const specs = JSON.parse(fs.readFileSync(specFile, "utf8"));
let css = "";
for (const [name, slug] of Object.entries(fam)) {
  const dir = fs.readdirSync(FP).find((d) => d.startsWith(`fontsource-${slug}-`));
  for (const w of [300, 400, 500, 600, 700, 800]) {
    for (const sub of ["latin", "latin-ext"]) {
      const f = `${FP}/${dir}/package/files/${slug}-${sub}-${w}-normal.woff2`;
      if (fs.existsSync(f)) css += `@font-face{font-family:"X ${name}";font-weight:${w};src:url("file://${f}") format("woff2");}\n`;
    }
  }
}
(async () => {
  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: Number(process.env.W || 900), height: 400 }, deviceScaleFactor: 1 });
  let y = 10; const rows = [];
  let html = `<style>${css} body{margin:0;background:${process.env.BG || "#F9F9F7"};color:${process.env.FG || "#222923"};} .r{position:absolute;left:10px;white-space:nowrap;line-height:1;}</style>`;
  specs.forEach((s, i) => { const h = Math.ceil(s.size * 1.6) + 6; const fontName = s.system ? `'${s.font}'` : `'X ${s.font}'`; html += `<div class=r id=r${i} style="top:${y}px;font-family:${fontName},'Noto Color Emoji';font-weight:${s.weight};font-size:${s.size}px;letter-spacing:${s.ls || 0}em;font-feature-settings:${s.ff || "normal"};font-variant-numeric:${s.fvn || "normal"}">${s.text}</div>`; rows.push({ ...s, top: y, h }); y += h; });
  const hf = out.replace(/\.png$/, ".html"); fs.writeFileSync(hf, `<!doctype html><html><body style="height:${y + 10}px">${html}</body></html>`); await p.goto("file://" + path.resolve(hf));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  for (let i = 0; i < rows.length; i++) rows[i].rendered = await p.evaluate((i) => { const el = document.getElementById("r" + i); return getComputedStyle(el).fontFamily; }, i);
  await p.screenshot({ path: out, fullPage: true });
  fs.writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify(rows));
  await b.close();
})();
