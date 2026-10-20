#!/usr/bin/env python3
"""
Turn everything in ./photos into web-ready WebP files and keep photos.json in sync.

    python tools/optimize_photos.py           # process new or changed photos
    python tools/optimize_photos.py --force   # redo every photo

For each photo it writes:
    assets/gallery/thumb/<id>.webp   800px tall (shown in the gallery strip)

photos.json is where you write captions. The script keeps your captions and the
order you put entries in, adds new photos at the end, and removes entries (and
their WebP files) when the original is deleted from ./photos.

EXIF data, including the GPS location phones embed, is not copied to the WebP files.

Needs Pillow:                pip install Pillow
iPhone .heic photos also:    pip install pillow-heif
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps, features
except ImportError:
    sys.exit("Pillow isn't installed. Run:  pip install Pillow")

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
    HEIF_OK = True
except ImportError:
    HEIF_OK = False

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "photos"
THUMB_DIR = ROOT / "assets" / "gallery" / "thumb"
MANIFEST = ROOT / "photos.json"

THUMB_HEIGHT = 800
THUMB_MAX_WIDTH = 2400  # keeps very wide panoramas in check
THUMB_QUALITY = 72

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".gif"}
HEIF_EXTS = {".heic", ".heif"}

NOTE = (
    "Edit 'caption' for each photo and reorder entries to reorder the gallery. "
    "Run  python tools/optimize_photos.py  after adding or removing files in ./photos. "
    "id, w and h are filled in by the script."
)


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "photo"


def unique_id(base, taken):
    candidate, n = base, 2
    while candidate in taken:
        candidate = f"{base}-{n}"
        n += 1
    return candidate


def load_manifest():
    if not MANIFEST.exists():
        return []
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        sys.exit(f"photos.json isn't valid JSON ({err}). Fix it and run again.")
    entries = data.get("photos", []) if isinstance(data, dict) else data
    return [e for e in entries if isinstance(e, dict) and e.get("file")]


def find_sources():
    allowed = IMAGE_EXTS | (HEIF_EXTS if HEIF_OK else set())
    sources, skipped_heif = [], []
    for path in sorted(SRC_DIR.iterdir(), key=lambda p: p.name.lower()):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext in allowed:
            sources.append(path)
        elif ext in HEIF_EXTS:
            skipped_heif.append(path.name)
    if skipped_heif:
        print(f"Skipping {len(skipped_heif)} HEIC file(s). To include them:  pip install pillow-heif")
    return sources


def is_fresh(src, entry):
    thumb = THUMB_DIR / f"{entry['id']}.webp"
    if not (thumb.exists() and entry.get("w") and entry.get("h")):
        return False
    return thumb.stat().st_mtime >= src.stat().st_mtime


def process(src, photo_id):
    """Write the WebP. Returns its (width, height), which the page uses to reserve space."""
    with Image.open(src) as im:
        icc = im.info.get("icc_profile")  # keeps colours right for wide-gamut phone photos
        if im.format == "JPEG":
            im.draft(im.mode, (THUMB_MAX_WIDTH, THUMB_HEIGHT))  # faster decode of huge JPEGs
        im = ImageOps.exif_transpose(im)  # respect the camera's rotation flag
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_alpha else "RGB")

        im.thumbnail((THUMB_MAX_WIDTH, THUMB_HEIGHT), Image.Resampling.LANCZOS)
        save_webp(im, THUMB_DIR / f"{photo_id}.webp", THUMB_QUALITY, icc)

        return im.width, im.height


def save_webp(img, path, quality, icc):
    options = {"quality": quality, "method": 6}
    if icc:
        options["icc_profile"] = icc
    img.save(path, "WEBP", **options)  # no exif= argument, so EXIF/GPS is dropped


def kb(path):
    return f"{path.stat().st_size / 1024:,.0f} KB"


def main():
    parser = argparse.ArgumentParser(description="Convert ./photos into WebP and update photos.json.")
    parser.add_argument("--force", action="store_true", help="re-process every photo, even unchanged ones")
    args = parser.parse_args()

    if not features.check("webp"):
        sys.exit("This Pillow build has no WebP support. Try:  pip install --upgrade Pillow")

    SRC_DIR.mkdir(exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)

    sources = {p.name: p for p in find_sources()}

    # Keep existing entries (and their order/captions) whose file still exists, then append new files.
    existing = load_manifest()
    entries, seen = [], set()
    for entry in existing:
        if entry["file"] in sources and entry["file"] not in seen:
            entries.append(entry)
            seen.add(entry["file"])
    removed = len(existing) - len(entries)
    for name in sources:
        if name not in seen:
            entries.append({"file": name, "caption": ""})

    taken = set()
    for entry in entries:
        if not entry.get("id") or entry["id"] in taken:
            entry["id"] = unique_id(slugify(Path(entry["file"]).stem), taken)
        taken.add(entry["id"])

    done = skipped = failed = 0
    for entry in entries:
        src = sources[entry["file"]]
        if not args.force and is_fresh(src, entry):
            skipped += 1
            continue
        try:
            entry["w"], entry["h"] = process(src, entry["id"])
        except Exception as err:  # one bad file shouldn't stop the rest
            entry.pop("w", None)
            entry.pop("h", None)
            failed += 1
            print(f"  ! {src.name}: {err}")
            continue
        done += 1
        print(f"  + {src.name}  ->  {entry['w']}x{entry['h']}  "
              f"({kb(src)} -> {kb(THUMB_DIR / (entry['id'] + '.webp'))})")

    # Delete WebPs that no longer belong to any photo.
    orphans = 0
    for webp in THUMB_DIR.glob("*.webp"):
        if webp.stem not in taken:
            webp.unlink()
            orphans += 1

    ordered = []
    for entry in entries:
        tidy = {"file": entry["file"], "caption": entry.get("caption", ""), "id": entry["id"]}
        if entry.get("w") and entry.get("h"):
            tidy["w"], tidy["h"] = entry["w"], entry["h"]
        tidy.update({k: v for k, v in entry.items() if k not in tidy and k not in ("w", "h")})
        ordered.append(tidy)

    MANIFEST.write_text(
        json.dumps({"_note": NOTE, "photos": ordered}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"\n{len(ordered)} photo(s) in photos.json: {done} converted, {skipped} unchanged"
          + (f", {failed} failed" if failed else "")
          + (f", {removed} removed" if removed else "")
          + (f", {orphans} old WebP file(s) deleted" if orphans else ""))
    if not ordered:
        print(f"Put some images in {SRC_DIR} and run this again.")


if __name__ == "__main__":
    main()
