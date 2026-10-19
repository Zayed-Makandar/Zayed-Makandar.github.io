# zayed-portfolio

A single-page portfolio in plain HTML, CSS and JavaScript. GSAP + ScrollTrigger and Lenis load from a CDN; there is no build step.

## Preview

Open the folder in VS Code, right-click `index.html` → **Open with Live Server**. Double-clicking `index.html` won't work, because browsers block `fetch()` of `content.json` from `file://`.

## Where things live

| To change… | Edit |
| --- | --- |
| Any text on the page | `content.json` (`*word*` = accent colour, `\n` = line break) |
| Browser tab title, link previews | `<title>` and `<meta>` tags at the top of `index.html` |
| Colours | the three variables at the top of `css/style.css` |
| Project images | files in `assets/projects/` (or point `image` in `content.json` at new ones) |
| Resume | replace `resume.pdf` |
| Photo captions and order | `photos.json` |

## Adding photos

1. Drop images (JPG, PNG, WebP, HEIC…) into `photos/`.
2. Run `python tools/optimize_photos.py` (needs `pip install Pillow`; add `pip install pillow-heif` for iPhone HEIC files).
3. Write captions in `photos.json`. Reorder the entries to reorder the gallery.

The script writes compressed WebP files to `assets/gallery/full/` (max 1600px wide) and `assets/gallery/thumb/` (800px tall). It strips EXIF data, including GPS location. Run it again any time you add or delete photos: it keeps your captions, skips photos it has already converted, and cleans up files for photos you removed. `--force` re-converts everything.

The originals in `photos/` are git-ignored, so only the WebP versions are published.

## Files

```
index.html          page structure
content.json        all the words
photos.json         gallery captions (generated, then hand-edited)
css/style.css       styles; palette at the top
js/main.js          rendering, animation, gallery, lightbox
tools/optimize_photos.py
assets/             images (zayed.jpg, projects/, gallery/)
resume.pdf
```
