#!/usr/bin/env python3
"""Turn a folder of camera JPEGs into an album under src/albums/.

Photos are re-encoded to WebP at 2048px on the long edge, with an 800px
thumbnail beside them in thumbs/. Duplicates are dropped by content hash,
and the order follows the EXIF capture time so multiple cameras interleave
the way the night actually ran.

  python3 scripts/build_album.py \
      --title "Sangria y Salsa" \
      --date 2026-07-25 \
      ~/Downloads/"DCS Salsa Night July 2026"

Pass more than one source folder to merge several dumps into one album.
"""

import argparse
import hashlib
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps

FULL_EDGE = 2048
THUMB_EDGE = 800
FULL_QUALITY = 82
THUMB_QUALITY = 78
SUFFIXES = {".jpg", ".jpeg", ".png", ".heic", ".webp", ".tif", ".tiff"}


def slugify(text):
    out = []
    for ch in text.lower():
        out.append(ch if ch.isalnum() else "-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def shot_at(path):
    """EXIF capture time, falling back to file mtime."""
    try:
        with Image.open(path) as im:
            exif = im.getexif()
        for tag in (36867, 36868, 306):  # DateTimeOriginal, Digitized, DateTime
            raw = exif.get(tag)
            if raw:
                return datetime.strptime(str(raw)[:19], "%Y:%m:%d %H:%M:%S")
    except Exception:
        pass
    return datetime.fromtimestamp(path.stat().st_mtime)


def digest(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def collect(sources):
    seen = {}
    skipped = 0
    for source in sources:
        root = Path(source).expanduser()
        if not root.is_dir():
            sys.exit(f"not a folder: {root}")
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in SUFFIXES:
                continue
            if path.name.startswith("."):
                continue
            key = digest(path)
            if key in seen:
                skipped += 1
                continue
            seen[key] = path
    photos = sorted(seen.values(), key=shot_at)
    return photos, skipped


def encode(src, dest, edge, quality):
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        im.thumbnail((edge, edge), Image.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "WEBP", quality=quality, method=6)
        return im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sources", nargs="+", help="folder(s) of photos")
    ap.add_argument("--title", required=True)
    ap.add_argument("--date", required=True, help="YYYY-MM-DD")
    ap.add_argument("--albums-dir", default="src/albums")
    args = ap.parse_args()

    try:
        datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        sys.exit("date must be YYYY-MM-DD")

    out = Path(args.albums_dir) / f"{args.date}-{slugify(args.title)}"
    if out.exists():
        sys.exit(f"album already exists, remove it first: {out}")

    photos, skipped = collect(args.sources)
    if not photos:
        sys.exit("no photos found")
    print(f"{len(photos)} photos, {skipped} duplicates skipped")

    entries = []
    for i, src in enumerate(photos, start=1):
        name = f"{i:03d}-{slugify(src.stem)}.webp"
        w, h = encode(src, out / name, FULL_EDGE, FULL_QUALITY)
        encode(src, out / "thumbs" / name, THUMB_EDGE, THUMB_QUALITY)
        entries.append(f'  - "{name}#{w}x{h}"')
        if i % 25 == 0 or i == len(photos):
            print(f"  {i}/{len(photos)}")

    index = out / "index.md"
    index.write_text(
        "---\n"
        f'title: "{args.title}"\n'
        f'date: "{args.date}"\n'
        'cover: ""\n'
        "photos:\n" + "\n".join(entries) + "\n"
        "---\n"
    )
    print(f"wrote {index}")


if __name__ == "__main__":
    main()
