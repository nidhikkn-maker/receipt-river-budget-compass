# Pass 2 measurements from the capture JSON/PNGs:
#  1. classic-diff.json   classic screens before vs after (pixel identity of the classic UI)
#  2. contrast-after.csv  every distinct Signature Flow text/background pair seen in the after captures (WCAG 2.x ratio)
#     contrast-before.csv the same for 0aea59b (before-c run, same scanner)
#  3. review-boxes.json   iPhone review: sticky actions, footer, toast, preview pill, tab bar; overlap checks
#  4. pill-boxes.json     preview pill vs Coming up heading / tab bar / Add on iPhone Home, before and after
# Usage: CAPS=<raw capture dir> python3 -I analyse.py
import csv, glob, json, os
import numpy as np
from PIL import Image

A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); C = os.environ['CAPS']; OUT = os.path.join(A, 'images')
os.makedirs(OUT, exist_ok=True)

# 1. classic identity
cl = {}
for p in sorted(glob.glob(os.path.join(C, 'before', 'classic-*.png'))):
    n = os.path.basename(p); q = os.path.join(C, 'after', n)
    if not os.path.exists(q): continue
    a = np.asarray(Image.open(p).convert('RGB')).astype(int); b = np.asarray(Image.open(q).convert('RGB')).astype(int)
    if a.shape != b.shape: cl[n] = {'shape_before': list(a.shape), 'shape_after': list(b.shape)}; continue
    d = np.abs(a - b).max(2)
    cl[n] = {'size': f'{a.shape[1]}x{a.shape[0]}', 'pixels_changed': int((d > 0).sum()), 'max_channel_delta': int(d.max())}
json.dump(cl, open(os.path.join(OUT, 'classic-diff.json'), 'w'), indent=1)

# 2. contrast
def contrast(label, pattern):
    rows = {}
    for f in sorted(glob.glob(os.path.join(C, label, pattern))):
        n = os.path.basename(f)[:-5]
        if n.startswith('classic-'): continue
        for c in json.load(open(f)).get('__contrast', []):
            if c['fg'] == c['bg']: continue  # fully transparent text (collapsed toast behind the front one); not visible
            k = (c['fg'], c['bg'], c['size'], c['weight'], c['owner'] or c['el'])
            r = rows.get(k)
            if r: r['screens'].add(n); r['count'] += c['count']; continue
            rows[k] = {**c, 'screens': {n}}
    out = sorted(rows.values(), key=lambda r: (r['pass'], r['ratio']))
    with open(os.path.join(A, f'contrast-{label}.csv'), 'w', newline='') as fh:
        w = csv.writer(fh); w.writerow(['ratio', 'required', 'pass', 'large', 'disabled', 'fg', 'bg', 'font_px', 'weight', 'element', 'owner', 'sample', 'occurrences', 'screens'])
        for r in out: w.writerow([r['ratio'], r['need'], r['pass'], r['large'], r['disabled'], r['fg'], r['bg'], r['size'], r['weight'], r['el'], r['owner'], r['sample'], r['count'], ' '.join(sorted(r['screens']))])
    act = [r for r in out if not r['disabled']]
    return {'pairs': len(out), 'enabled_pairs': len(act), 'enabled_failing': [{k: r[k] for k in ('ratio', 'need', 'fg', 'bg', 'size', 'weight', 'el', 'owner', 'sample')} | {'screens': sorted(r['screens'])} for r in act if not r['pass']],
            'disabled_pairs_below_AA': len([r for r in out if r['disabled'] and not r['pass']]), 'min_enabled_ratio': min((r['ratio'] for r in act), default=None)}
summary = {'after': contrast('after', '*.json'), 'before': contrast('before-c', '*.json')}
json.dump(summary, open(os.path.join(OUT, 'contrast-summary.json'), 'w'), indent=1)

# 3/4. boxes
def overlap(a, b):
    if not a or not b: return 0.0
    x = max(0, min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x'])); y = max(0, min(a['y'] + a['h'], b['y'] + b['h']) - max(a['y'], b['y']))
    return round(x * y, 1)
rev = {}
for lab in ('before', 'after'):
    for f in sorted(glob.glob(os.path.join(C, lab, '*09*review*.json')) + glob.glob(os.path.join(C, lab, '*10-smart-add-confirm.json'))):
        n = os.path.basename(f)[:-5]; b = json.load(open(f)).get('__boxes', {})
        if not b: continue
        acts = b.get('continueButtons', []); foot = (b.get('canvasFoot') or [None])[0]
        prim = [x for x in acts if x['inFooter']]
        rec = {'viewport': b['viewport'], 'primary_actions_visible': len(acts), 'in_footer': len(prim), 'action': prim[0] if prim else None, 'footer': foot,
               'footer_height': foot['h'] if foot else None, 'toasts': b.get('toasts', []), 'preview_pill': b.get('previewRoot', []), 'tabbar': b.get('tabbar', [])}
        a0 = prim[0] if prim else None
        rec['action_covered_by_toast_px2'] = sum(overlap(a0, t) for t in rec['toasts'])
        rec['footer_covered_by_toast_px2'] = sum(overlap(foot, t) for t in rec['toasts'])
        rec['action_covered_by_pill_px2'] = sum(overlap(a0, p) for p in rec['preview_pill'])
        rec['action_inside_viewport'] = bool(a0 and a0['y'] >= 0 and a0['bottom'] <= b['viewport']['h'])
        rev[f'{lab}/{n}'] = rec
json.dump(rev, open(os.path.join(OUT, 'review-boxes.json'), 'w'), indent=1)
pill = {}
for lab in ('before', 'after'):
    for f in sorted(glob.glob(os.path.join(C, lab, 'pill-*-home*.json')) + glob.glob(os.path.join(C, lab, 'pill-*-money*.json'))):
        n = os.path.basename(f)[:-5]; b = json.load(open(f)).get('__boxes', {})
        p = (b.get('previewRoot') or [None])[0]; pb = (b.get('previewPill') or [None])[0]
        head = (b.get('comingHead') or [None])[0]; tab = (b.get('tabbar') or [None])[0]
        pill[f'{lab}/{n}'] = {'pill_root': p, 'pill_button': pb, 'coming_up_heading': head, 'tabbar': tab,
                              'overlap_heading_px2': overlap(p, head), 'overlap_tabbar_px2': overlap(p, tab), 'painted_note': 'root box includes 44 px hit areas; painted pill is 24 px tall in after'}
json.dump(pill, open(os.path.join(OUT, 'pill-boxes.json'), 'w'), indent=1)
print(json.dumps({'classic': cl, 'contrast': {k: {kk: v[kk] for kk in ('pairs', 'enabled_pairs', 'min_enabled_ratio')} | {'failing': len(v['enabled_failing'])} for k, v in summary.items()}}, indent=1))
