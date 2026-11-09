// Real-browser check of the expenditure builder's canvas image conversion (WebP -> JPEG annexure).
// Isolated: stubbed storage/history in-page, no Cloud, no real records. Usage: node scripts/browser-checks/expenditure-canvas/run.mjs [outDir]
import { fileURLToPath } from 'node:url'; import path from 'node:path'; import fs from 'node:fs'; import http from 'node:http'; import { createRequire } from 'node:module';
const D = path.dirname(fileURLToPath(import.meta.url)), R = path.resolve(D, '../../..'), OUT = path.resolve(process.argv[2] ?? path.join(D, 'out'));
const require = createRequire(path.join(R, 'package.json')); const esbuild = require('esbuild'); const { chromium } = require('playwright');
fs.mkdirSync(OUT, { recursive: true });
const S = path.join(D, 'stubs');
const map = { '@/lib/store': S + '/store.ts', '@/integrations/supabase/client': S + '/supabase.ts', '@tanstack/react-router': S + '/router.tsx', '@/components/AppShell': S + '/appshell.tsx', './useClaimPreparation': S + '/prep.ts' };
await esbuild.build({ entryPoints: [path.join(D, 'harness.tsx')], bundle: true, outfile: path.join(OUT, 'harness.js'), format: 'esm', jsx: 'automatic', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, nodePaths: [path.join(R, 'node_modules')], logLevel: 'silent',
  plugins: [{ name: 'alias', setup(b) { b.onResolve({ filter: /.*/ }, a => { if (map[a.path]) return { path: map[a.path] }; if (/^@tanstack\/(react-start|start-)/.test(a.path)) return { path: S + '/start.ts' }; if (a.path.startsWith('@/')) return b.resolve('./' + a.path.slice(2), { resolveDir: path.join(R, 'src'), kind: a.kind }); }); } }] });
fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="./harness.js"></script></body></html>');
const srv = http.createServer((q, r) => { const f = path.join(OUT, q.url === '/' ? 'index.html' : q.url.split('?')[0]); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(r); });
await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 900 } }); let ok = false;
try {
  await p.goto(`http://127.0.0.1:${port}/`);
  await p.waitForFunction(() => { const x = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Generate statement PDF')); return x && !x.disabled; }, null, { timeout: 15000 });
  const fixture = await p.evaluate(() => [window.__webpType, window.__webpSize]);
  await p.getByRole('button', { name: 'Generate statement PDF' }).click();
  await p.getByRole('button', { name: 'Confirm documents & generate' }).waitFor({ timeout: 20000 });
  const check = await p.getByText('Ready for annexure').count();
  await p.screenshot({ path: path.join(OUT, '1-document-check.png') });
  await p.getByRole('button', { name: 'Confirm documents & generate' }).click();
  await p.getByText('Saved in Reports Centre → Report history.').waitFor({ timeout: 30000 });
  await p.screenshot({ path: path.join(OUT, '2-saved.png') });
  const result = await p.evaluate(() => window.__inspect());
  const b64 = await p.evaluate(async () => { const u = new Uint8Array(await window.__uploaded.arrayBuffer()); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); });
  fs.writeFileSync(path.join(OUT, 'generated-statement.pdf'), Buffer.from(b64, 'base64'));
  ok = fixture[0] === 'image/webp' && check === 1 && result?.jpegImages === 1 && result.pages >= 2 && result.history?.file_size === result.size;
  console.log(JSON.stringify({ browser: b.version(), fixture, documentCheckReady: check, ...result, pass: ok }));
} finally { await b.close(); srv.close(); }
process.exit(ok ? 0 : 1);
