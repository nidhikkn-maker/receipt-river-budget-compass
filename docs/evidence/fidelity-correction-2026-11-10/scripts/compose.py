# Reference | before (937cfaf) | after comparison sheets, onion skins, diff heatmaps, region crops and statistics.
# Adapted from ../../fidelity-audit-2026-11-10/scripts/compose.py and crops.py (same frame offsets and boxes).
# Usage: python3 -I compose.py   (reads ../captures/{before-asis,before-manrope,after-asis}, writes ../images)
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REF = os.path.join(A, '..', 'signature-flow-reference') + '/'
C = os.path.join(A, 'captures'); OUT = os.path.join(A, 'images'); os.makedirs(OUT, exist_ok=True)
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
DESK = (25, 91, 1308, 885); IPH = (480, 97, 852, 890)
SCREENS = [('01-home', '01-home-computer.png', 'desktop-01-home', DESK), ('02-home-iphone', '02-home-iphone.png', 'iphone-02-home', IPH),
           ('03-money', '03-money.png', 'desktop-03-money', DESK), ('04-statement-desk', '04-statement-desk.png', 'desktop-04-statement-desk', DESK),
           ('05-records', '05-records.png', 'desktop-05-records', DESK), ('06-travel', '06-travel.png', 'desktop-06-travel', DESK),
           ('07-reports', '07-reports.png', 'desktop-07-reports', DESK), ('08-smart-add-source', '08-smart-add-source.png', 'desktop-08-smart-add-source', DESK),
           ('09-smart-add-review', '09-smart-add-review.png', 'desktop-09-smart-add-review', DESK), ('10-smart-add-confirm', '10-smart-add-confirm.png', 'desktop-10-smart-add-confirm', DESK)]
# region crops in reference app-frame coordinates (from the audit's crops.py), applied identically to every capture
CROPS = [('home-header', '01-home-computer.png', DESK, (0, 0, 1283, 84), 'desktop-01-home'),
         ('home-rail', '01-home-computer.png', DESK, (0, 0, 110, 794), 'desktop-01-home'),
         ('home-heading', '01-home-computer.png', DESK, (130, 100, 1240, 225), 'desktop-01-home'),
         ('home-networth-panel', '01-home-computer.png', DESK, (139, 229, 832, 609), 'desktop-01-home'),
         ('home-coming-up', '01-home-computer.png', DESK, (850, 235, 1232, 500), 'desktop-01-home'),
         ('home-next-step', '01-home-computer.png', DESK, (140, 605, 1232, 712), 'desktop-01-home'),
         ('iphone-header', '02-home-iphone.png', IPH, (0, 0, 372, 72), 'iphone-02-home'),
         ('iphone-heading', '02-home-iphone.png', IPH, (0, 72, 372, 205), 'iphone-02-home'),
         ('iphone-networth-panel', '02-home-iphone.png', IPH, (10, 202, 349, 548), 'iphone-02-home'),
         ('iphone-bottom-nav', '02-home-iphone.png', IPH, (0, 725, 372, 793), 'iphone-02-home'),
         ('page-header-money', '03-money.png', DESK, (130, 100, 1240, 340), 'desktop-03-money'),
         ('canvas-08-source', '08-smart-add-source.png', DESK, (342, 89, 941, 655), 'desktop-08-smart-add-source'),
         ('canvas-09-review', '09-smart-add-review.png', DESK, (342, 89, 941, 655), 'desktop-09-smart-add-review'),
         ('canvas-10-confirm', '10-smart-add-confirm.png', DESK, (342, 136, 941, 609), 'desktop-10-smart-add-confirm')]
VARS = [('before-asis', 'BEFORE 937cfaf (Inter, as rendered here)'), ('before-manrope', 'BEFORE 937cfaf + Manrope injected'), ('after-asis', 'AFTER (Manrope, calibrated)')]


def label(im, t):
    d = ImageDraw.Draw(im); w = d.textlength(t, font=FONT); d.rectangle([0, 0, w + 12, 20], fill=(20, 30, 32)); d.text((6, 2), t, fill=(255, 255, 255), font=FONT); return im


def load(v, cap):
    p = os.path.join(C, v, cap + '.png')
    return np.asarray(Image.open(p).convert('RGB')) if os.path.exists(p) else None


def heat(r, i):
    d = np.abs(r.astype(int) - i.astype(int)).sum(2) / 3.0; dn = np.clip(d / 80.0, 0, 1)
    g = (r.astype(float).mean(2) * 0.35 + 150).clip(0, 255); out = np.stack([g, g, g], 2)
    col = np.stack([255 * np.ones_like(dn), 255 * (1 - dn) * 0.9, 40 * (1 - dn)], 2)
    a = np.clip(dn * 1.6, 0, 1)[..., None] * (dn[..., None] > 0.06)
    return (out * (1 - a) + col * a).astype(np.uint8)


def stats(r, i):
    d = np.abs(r.astype(int) - i.astype(int)).sum(2) / 3.0
    return {'pixels_differing': round(float((d / 80.0 > 0.15).mean()), 4), 'mean_abs_diff': round(float(d.mean()), 2)}


def grid(tiles, cols, width=1600):
    tw, th = tiles[0].size; W = width // cols; s = W / tw
    tiles = [t.resize((W, int(t.size[1] * s)), Image.LANCZOS) for t in tiles]; H = tiles[0].size[1]
    rows = (len(tiles) + cols - 1) // cols; sheet = Image.new('RGB', (W * cols, H * rows), (255, 255, 255))
    for k, t in enumerate(tiles): sheet.paste(t, ((k % cols) * W, (k // cols) * H))
    return sheet


report = {'screens': {}, 'regions': {}}
for name, rf, cap, box in SCREENS:
    r = np.asarray(Image.open(REF + rf).convert('RGB').crop(box))
    caps = {v: load(v, cap) for v, _ in VARS}
    report['screens'][name] = {v: stats(r, caps[v]) for v, _ in VARS if caps[v] is not None and caps[v].shape == r.shape}
    b, a = caps['before-asis'], caps['after-asis']
    if a is None or b is None: continue
    tiles = [label(Image.fromarray(r), 'REFERENCE (approved)'), label(Image.fromarray(b), 'BEFORE 937cfaf (Inter here)'), label(Image.fromarray(a), 'AFTER (Manrope, calibrated)'),
             label(Image.fromarray(((r.astype(int) + a.astype(int)) // 2).astype(np.uint8)), '50% onion: reference + AFTER'),
             label(Image.fromarray(heat(r, b)), 'diff: reference vs BEFORE'), label(Image.fromarray(heat(r, a)), 'diff: reference vs AFTER')]
    grid(tiles, 3 if r.shape[1] > 600 else 6).save(os.path.join(OUT, 'compare-%s.jpg' % name), quality=88)

for name, rf, off, rb, cap in CROPS:
    x0, y0, x1, y1 = rb
    ref = Image.open(REF + rf).convert('RGB').crop((x0 + off[0], y0 + off[1], x1 + off[0], y1 + off[1])); r = np.asarray(ref)
    tiles = [label(ref.copy(), 'REFERENCE')]; report['regions'][name] = {}
    for v, lab in VARS:
        im = load(v, cap)
        if im is None: continue
        c = im[y0:y1, x0:x1]; report['regions'][name][v] = stats(r, c); tiles.append(label(Image.fromarray(c), lab))
    a = load('after-asis', cap)
    if a is not None:
        c = a[y0:y1, x0:x1]
        tiles += [label(Image.fromarray(((r.astype(int) + c.astype(int)) // 2).astype(np.uint8)), 'onion ref + AFTER'), label(Image.fromarray(heat(r, c)), 'diff ref vs AFTER')]
    w, h = tiles[0].size; horiz = w < h * 1.4
    zoom = 2 if (w * len(tiles) if horiz else w) <= 800 else 1
    tiles = [t.resize((t.size[0] * zoom, t.size[1] * zoom), Image.NEAREST) for t in tiles]
    if horiz:
        sheet = Image.new('RGB', (sum(t.size[0] + 8 for t in tiles), max(t.size[1] for t in tiles)), (255, 255, 255)); x = 0
        for t in tiles: sheet.paste(t, (x, 0)); x += t.size[0] + 8
    else:
        sheet = Image.new('RGB', (max(t.size[0] for t in tiles), sum(t.size[1] + 8 for t in tiles)), (255, 255, 255)); y = 0
        for t in tiles: sheet.paste(t, (0, y)); y += t.size[1] + 8
    if sheet.size[0] > 1600: sheet = sheet.resize((1600, int(sheet.size[1] * 1600 / sheet.size[0])), Image.LANCZOS)
    sheet.save(os.path.join(OUT, 'crop-%s.jpg' % name), quality=90)

json.dump(report, open(os.path.join(OUT, 'diff-stats.json'), 'w'), indent=1)
print(json.dumps(report['screens'], indent=0))
