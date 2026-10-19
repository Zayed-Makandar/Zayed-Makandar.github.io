#!/usr/bin/env python3
"""
Generate the link-preview image and icons from the site's own fonts, colours and photo.

    python tools/make_social_images.py

Writes:
    assets/og-image.jpg          1200x630 preview for LinkedIn, WhatsApp, X, Google
    favicon.ico                  48x48 (search results and older browsers)
    assets/icons/icon-96.png     96x96
    assets/icons/icon-192.png    192x192 (Android home screen)
    assets/icons/icon-512.png    512x512
    assets/icons/apple-touch-icon.png  180x180 (iPhone home screen)

Re-run it after replacing assets/zayed.jpg or changing your name or job in content.json.
Needs Pillow and fontTools:  pip install Pillow fonttools brotli
"""

import io
import json
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
ICONS = ROOT / "assets" / "icons"

PAPER = (243, 239, 230)
INK = (21, 20, 18)
ACCENT = (232, 70, 30)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def font(file, size, **axes):
    """Load a variable woff2 at fixed axis values (Pillow can't read woff2 directly)."""
    tt = TTFont(FONTS / file)
    if "fvar" in tt:
        tt = instantiateVariableFont(tt, axes)
    tt.flavor = None
    buf = io.BytesIO()
    tt.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


def draw_tracked(draw, xy, text, fnt, fill, tracking):
    """Draw text with letter-spacing (tracking in em, negative = tighter)."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += fnt.getlength(ch) + tracking * fnt.size
    return x


def og_image(content):
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), INK)
    draw = ImageDraw.Draw(img)

    # Same gradient as the site footer: near-black, through ember, into vermilion.
    ember = mix(INK, ACCENT, 0.38)
    for y in range(h):
        t = y / (h - 1)
        if t < 0.32:
            c = INK
        elif t < 0.62:
            c = mix(INK, ember, (t - 0.32) / 0.30)
        else:
            c = mix(ember, ACCENT, (t - 0.62) / 0.38)
        draw.line([(0, y), (w, y)], fill=c)
    # Fine grain, like the footer.
    noise = Image.effect_noise((w, h), 48).convert("RGB")
    img = Image.blend(img, noise, 0.05)
    draw = ImageDraw.Draw(img)

    name = content.get("name", "Zayed Makandar").split()
    role = (content.get("work", {}).get("items") or [{}])[0].get("role", "AI/ML Engineer")
    place = content.get("footer", {}).get("location", "")

    mono = font("geist-mono-latin.woff2", 24, wght=500)
    display = font("bricolage-grotesque-latin.woff2", 148, wght=800, opsz=96, wdth=100)

    draw_tracked(draw, (72, 62), "ZAYEDMAKANDAR.COM", mono, mix(PAPER, INK, 0.35), 0.08)

    y = 150
    for word in name:
        draw_tracked(draw, (66, y), word, display, PAPER, -0.055)
        y += 126

    subtitle = f"{role} · {place}".upper() if place else role.upper()
    draw_tracked(draw, (72, 440), subtitle, mono, PAPER, 0.06)
    draw_tracked(draw, (72, 478), "COMPUTER VISION · LLMs · SPEECH · EDGE AI", mono, mix(PAPER, ACCENT, 0.35), 0.06)

    # Round duotone photo, like the hero sticker.
    photo_path = ROOT / content.get("hero", {}).get("photo", "assets/zayed.jpg")
    if photo_path.exists():
        size, border = 300, 12
        photo = ImageOps.fit(Image.open(photo_path).convert("RGB"), (size * 2, size * 2), Image.Resampling.LANCZOS)
        photo = ImageOps.colorize(ImageOps.autocontrast(photo.convert("L"), cutoff=1), black=INK, white=ACCENT)
        photo = photo.resize((size, size), Image.Resampling.LANCZOS)
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size * 4, size * 4), fill=255)
        mask = mask.resize((size, size), Image.Resampling.LANCZOS)
        cx, cy = 960, 300
        ring = size + border * 2
        ring_img = Image.new("L", (ring * 4, ring * 4), 0)
        ImageDraw.Draw(ring_img).ellipse((0, 0, ring * 4, ring * 4), fill=255)
        ring_img = ring_img.resize((ring, ring), Image.Resampling.LANCZOS)
        img.paste(Image.new("RGB", (ring, ring), PAPER), (cx - ring // 2, cy - ring // 2), ring_img)
        img.paste(photo, (cx - size // 2, cy - size // 2), mask)

    out = ROOT / "assets" / "og-image.jpg"
    img.save(out, "JPEG", quality=90, optimize=True, progressive=True)
    print(f"  {out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")


def icon(size, rounded=True):
    """The favicon mark: vermilion tile with an ink Z (drawn big, then scaled down)."""
    s = size * 8
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = round(s * 14 / 64) if rounded else 0
    draw.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=ACCENT)
    k = s / 64
    pts = [(19 * k, 19 * k), (45 * k, 19 * k), (19 * k, 45 * k), (45 * k, 45 * k)]
    width = round(7 * k)
    draw.line(pts, fill=INK, width=width, joint="curve")
    for x, y in (pts[0], pts[-1]):
        draw.ellipse((x - width / 2, y - width / 2, x + width / 2, y + width / 2), fill=INK)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main():
    content = json.loads((ROOT / "content.json").read_text(encoding="utf-8"))
    ICONS.mkdir(parents=True, exist_ok=True)
    print("Writing:")
    og_image(content)
    icon(48).save(ROOT / "favicon.ico", sizes=[(48, 48)])
    print("  favicon.ico")
    for size in (96, 192, 512):
        icon(size).save(ICONS / f"icon-{size}.png", optimize=True)
        print(f"  assets/icons/icon-{size}.png")
    # iOS rounds the corners itself, so the home-screen icon is a plain square.
    icon(180, rounded=False).convert("RGB").save(ICONS / "apple-touch-icon.png", optimize=True)
    print("  assets/icons/apple-touch-icon.png")


if __name__ == "__main__":
    main()
