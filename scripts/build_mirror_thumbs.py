#!/usr/bin/env python3
"""Build grid thumbnails for the albums mirrored from Squarespace.

Those albums have no thumb tier, so the grid still loads images from
images.squarespace-cdn.com. This reads each photo from our own R2 bucket,
makes a 1000px WebP, and writes it back to R2 under

    albums/<album-folder>/thumbs/<safe-name>.webp

Two naming details matter.

1. The mirror wrote objects to R2 using the filename exactly as it appeared in
   the Squarespace URL, still percent-encoded. So the real key for
   "DSC00019(1).jpg" is the literal text "DSC00019%281%29.jpg". To fetch it over
   HTTP the percent has to be escaped again (%25), which is what r2_get does.
   Over the S3 API the key is passed raw, with no escaping at all.

2. Thumb keys are sanitized down to plain ASCII so this problem cannot repeat.
   safe_name() is the single source of truth and albums.11tydata.js applies the
   same rule, so the two always agree.

Usage:
    R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
    python3 scripts/build_mirror_thumbs.py [--width 1000] [--quality 88]
                                           [--album 2025-11-08-the-grape-gatsby]
                                           [--dry-run] [--workers 8]
"""

import argparse
import io
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
except ImportError:
    sys.exit("pip install boto3 pillow")

try:
    from PIL import Image
except ImportError:
    sys.exit("pip install boto3 pillow")

REPO = Path(__file__).resolve().parent.parent
ALBUMS = REPO / "src" / "albums"
BUCKET = os.environ.get("R2_BUCKET", "dsc-files")
FILES_HOST = os.environ.get("FILES_HOST", "https://files.dcsocialcollective.com")


def safe_name(raw):
    """Stored filename to thumb basename. Must match albums.11tydata.js."""
    name = urllib.parse.unquote(raw.replace("+", " "))
    name = name.rsplit(".", 1)[0]
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-")
    return (name or "photo") + ".webp"


def r2_get(folder, raw_name):
    """Fetch the mirrored original over the public files host."""
    url = "%s/albums/%s/%s" % (FILES_HOST, folder, raw_name.replace("%", "%25"))
    req = urllib.request.Request(url, headers={"User-Agent": "dsc-thumbs/1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def remote_photos(index_md):
    """Yield (raw_filename,) for every http(s) photo listed in an album."""
    out = []
    for line in index_md.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith("- \""):
            continue
        value = line[3:].rstrip("\"")
        path = value.split("#", 1)[0]
        if not path.startswith("http"):
            continue
        out.append(path.split("/")[-1])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=1000)
    ap.add_argument("--quality", type=int, default=88)
    ap.add_argument("--album", action="append", default=None)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="rebuild thumbs that already exist")
    args = ap.parse_args()

    folders = sorted(p.name for p in ALBUMS.iterdir() if (p / "index.md").exists())
    if args.album:
        folders = [f for f in folders if f in set(args.album)]

    jobs = []
    for folder in folders:
        for raw in remote_photos(ALBUMS / folder / "index.md"):
            jobs.append((folder, raw, "albums/%s/thumbs/%s" % (folder, safe_name(raw))))

    print("%d albums, %d mirrored photos" % (len({j[0] for j in jobs}), len(jobs)))
    if args.dry_run:
        for folder, raw, key in jobs[:10]:
            print("  %s\n    -> %s" % (raw, key))
        print("  ... (%d more)" % max(0, len(jobs) - 10))
        return

    s3 = boto3.client(
        "s3",
        endpoint_url="https://%s.r2.cloudflarestorage.com" % os.environ["R2_ACCOUNT_ID"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4", retries={"max_attempts": 5}),
        region_name="auto",
    )

    existing = set()
    if not args.force:
        paginator = s3.get_paginator("list_objects_v2")
        for folder in {j[0] for j in jobs}:
            for page in paginator.paginate(Bucket=BUCKET, Prefix="albums/%s/thumbs/" % folder):
                for obj in page.get("Contents", []):
                    existing.add(obj["Key"])
        print("%d thumbs already in the bucket" % len(existing))

    todo = [j for j in jobs if j[2] not in existing]
    print("%d to build" % len(todo))
    done = {"ok": 0, "fail": 0}

    def one(job):
        folder, raw, key = job
        data = r2_get(folder, raw)
        im = Image.open(io.BytesIO(data))
        im = im.convert("RGB")
        if im.width > args.width:
            im = im.resize((args.width, round(im.height * args.width / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=args.quality, method=5)
        buf.seek(0)
        s3.put_object(
            Bucket=BUCKET,
            Key=key,
            Body=buf.getvalue(),
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
        )
        return key, len(buf.getvalue())

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(one, j): j for j in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            folder, raw, key = futures[fut]
            try:
                _, size = fut.result()
                done["ok"] += 1
                if i % 100 == 0 or i == len(todo):
                    print("  %d/%d  last %s (%.0f KB)" % (i, len(todo), key, size / 1024))
            except Exception as exc:
                done["fail"] += 1
                print("  FAIL %s/%s  %s" % (folder, raw, exc), file=sys.stderr)

    print("built %d, failed %d" % (done["ok"], done["fail"]))
    if done["fail"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
