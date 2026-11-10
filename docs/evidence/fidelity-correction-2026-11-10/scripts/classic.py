# Classic UI must render identically before/after: pixel diff of captures/{before,after}-asis/classic-*.png
import glob, json, os
import numpy as np
from PIL import Image
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); C = os.path.join(A, 'captures'); out = {}
for p in sorted(glob.glob(os.path.join(C, 'before-asis', 'classic-*.png'))):
    n = os.path.basename(p); q = os.path.join(C, 'after-asis', n)
    if not os.path.exists(q): continue
    a = np.asarray(Image.open(p).convert('RGB')).astype(int); b = np.asarray(Image.open(q).convert('RGB')).astype(int)
    if a.shape != b.shape: out[n] = {'shape_before': a.shape, 'shape_after': b.shape}; continue
    d = np.abs(a - b).max(2)
    out[n] = {'size': f'{a.shape[1]}x{a.shape[0]}', 'pixels_changed': int((d > 0).sum()), 'fraction_changed': round(float((d > 0).mean()), 6), 'max_channel_delta': int(d.max())}
json.dump(out, open(os.path.join(A, 'images', 'classic-diff.json'), 'w'), indent=1); print(json.dumps(out, indent=1))
