"""Copy every Squarespace-hosted album photo (2500px JPEG, the largest Squarespace serves)
into mirror/<album-folder>/<file>.jpg so it can be pushed to the R2 bucket."""
import re, sys, pathlib, concurrent.futures as cf, urllib.request
root = pathlib.Path(__file__).resolve().parents[1]
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / "mirror")
jobs = []
for md in sorted((root / "src/albums").glob("*/index.md")):
    for m in re.finditer(r'"(https://images\.squarespace-cdn\.com/[^"#]+)', md.read_text()):
        url = m.group(1); name = url.rsplit("/", 1)[1]
        dest = out / md.parent.name / name
        if not dest.exists(): jobs.append((url, dest))
print(len(jobs), "to fetch", flush=True)
def fetch(job):
    url, dest = job; dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"Accept": "image/jpeg", "User-Agent": "Mozilla/5.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r: dest.write_bytes(r.read()); return True
        except Exception as e: err = e
    print("FAILED", url, err, flush=True); return False
with cf.ThreadPoolExecutor(12) as ex:
    ok = sum(ex.map(fetch, jobs))
print("done", ok, "of", len(jobs), flush=True)
