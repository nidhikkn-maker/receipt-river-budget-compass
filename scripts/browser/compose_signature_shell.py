"""Track B batch B1: convert Signature Flow shell captures to JPEG (max 1400 px wide) and build side-by-side
composites against the approved Signature Flow reference captures.

    python3 -I scripts/browser/compose_signature_shell.py <png-dir> <out-dir>

Every image is labelled "Proposed — awaiting KK visual approval"; the shell uses a placeholder T mark.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
REF = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "evidence", "signature-flow-reference")
os.makedirs(OUT, exist_ok=True)
MAX_W = 1400
FOOT = "Proposed — awaiting KK visual approval  ·  Placeholder T mark — final artwork pending  ·  fixture data"


def font(size, bold=False):
    for path in ("/usr/share/fonts/opentype/inter/Inter-SemiBold.otf" if bold else "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def fit_width(im, w=MAX_W):
    if im.width <= w:
        return im
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def save_jpeg(im, name):
    path = os.path.join(OUT, name)
    fit_width(im.convert("RGB")).save(path, "JPEG", quality=86, optimize=True)
    return path


def label_strip(width, text, size=22, bold=True, fill=(34, 41, 35), bg=(245, 245, 240)):
    strip = Image.new("RGB", (width, size + 26), bg)
    ImageDraw.Draw(strip).text((16, 12), text, font=font(size, bold), fill=fill)
    return strip


def single(png):
    im = Image.open(os.path.join(SRC, png)).convert("RGB")
    im = fit_width(im)
    foot = label_strip(im.width, FOOT, size=15, bold=False, fill=(142, 95, 66))
    out = Image.new("RGB", (im.width, im.height + foot.height), "white")
    out.paste(im, (0, 0))
    out.paste(foot, (0, im.height))
    return save_jpeg(out, png.replace(".png", ".jpg"))


def side_by_side(ref_name, ours_png, out_name, title, crop=None, height=760):
    ref = Image.open(os.path.join(REF, ref_name)).convert("RGB")
    if crop:
        ref = ref.crop(crop)
    ours = Image.open(os.path.join(SRC, ours_png)).convert("RGB")
    ref = ref.resize((round(ref.width * height / ref.height), height), Image.LANCZOS)
    ours = ours.resize((round(ours.width * height / ours.height), height), Image.LANCZOS)
    gap = 24
    w = ref.width + ours.width + gap * 3
    head_a = label_strip(ref.width, f"Approved {ref_name[:2]} (demo data)", size=18)
    head_b = label_strip(ours.width, "Proposed build (fixture data)", size=18)
    top = label_strip(w, title, size=24)
    foot = label_strip(w, FOOT, size=17, bold=False, fill=(142, 95, 66))
    h = top.height + head_a.height + height + foot.height + gap
    canvas = Image.new("RGB", (w, h), (231, 233, 229))
    canvas.paste(top, (0, 0))
    y = top.height + gap // 2
    canvas.paste(head_a, (gap, y)); canvas.paste(head_b, (gap * 2 + ref.width, y))
    y += head_a.height
    canvas.paste(ref, (gap, y)); canvas.paste(ours, (gap * 2 + ref.width, y))
    canvas.paste(foot, (0, h - foot.height))
    return save_jpeg(canvas, out_name)


made = []
for png in sorted(f for f in os.listdir(SRC) if f.endswith(".png")):
    made.append(single(png))
PAIRS = [
    ("01-home-computer.png", "desktop-01-home.png", "compare-01-home-desktop.jpg", "Home on a computer — approved capture 01 vs proposed build (1440×900)", None),
    ("02-home-iphone.png", "iphone-01-home.png", "compare-02-home-iphone.jpg", "Home, iPhone: capture 02 vs proposed", (478, 92, 856, 896)),
    ("03-money.png", "desktop-02-money.png", "compare-03-money-desktop.jpg", "Money — approved capture 03 vs proposed build (1440×900)", None),
    ("05-records.png", "desktop-04-records.png", "compare-05-records-desktop.jpg", "Records — approved capture 05 vs proposed build (1440×900)", None),
    ("08-smart-add-source.png", "desktop-08-smart-add.png", "compare-08-smart-add-desktop.jpg", "Smart Add — approved capture 08 vs existing Smart Add sheet in the proposed theme (1440×900)", None),
]
for ref, ours, name, title, crop in PAIRS:
    if os.path.exists(os.path.join(SRC, ours)):
        made.append(side_by_side(ref, ours, name, title, crop))
print(json.dumps([os.path.basename(m) for m in made], indent=1))
