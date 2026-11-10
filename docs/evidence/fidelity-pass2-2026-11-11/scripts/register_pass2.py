# Builds ../deviations-after-pass2.csv: the 109 rows of ../../fidelity-correction-2026-11-10/deviations-after.csv
# (same ids and columns) plus pass2_value, pass2_status and pass2_reason. Values are read back from the after
# captures' computed styles ($CAPS/after/*.json) where measurable. Statuses: corrected / accepted-by-decision /
# not-adopted (KK instruction) / not-addressed / unchanged (earlier status kept).
import csv, json, os
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); C = os.path.join(os.environ['CAPS'], 'after')
SRC = os.path.join(A, '..', 'fidelity-correction-2026-11-10', 'deviations-after.csv')
J = lambda n: json.load(open(os.path.join(C, n + '.json'))) if os.path.exists(os.path.join(C, n + '.json')) else {}
D, P, P2, C9, C10 = J('desktop-01-home'), J('iphone-02-home'), J('iphone-02-home-native'), J('desktop-09-smart-add-review'), J('desktop-10-smart-add-confirm')
def st(d, role, prop):
    try: return d[role]['style'][prop]
    except KeyError: return '?'
def rect(d, role):
    try: r = d[role]['rect']; return f"{r['w']:g}x{r['h']:g}"
    except KeyError: return '?'
rb = json.load(open(os.path.join(A, 'images', 'review-boxes.json'))) if os.path.exists(os.path.join(A, 'images', 'review-boxes.json')) else {}
iph = rb.get('after/iphone-09-smart-add-review', {})
CO, AC, NO = 'corrected', 'accepted-by-decision', 'not-adopted'
R = {
 'FD-003': (f"tabular-nums on hero figure ({st(D, 'worthFigure', 'font-variant-numeric')}) and panel metrics ({st(D, 'metricFigure', 'font-variant-numeric')}); Manrope kept", CO, 'KK decision 1: tabular financial numerals (spec 3.3) over the image.'),
 'FD-009': ('sync status (16 px icon button, words shown when offline/failed/waiting) and Search (opens the palette) kept', AC, 'KK decision 3: functional Search and sync status stay; tests in src/components/shell/pass2.test.tsx.'),
 'FD-010': (f"header glyphs 16 px in 44 px boxes (measured {rect(D, 'headerIcon')})", CO, 'KK decision 3: aligned with the reference header metrics; vector icons kept.'),
 'FD-016': (f"active tile {st(D, 'railActive', 'background-color')} (token --sf-rail-active #E0EEEE)", CO, 'KK colours approved: reference value as a Signature Flow token.'),
 'FD-023': (f"lede {st(D, 'lede', 'color')} = #646D65 (5.1:1 on #F9F9F7)", AC, 'KK decision 6: the reference #778178 is 3.8:1 on the canvas (fails AA); AA colour kept.'),
 'FD-028': (f"panel {st(D, 'worthPanel', 'background-color')} (token --sf-panel #29493E)", CO, 'KK colours approved.'),
 'FD-038': ('ghost button = 8 % canvas over #29493E = about #3A574D', CO, 'Follows the approved panel colour (no separate override).'),
 'FD-047': ('amount column kept, right-aligned, tabular, captioned Due/Expected/Overdue; row read as e.g. "Card payment. Payment ₹25,000.00 due 10 Nov."', AC, 'KK decision 4.'),
 'FD-052': ('primary buttons/avatar #26565A (--sf-deep); Review now #2C5341 (--sf-action-deep)', CO, 'KK colours approved.'),
 'FD-053': (f"canvas {st(D, 'body', 'background-color')} (token --sf-canvas #F9F9F7)", CO, 'KK colours approved.'),
 'FD-072': (f"titles wrap to two lines on every size (iPhone title {rect(P2, 'comingTitle')}), amount labelled", CO, 'KK decision 4: no truncation that hides meaning.'),
 'FD-077': ('central Add stays deep green #223B35 (--sf-add); active tab teal', NO, 'KK instruction: keep the deep-green Add; the reference blue is not adopted.'),
 'FD-087': ('Records highlighted on Travel; Home > Records > Travel crumbs; Records sub-navigation; /records/travel redirects to /trips', CO, 'KK decision 7.'),
 'FD-089': (f"desktop review canvas {rect(C9, 'canvas')} (narrow, Details/Original tabs); original side by side only on request at >= 1100 px", CO, 'KK decision 5. Statement Desk keeps the wide comparison canvas (genuine document comparison).'),
 'FD-096': ('steps current/done #DFEDE0, later #EDF2EC (tokens --sf-step-on/off)', CO, 'KK colours approved; later-step text #646D65 is 4.7:1 on #EDF2EC.'),
 'FD-099': ('no helper line for a receipt (as reference 08); one short line for statement/travel/asset', CO, 'KK decision 8.'),
 'FD-106': (f"iPhone review footer {iph.get('footer_height', '?')} px: one-line reason + Start over / Continue to confirmation on one row; one primary action; follows the visual viewport (keyboard)", CO, 'KK decision 9; boxes in images/review-boxes.json.'),
}
rows = list(csv.DictReader(open(SRC, encoding='utf-8')))
fields = list(rows[0].keys()) + ['pass2_value', 'pass2_status', 'pass2_reason']
with open(os.path.join(A, 'deviations-after-pass2.csv'), 'w', newline='', encoding='utf-8') as fh:
    w = csv.DictWriter(fh, fieldnames=fields); w.writeheader()
    for r in rows:
        v = R.get(r['id'])
        if v: r.update(pass2_value=v[0], pass2_status=v[1], pass2_reason=v[2])
        else: r.update(pass2_value=r['corrected_value'], pass2_status=r['status'] if r['status'] != 'decision-needed' else 'decision-needed', pass2_reason='unchanged in pass 2')
        w.writerow(r)
from collections import Counter
print(Counter(r['pass2_status'] for r in csv.DictReader(open(os.path.join(A, 'deviations-after-pass2.csv'), encoding='utf-8'))))
print('unhandled decision rows:', [r['id'] for r in rows if r['status'] == 'decision-needed' and r['id'] not in R])
