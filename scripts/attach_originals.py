"""Fetch the photographer's originals for an album from a Google Photos shared
album (or a local folder), match each one to the web copy already on the site by
image content, and put the matches into R2 under originals/<album>/<web name>.<ext>
so the per-photo download button hands over the full file. Photos that are not in
the album any more are skipped, never re-added.
Usage: attach_originals.py <album-folder> <google-photos-link | local dir> [more links]
"""
import os, re, sys, io, json, pathlib, subprocess, tempfile, mimetypes, signal, concurrent.futures as cf
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
    """Every photo in a Google Photos shared album. The page itself only carries the
    first 300; the rest come from Google's paging call, which we follow to the end.
    (Nov 2026: reading only the page left 141 of 442 August photos off the site.)"""
    import urllib.parse
    def fetch(url, data=None):
        cmd = ["curl", "-sSL", "-A", "Mozilla/5.0"]
        if data: cmd += ["-H", "Content-Type: application/x-www-form-urlencoded;charset=UTF-8", "--data", data]
        return subprocess.run(cmd + [url], capture_output=True, text=True).stdout
    s = fetch(link)
    i = s.find("key: 'ds:1'"); i = s.find("data:", i) + 5; j = s.find(", sideChannel", i); d = json.loads(s[i:j])
    aid = d[3][0]; key = re.search(r"key=([A-Za-z0-9_-]+)", s).group(1)
    urls = [it[1][0] for it in d[1]]; tok = d[2]
    while tok:
        req = json.dumps([[["snAcKc", json.dumps([aid, tok, None, key]), None, "generic"]]])
        t = fetch("https://photos.google.com/_/PhotosUi/data/batchexecute?rpcids=snAcKc&rt=c", urllib.parse.urlencode({"f.req": req}))
        for line in t.split("\n"):
            if '"snAcKc"' in line:
                inner = json.loads(json.loads(line)[0][2]); urls += [it[1][0] for it in inner[1]]; tok = inner[2]; break
        else:
            raise SystemExit("Could not read every page of " + link + "; refusing to build a partial album.")
    return list(dict.fromkeys(urls))
work = pathlib.Path(os.environ.get("ORIG_DIR", "/home/claude/orig")) / album; work.mkdir(parents=True, exist_ok=True)
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
                dest = work / (pathlib.Path(name).stem + "-" + u[-8:] + pathlib.Path(name).suffix)
                if dest.exists() and dest.stat().st_size > 0: return dest
                tmp = dest.with_suffix(dest.suffix + ".part"); tmp.write_bytes(r.read()); tmp.rename(dest); return dest
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

