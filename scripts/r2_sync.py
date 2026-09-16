"""Upload a local folder tree into the dsc-files R2 bucket under a prefix.
Usage: r2_sync.py <local-dir> <prefix>   (needs AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_ENDPOINT)
Skips objects that already exist with the same size."""
import os, sys, pathlib, mimetypes, concurrent.futures as cf, boto3
from botocore.config import Config
src = pathlib.Path(sys.argv[1]); prefix = sys.argv[2].strip("/")
s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"], region_name="auto", config=Config(max_pool_connections=32, retries={"max_attempts": 5}))
existing = {}
for page in s3.get_paginator("list_objects_v2").paginate(Bucket="dsc-files", Prefix=prefix + "/"):
    for o in page.get("Contents", []): existing[o["Key"]] = o["Size"]
files = [f for f in src.rglob("*") if f.is_file()]
todo = [f for f in files if existing.get(prefix + "/" + f.relative_to(src).as_posix()) != f.stat().st_size]
print(len(files), "files,", len(todo), "to upload", flush=True)
def put(f):
    key = prefix + "/" + f.relative_to(src).as_posix()
    ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    s3.upload_file(str(f), "dsc-files", key, ExtraArgs={"ContentType": ctype, "CacheControl": "public, max-age=31536000, immutable"})
    return key
with cf.ThreadPoolExecutor(16) as ex:
    for i, k in enumerate(ex.map(put, todo), 1):
        if i % 500 == 0: print(i, flush=True)
print("done", flush=True)
