# Builds ../deviations-after.csv: the audit's 109 rows (same ids and columns) plus corrected_value, residual_delta,
# status (corrected / within-tolerance / decision-needed / not-addressed) and reason.
# Values in M[...] are computed styles / rectangles read back from captures/after-asis/*.json (CDP + getComputedStyle).
import csv, json, os

A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
AUD = os.path.join(A, '..', 'fidelity-audit-2026-11-10', 'deviations.csv')
C = os.path.join(A, 'captures', 'after-asis')


def J(n):
    p = os.path.join(C, n + '.json')
    return json.load(open(p)) if os.path.exists(p) else {}


D, P, M3, C8, C9, C10 = J('desktop-01-home'), J('iphone-02-home'), J('desktop-03-money'), J('desktop-08-smart-add-source'), J('desktop-09-smart-add-review'), J('desktop-10-smart-add-confirm')


def st(d, role, prop):
    try: return d[role]['style'][prop]
    except KeyError: return '?'


def rect(d, role):
    try: r = d[role]['rect']; return f"{r['w']:g}x{r['h']:g}"
    except KeyError: return '?'


def fnt(d, role):
    return f"{st(d, role, 'font-size')} / {st(d, role, 'font-weight')} / {st(d, role, 'letter-spacing')}"


pf = '?'
try: pf = ', '.join(f"{f['familyName']} ({f['postScriptName']}) isCustomFont:{str(f['isCustomFont']).lower()}" for f in D['greeting']['platformFonts'])
except KeyError: pass

C_ = 'corrected'; W = 'within-tolerance'; DN = 'decision-needed'; NA = 'not-addressed'
R = {
 'FD-001': (f'Manrope self-hosted (latin + latin-ext variable woff2, font-display: swap, preload in Signature Flow); CDP greeting: {pf}', '0 (same family)', C_, ''),
 'FD-002': ('"Manrope Fallback" @font-face: local Arial/Helvetica/Liberation Sans, size-adjust 102%, ascent 104.5%, descent 29.4%, line-gap 0%', 'Segoe UI / SF Pro not measurable here', C_, 'Tuned from Manrope vs Arial-metric advance widths (fontTools); verify on real Windows/iOS.'),
 'FD-003': (f"proportional (font-variant-numeric: {st(D, 'worthFigure', 'font-variant-numeric')}) on hero figure and panel metrics; lists/columns keep tabular", '0', DN, 'Implemented to match the reference; spec §3.3 says tabular for money. KK to confirm.'),
 'FD-004': (fnt(D, 'wordmark') + ' (text "Thapal" per spec)', 'size/weight 0; text differs by spec', C_, ''),
 'FD-005': ('padding-left 43px (>=768)', '0', C_, ''),
 'FD-006': ('padding-right 42px (>=768)', '0', C_, ''),
 'FD-007': (f"34px painted circle inside {rect(D, 'avatar')} hit box", '0 visual; hit box kept at 44', C_, '44 px rule kept (::before circle).'),
 'FD-008': (f"{rect(D, 'workspace')} box, 38px painted pill, {st(D, 'workspace', 'font-size')} / {st(D, 'workspace', 'font-weight')}, 12px chevron", 'height: 38 painted (44 hit); width within ~10px', C_, '44 px rule kept.'),
 'FD-009': ('unchanged (sync status + search icon kept)', 'present vs absent', DN, 'Spec §5.1 lists Search as a global utility; KK to confirm removal.'),
 'FD-010': ('unchanged 20px vector icons', '+4-6 px', DN, 'Spec §3.3 mandates vector icons in 20/24 boxes.'),
 'FD-011': ('rail 100px; shell padding-left 100px', '0', C_, ''),
 'FD-012': ('rail background var(--background) (same as canvas)', '0', C_, ''),
 'FD-013': (fnt(D, 'tmark'), '0', C_, 'Placeholder until Option 02 artwork.'),
 'FD-014': ('rail-nav gap 13px; tile 42px; label gap 5px', 'see railLabel rects in after JSON', W, 'Pitch within ~3 px of 83.'),
 'FD-015': ('active tile 38x42 / 13px radius, inset ring removed', '+2px width', W, ''),
 'FD-016': ('unchanged var(--accent) (#E9F2EC family)', '~ΔE small', DN, 'Palette value outside the spec palette; no colour changes in this pass.'),
 'FD-017': ('10px; inactive 600, active 800', '0', C_, ''),
 'FD-018': ('20px vector icons', '+2-4 px vs Unicode placeholders', W, 'Spec: vector icons, 20/24 boxes.'),
 'FD-019': ('settings icon 16px', '+6px vs 10px ring placeholder', W, 'Vector icon kept.'),
 'FD-020': (fnt(D, 'greeting') + f" (box {rect(D, 'greeting')})", 'width 371.5 vs ink 368-371', C_, ''),
 'FD-021': (fnt(D, 'overline'), '0', C_, ''),
 'FD-022': (f"{st(D, 'lede', 'font-size')} / {st(D, 'lede', 'line-height')}", '0', C_, ''),
 'FD-023': ('unchanged #646D65 (AA)', 'darker than reference', DN, 'Kept for WCAG AA contrast unless KK accepts #778178.'),
 'FD-024': (f"{rect(D, 'homeBtnDeep')} / 12px 800 / 12px radius", 'height 0; width within ~8px', C_, ''),
 'FD-025': ('main padding 36px 50px 64px 49px (>=1180)', '0', C_, ''),
 'FD-026': (f"panel {rect(D, 'worthPanel')}; grid 673fr/360fr, gap 38", 'within ~8x5 px', C_, ''),
 'FD-027': (f"radius {st(D, 'worthPanel', 'border-radius')}", '0', C_, ''),
 'FD-028': ('unchanged #223B35 (--sf-deep)', 'fill #223B35 vs #29493E', DN, 'Spec palette Deep #223B35 vs captured #29493E; colours not changed in this pass.'),
 'FD-029': (fnt(D, 'worthFigure'), '0', C_, ''),
 'FD-030': ('10px / 600 / 0.16em', '0', C_, ''),
 'FD-031': (st(D, 'worthNote', 'font-size'), '0', C_, ''),
 'FD-032': ('metrics margin-top 20, padding-top 24', 'within ~3 px', W, ''),
 'FD-033': (f"{st(D, 'metricLabel', 'font-size')} / {st(D, 'metricLabel', 'font-weight')}", '0', C_, ''),
 'FD-034': (fnt(D, 'metricFigure'), '0', C_, ''),
 'FD-035': (f"{st(D, 'metricSub', 'font-size')} / {st(D, 'metricSub', 'font-weight')}", '0', C_, ''),
 'FD-036': (f"38px painted pill in {rect(D, 'worthBtnLight')} box; 11px 800; 10px radius", 'visual 0; hit 44', C_, '44 px rule kept (::before pill).'),
 'FD-037': ('mint tint color-mix(--sf-mint 42%, --sf-on-deep)', '~±3 levels', C_, 'Token mix, no new colour value.'),
 'FD-038': ('unchanged (follows panel colour)', 'follows FD-028', DN, 'Depends on the panel-colour decision.'),
 'FD-039': (fnt(D, 'sectionTitle'), '0', C_, ''),
 'FD-040': (f"{st(D, 'sectionLink', 'font-size')} / {st(D, 'sectionLink', 'font-weight')}; 44px hit box", '0', C_, ''),
 'FD-041': ('right column 360fr, gap 38', 'within ~5 px', C_, ''),
 'FD-042': (f"row min-height 71px ({rect(D, 'dateRow')})", '0', C_, ''),
 'FD-043': ('12px / 800', '0', C_, ''),
 'FD-044': ('11px / 500', '0', C_, ''),
 'FD-045': ('21px / 700', '0', C_, ''),
 'FD-046': ('10px / 600 / 0, uppercase', '0', C_, ''),
 'FD-047': ('unchanged (amount column kept)', 'extra column', DN, 'Removing amounts from Coming up is a content decision for KK.'),
 'FD-048': ('margin-top 24, padding 14px 24px, radius 16', 'height within ~4 px', C_, ''),
 'FD-049': ('12px 800 / 11px 500', '0', C_, ''),
 'FD-050': (f"36px painted pill in {rect(D, 'nextBtn')} box; 11px 800; radius 9", 'visual 0; hit 44', C_, '44 px rule kept.'),
 'FD-051': ('1px top hairline, padding-top 24, margin-top 28', '0', C_, ''),
 'FD-052': ('unchanged #223B35', 'hue differs', DN, 'Spec palette Deep #223B35.'),
 'FD-053': ('unchanged #FBFBF8 (--sf-canvas)', '2 levels', DN, 'Spec palette Canvas #FBFBF8; colours not changed.'),
 'FD-054': (f"header {rect(P, 'header')}", '0', C_, ''),
 'FD-055': (fnt(P, 'wordmark'), '0', C_, ''),
 'FD-056': (f"{st(P, 'workspace', 'font-size')} / {st(P, 'workspace', 'font-weight')}", '0', C_, ''),
 'FD-057': ('18px vector icons', '+4 px', W, 'Vector icons kept (spec §3.3).'),
 'FD-058': ('gutter 20px', '0', C_, ''),
 'FD-059': ('lede in left column ("lede ."), 13px', '0', C_, ''),
 'FD-060': (fnt(P, 'greeting'), '0', C_, ''),
 'FD-061': ('10px / 700 / 0.18em', '0', C_, ''),
 'FD-062': (f"36px painted pill in {rect(P, 'homeBtnDeep')} box; 10.5px 800", 'visual 0; hit 44', C_, '44 px rule kept.'),
 'FD-063': (f"panel {rect(P, 'worthPanel')}, radius {st(P, 'worthPanel', 'border-radius')}", 'width 332 vs 319 (gutter 20 both sides; reference shows an inner scrollbar)', W, ''),
 'FD-064': ('padding 26px 21px 24px', '0', C_, ''),
 'FD-065': (fnt(P, 'worthFigure'), '0', C_, ''),
 'FD-066': ('9.5px / 800 / 0.18em', '0', C_, ''),
 'FD-067': ('metrics margin-top 22, padding-top 20', '0', C_, ''),
 'FD-068': (f"{st(P, 'metricLabel', 'font-size')} 500 / {st(P, 'metricFigure', 'font-size')} 700 -0.02em", '0', C_, ''),
 'FD-069': (f"one row; 36px painted pills in {rect(P, 'worthBtnLight')} boxes; 10px 800", 'visual 0; hit 44', C_, '44 px rule kept.'),
 'FD-070': (fnt(P, 'sectionTitle'), '0', C_, ''),
 'FD-071': ('71px / 12px 800 / 11px', '0', C_, ''),
 'FD-072': ('titles wrap to two lines (line-clamp 2) beside the amount', 'amount column kept', DN, 'No truncation; removing the amount is FD-047 decision.'),
 'FD-073': ('bar height 58px; colour unchanged (--card)', 'colour 2 levels', W, 'Colour not changed in this pass.'),
 'FD-074': ('20px vector icons', '+4 px', W, 'Spec: vector icons 20/24 boxes.'),
 'FD-075': ('10px', '0', C_, ''),
 'FD-076': (f"Add {rect(P, 'tabAdd')}, radius 14, no shadow, 18px icon", 'height +5 (44 rule)', C_, '44 px rule kept.'),
 'FD-077': ('unchanged deep green', 'blue in reference', DN, 'Blue contradicts the forest-ink palette and the desktop capture.'),
 'FD-078': (fnt(M3, 'pageTitle'), '0', C_, ''),
 'FD-079': (f"{st(M3, 'lede', 'font-size')} / {st(M3, 'lede', 'line-height')} / max 610px", '0', C_, ''),
 'FD-080': ('Back 11.5px 800 + 12px arrow; crumbs 11px; 12px separator; 44px hit boxes', '0', C_, ''),
 'FD-081': (f"32px painted pill in {rect(M3, 'find')} box; radius 8; 11.5px 800", 'visual 0; hit 44', C_, '44 px rule kept.'),
 'FD-082': ('13.5px 700 / 11px', '0', C_, ''),
 'FD-083': ('padding 10px 16px, radius 12, 11px', '0', C_, ''),
 'FD-084': ('unchanged (legacy Statement Desk body)', 'structural', NA, 'Structural rebuild out of scope for this fidelity pass (owner instruction).'),
 'FD-085': ('unchanged (legacy trips body)', 'structural', NA, 'Structural rebuild out of scope for this fidelity pass.'),
 'FD-086': ('unchanged (legacy reports body)', 'structural', NA, 'Structural rebuild out of scope for this fidelity pass.'),
 'FD-087': ('unchanged', 'Records highlighted', DN, 'KK to confirm the parent of Travel.'),
 'FD-088': (f"canvas {rect(C8, 'canvas')}", 'width 0; height +66 px (44 px controls, helper line and "Type it in" kept)', C_, 'Width corrected; height follows kept 44 px controls and content (FD-099, FD-100, FD-101).'),
 'FD-089': ('unchanged wide two-pane review (typography tightened)', 'structural', DN, 'Spec §4 says wide original-vs-fields canvas on desktop; the image shows the narrow modal.'),
 'FD-090': ('radius 25px, fill var(--card)', '~2 levels', C_, ''),
 'FD-091': ('scrim color-mix(--sf-ink 68%), no blur', '~±5 levels', C_, ''),
 'FD-092': (fnt(C8, 'canvasTitle'), '0', C_, ''),
 'FD-093': ('10px / 700 / 0.16em', '0', C_, ''),
 'FD-094': ('35px painted circle in 44px box, 12px icon', 'visual 0; hit 44', C_, '44 px rule kept.'),
 'FD-095': ('31px / 8px / 10px; current 800, no ring; done check kept', 'check icon kept', W, 'Check icon kept so "done" is not colour-only.'),
 'FD-096': ('unchanged colours', '~2-5 levels', DN, 'Colours not changed in this pass.'),
 'FD-097': ('13px / 1.6', '0', C_, ''),
 'FD-098': (f"38px painted pill in {rect(C8, 'chip')} box; radius 10; 11px 500 (on 600); icons hidden >=768", 'visual 0; hit 44', C_, '44 px rule kept.'),
 'FD-099': ('kept, 11px', '+1 line', DN, 'Guidance text; removing it is a content decision.'),
 'FD-100': (f"drop zone {rect(C8, 'drop')}, 1px border, radius 16, 12px 800 / 10px", 'height +~20 (44 px Choose files button kept)', W, 'The 44 px "Choose files" control is kept (reference shows a native file input).'),
 'FD-101': ('11px 800; "Type it in" kept', 'extra link', W, '"Type it in" is an approved entry path.'),
 'FD-102': (f"42px painted pill in {rect(C8, 'footBtnDeep')} box; 11.5px 800; radius 11", 'visual 0; hit 44', C_, '44 px rule kept.'),
 'FD-103': ('card 12.5px 800 / 10px; dt 10px 500; dd 11px 800; 6 facts + account block kept', 'extra rows', C_, 'Extra facts and the account-confirmation block are B1c safeguards and stay.'),
 'FD-104': ('toasts sit above the canvas footer while the canvas is open (bottom 116px desktop)', 'no overlap with actions', C_, ''),
 'FD-105': ('toasts sit above the canvas footer on phones (bottom 168px + safe area)', 'no overlap with actions', C_, ''),
 'FD-106': ('unchanged structure; note 11px', 'n/a', DN, 'No approved iPhone canvas reference.'),
 'FD-107': ('unchanged "09 Nov 2026"', 'leading zero', NA, 'Owner instruction (binding) wins over the image: Smart Add dates read "09 Nov 2026".'),
 'FD-108': ('unchanged (legacy travel body; shared with classic UI)', 'ISO dates', NA, 'Legacy page body is shared with the classic UI and is out of scope for this pass.'),
 'FD-109': ('text links, crumbs, Back, Find, chips, worth/next/canvas buttons now have 44px boxes; painted sizes follow the reference', 'remaining under-44 list in after JSON (__smallTargets)', C_, '44 px rule (owner).'),
}
rows = list(csv.DictReader(open(AUD)))
cols = list(rows[0].keys()) + ['corrected_value', 'residual_delta', 'status', 'reason']
with open(os.path.join(A, 'deviations-after.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
    for r in rows:
        cv, rd, s, why = R[r['id']]
        r.update(corrected_value=cv, residual_delta=rd, status=s, reason=why); w.writerow(r)
from collections import Counter
print(len(rows), Counter(R[r['id']][2] for r in rows))
print('visible:', Counter(R[r['id']][2] for r in rows if r['severity'].startswith('visible')))
