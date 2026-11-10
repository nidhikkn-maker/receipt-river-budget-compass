"""Track B batch B1b: BEFORE/AFTER pairs at identical viewports, and AFTER vs approved captures at matched scale.

    python3 -I scripts/browser/compose_signature_shell_b1b.py <png-dir> <out-dir>

Matched scale: the approved desktop captures are cropped to the app frame and scaled to 1440 CSS px wide (our
desktop viewport); the approved iPhone capture is cropped to the phone screen and scaled to 393 CSS px (iPhone 15).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "evidence", "signature-flow-reference")
os.makedirs(OUT, exist_ok=True)
MAX_W = 1400
FOOT = "Proposed — awaiting KK visual approval  ·  Placeholder T mark and Inter typeface — final assets pending  ·  fixture data"
DESKTOP_FRAME = (126, 92, 1308, 885)   # approved desktop captures: app content right of the rail, below the preview chrome
DESKTOP_FULL = (25, 92, 1308, 885)     # approved desktop captures: whole app frame including the rail
PHONE_SCREEN = (481, 98, 853, 892)     # approved capture 02: the phone screen


def font(size, bold=False):
    for path in ("/usr/share/fonts/opentype/inter/Inter-SemiBold.otf" if bold else "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def strip(width, text, size=20, bold=True, fill=(34, 41, 35), bg=(245, 245, 240)):
    s = Image.new("RGB", (width, size + 22), bg)
    ImageDraw.Draw(s).text((14, 10), text, font=font(size, bold), fill=fill)
    return s


def css(png, css_width):
    """Load a capture and scale it to its CSS-pixel size, so every panel shares one scale."""
    im = Image.open(os.path.join(SRC, png)).convert("RGB")
    return im.resize((css_width, round(im.height * css_width / im.width)), Image.LANCZOS)


def pair(a, b, la, lb, title, name):
    gap = 20
    h = max(a.height, b.height)
    w = a.width + b.width + gap * 3
    top = strip(w, title, 22)
    foot = strip(w, FOOT, 15, False, (142, 95, 66))
    ha, hb = strip(a.width, la, 16), strip(b.width, lb, 16)
    canvas = Image.new("RGB", (w, top.height + ha.height + h + foot.height + gap), (231, 233, 229))
    canvas.paste(top, (0, 0))
    y = top.height + gap // 2
    canvas.paste(ha, (gap, y)); canvas.paste(hb, (gap * 2 + a.width, y))
    canvas.paste(a, (gap, y + ha.height)); canvas.paste(b, (gap * 2 + a.width, y + ha.height))
    canvas.paste(foot, (0, canvas.height - foot.height))
    if canvas.width > MAX_W:
        canvas = canvas.resize((MAX_W, round(canvas.height * MAX_W / canvas.width)), Image.LANCZOS)
    canvas.save(os.path.join(OUT, name), "JPEG", quality=86, optimize=True)
    return name


WIDTH = {"iphone": 393, "ipad-portrait": 834, "ipad-landscape": 1194, "ipad-split-507": 507, "ipad-split-694": 694, "desktop": 1440}
made = []
after = sorted(f for f in os.listdir(SRC) if f.startswith("after-") and f.endswith(".png"))
for f in after:
    rest = f[len("after-"):-4]
    dev = next(d for d in WIDTH if rest.startswith(d + "-"))
    b = f"before-{rest}.png"
    if rest.endswith("smart-add-3-confirm"):
        b = f"before-{rest.replace('smart-add-3-confirm', 'smart-add-3-save-button')}.png"
    if not os.path.exists(os.path.join(SRC, b)):
        continue
    w = WIDTH[dev] if WIDTH[dev] <= 834 else 700
    made.append(pair(css(b, w), css(f, w), f"BEFORE (B1) · {dev}", f"AFTER (B1b) · {dev}", f"{rest} — before vs after, identical viewport", f"ba-{rest}.jpg"))

REF_PAIRS = [
    ("01-home-computer.png", DESKTOP_FULL, "after-desktop-home.png", 1440, "compare-01-home-desktop.jpg", "Home, desktop: approved 01 vs B1b"),
    ("02-home-iphone.png", PHONE_SCREEN, "after-iphone-home.png", 393, "compare-02-home-iphone.jpg", "Home, iPhone: approved 02 vs B1b"),
    ("03-money.png", DESKTOP_FULL, "after-desktop-money.png", 1440, "compare-03-money-desktop.jpg", "Money: approved 03 vs B1b"),
    ("05-records.png", DESKTOP_FULL, "after-desktop-records.png", 1440, "compare-05-records-desktop.jpg", "Records: approved 05 vs B1b"),
    ("08-smart-add-source.png", DESKTOP_FULL, "after-desktop-smart-add-1-add.png", 1440, "compare-08-smart-add-add.jpg", "Smart Add 1 · Add: approved 08 vs B1b"),
    ("09-smart-add-review.png", DESKTOP_FULL, "after-desktop-smart-add-2-review.png", 1440, "compare-09-smart-add-review.jpg", "Smart Add 2 · Review: approved 09 vs B1b"),
    ("10-smart-add-confirm.png", DESKTOP_FULL, "after-desktop-smart-add-3-confirm.png", 1440, "compare-10-smart-add-confirm.jpg", "Smart Add 3 · Confirm: approved 10 vs B1b"),
]
for ref, crop, ours, w, name, title in REF_PAIRS:
    if not os.path.exists(os.path.join(SRC, ours)):
        continue
    r = Image.open(os.path.join(REF, ref)).convert("RGB").crop(crop)
    r = r.resize((w, round(r.height * w / r.width)), Image.LANCZOS)
    o = css(ours, w)
    if w > 834:  # halve both for a readable side-by-side, same factor on each side
        r = r.resize((r.width // 2, r.height // 2), Image.LANCZOS); o = o.resize((o.width // 2, o.height // 2), Image.LANCZOS)
    made.append(pair(r, o, f"Approved {ref[:2]} (prototype, demo data)", "B1b build (fixture data)", title, name))

for f in after:
    im = Image.open(os.path.join(SRC, f)).convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, f.replace(".png", ".jpg")), "JPEG", quality=86, optimize=True)
    made.append(f.replace(".png", ".jpg"))
print(len(made), "images")
