"""Track B batch B1c: iPhone 15 Smart Add Review/Confirm — AFTER captures as JPEG and BEFORE/AFTER pairs at the
identical viewport (393 CSS px wide).

    python3 -I scripts/browser/compose_signature_shell_b1c.py <png-dir> <out-dir>
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
FOOT = "Proposed — awaiting KK visual approval · Placeholder T mark and Inter · fixture data"


def font(size, bold=False):
    path = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf" if bold else "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
    return ImageFont.truetype(path, size) if os.path.exists(path) else ImageFont.load_default()


def strip(w, text, size=15, bold=True, fill=(34, 41, 35)):
    s = Image.new("RGB", (w, size + 18), (245, 245, 240))
    ImageDraw.Draw(s).text((10, 8), text, font=font(size, bold), fill=fill)
    return s


def css(name):
    im = Image.open(os.path.join(SRC, name)).convert("RGB")
    return im.resize((393, round(im.height * 393 / im.width)), Image.LANCZOS)


made = []
for f in sorted(os.listdir(SRC)):
    if f.startswith("after-") and f.endswith(".png"):
        im = Image.open(os.path.join(SRC, f)).convert("RGB")
        im = im.resize((786, round(im.height * 786 / im.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, f.replace(".png", ".jpg")), "JPEG", quality=86, optimize=True)
        made.append(f)
        b = "before-" + f[len("after-"):]
        if os.path.exists(os.path.join(SRC, b)):
            a, c = css(b), css(f)
            gap = 16
            w = a.width + c.width + gap * 3
            title = strip(w, f"iPhone 15 · {f[len('after-'):-4]} — before (B1b) vs after (B1c), identical viewport", 15)
            ha, hc = strip(a.width, "BEFORE (B1b)", 13), strip(c.width, "AFTER (B1c)", 13)
            foot = strip(w, FOOT, 12, False, (142, 95, 66))
            h = title.height + ha.height + max(a.height, c.height) + foot.height + gap
            canvas = Image.new("RGB", (w, h), (231, 233, 229))
            canvas.paste(title, (0, 0))
            y = title.height + gap // 2
            canvas.paste(ha, (gap, y)); canvas.paste(hc, (gap * 2 + a.width, y))
            canvas.paste(a, (gap, y + ha.height)); canvas.paste(c, (gap * 2 + a.width, y + ha.height))
            canvas.paste(foot, (0, h - foot.height))
            canvas.save(os.path.join(OUT, "ba-" + f[len("after-"):-4] + ".jpg"), "JPEG", quality=86, optimize=True)
            made.append("ba-" + f)
print(len(made), "images")
