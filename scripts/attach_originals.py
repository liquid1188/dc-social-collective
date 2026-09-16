"""Fetch the photographer's originals for an album from a Google Photos shared
album (or a local folder), match each one to the web copy already on the site by
image content, and put the matches into R2 under originals/<album>/<web name>.<ext>
so the per-photo download button hands over the full file. Photos that are not in
the album any more are skipped, never re-added.
Usage: attach_originals.py <album-folder> <google-photos-link | local dir> [more links]
"""
import os, re, sys, io, json, pathlib, subprocess, tempfile, mimetypes, concurrent.futures as cf
import urllib.request, boto3, imagehash
from PIL import Image
from botocore.config import Config
Image.MAX_IMAGE_PIXELS = None
root = pathlib.Path(__file__).resolve().parents[1]
album = sys.argv[1]; sources = sys.argv[2:]
adir = root / "src/albums" / album
web = [re.sub(r"#.*$", "", l.strip().strip('"- ')) for l in (adir / "index.md").read_text().split("photos:")[1].split("\n") if l.strip().startswith("-")]
web = [w for w in web if w and not w.startswith("http")]
print(album, len(web), "photos on the site", flush=True)
def phash(p):
    im = Image.open(p); im.draft("RGB", (512, 512)); im = im.convert("RGB")
    return imagehash.phash(im, hash_size=12), imagehash.dhash(im, hash_size=12)
webhash = {w: phash(adir / w) for w in web}
UA = {"User-Agent": "Mozilla/5.0"}
def gp_urls(link):
    html = urllib.request.urlopen(urllib.request.Request(link, headers=UA)).read().decode("utf-8", "ignore")
    return sorted(set(re.findall(r"https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+", html)))
work = pathlib.Path(tempfile.mkdtemp(prefix="orig-"))
files = []
for src in sources:
    if os.path.isdir(src):
        files += [p for p in pathlib.Path(src).rglob("*") if p.is_file()]
    else:
        urls = gp_urls(src); print(len(urls), "items in", src, flush=True)
        def fetch(u):
            req = urllib.request.Request(u + "=d", headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r:
                cd = r.headers.get("Content-Disposition", ""); m = re.search(r'filename="?([^";]+)', cd)
                name = m.group(1) if m else u.rsplit("/", 1)[1] + ".jpg"
                dest = work / name
                if dest.exists(): dest = work / (dest.stem + "-" + u[-6:] + dest.suffix)
                dest.write_bytes(r.read()); return dest
        with cf.ThreadPoolExecutor(6) as ex: files += list(ex.map(fetch, urls))
print(len(files), "originals downloaded", flush=True)
# match by content
matched = {}; unmatched = []
for f in files:
    if f.suffix.lower() in (".mp4", ".mov"): continue
    try: ph, dh = phash(f)
    except Exception: unmatched.append(f.name); continue
    best = min(web, key=lambda w: (webhash[w][0] - ph) + (webhash[w][1] - dh))
    d = (webhash[best][0] - ph) + (webhash[best][1] - dh)
    if d <= 12 and best not in matched: matched[best] = f
    else: unmatched.append(f.name)
print(len(matched), "matched,", len(unmatched), "not on the site (skipped)", flush=True)
s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"], region_name="auto", config=Config(max_pool_connections=16))
def put(item):
    w, f = item; key = "originals/" + album + "/" + pathlib.Path(w).stem + f.suffix.lower()
    s3.upload_file(str(f), "dsc-files", key, ExtraArgs={"ContentType": mimetypes.guess_type(f.name)[0] or "image/jpeg", "CacheControl": "public, max-age=31536000, immutable"})
    return key
with cf.ThreadPoolExecutor(8) as ex: keys = list(ex.map(put, matched.items()))
print("uploaded", len(keys), flush=True)
json.dump({"matched": {w: f.name for w, f in matched.items()}, "unmatched": unmatched}, open(f"/home/claude/orig-{album}.json", "w"), indent=1)
subprocess.run(["rm", "-rf", str(work)])
