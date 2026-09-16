// Cloudflare Pages Function: puts files into the dsc-files bucket (bound as FILES)
// for the Upload a night page at /admin/upload/. Callers must send the same GitHub
// token they sign in to the editor with; it is checked once against the repository
// and remembered for an hour, so a night of 150 photos costs one GitHub call.
//
//   PUT  /api/files?key=originals/<album>/<file>             body = the file
//   POST /api/files?key=...&action=create                    -> { uploadId }
//   PUT  /api/files?key=...&action=part&uploadId=..&part=N   body = one part (>= 5 MB)
//   POST /api/files?key=...&action=complete&uploadId=..      body = { parts: [{partNumber, etag}] }
//   GET  /api/files?prefix=originals/<album>/                -> { keys: [...] }

const REPO = "liquid1188/dc-social-collective";
const ALLOWED = /^(originals|video|albums)\/[A-Za-z0-9._\-\/ ()]+$/;
const okTokens = new Map();

async function allowed(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const hit = okTokens.get(token);
  if (hit && hit > Date.now()) return true;
  const r = await fetch("https://api.github.com/repos/" + REPO, {
    headers: { Authorization: "Bearer " + token, "User-Agent": "dcsocialcollective-upload", Accept: "application/vnd.github+json" },
  });
  if (!r.ok) return false;
  const repo = await r.json();
  if (!(repo.permissions && repo.permissions.push)) return false;
  okTokens.set(token, Date.now() + 60 * 60 * 1000);
  return true;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequest({ request, env }) {
  if (!env.FILES) return json({ error: "Storage is not connected" }, 500);
  if (!(await allowed(request))) return json({ error: "Not signed in to the editor" }, 401);

  const url = new URL(request.url);
  const key = (url.searchParams.get("key") || "").replace(/^\/+/, "");
  const action = url.searchParams.get("action") || "";

  if (request.method === "GET") {
    const prefix = (url.searchParams.get("prefix") || "").replace(/^\/+/, "");
    if (!ALLOWED.test(prefix + "x")) return json({ error: "Bad prefix" }, 400);
    const keys = [];
    let cursor;
    do {
      const page = await env.FILES.list({ prefix, cursor, limit: 1000 });
      for (const o of page.objects) keys.push({ key: o.key, size: o.size });
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return json({ keys });
  }

  if (!ALLOWED.test(key) || key.includes("..")) return json({ error: "Bad file name" }, 400);
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const meta = { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } };

  if (request.method === "PUT" && !action) {
    await env.FILES.put(key, request.body, meta);
    return json({ ok: true, key });
  }
  if (request.method === "POST" && action === "create") {
    const up = await env.FILES.createMultipartUpload(key, meta);
    return json({ uploadId: up.uploadId, key });
  }
  const uploadId = url.searchParams.get("uploadId");
  if (request.method === "PUT" && action === "part" && uploadId) {
    const part = Number(url.searchParams.get("part") || 0);
    if (!part) return json({ error: "Missing part number" }, 400);
    const up = env.FILES.resumeMultipartUpload(key, uploadId);
    const done = await up.uploadPart(part, request.body);
    return json({ partNumber: done.partNumber, etag: done.etag });
  }
  if (request.method === "POST" && action === "complete" && uploadId) {
    const { parts } = await request.json();
    const up = env.FILES.resumeMultipartUpload(key, uploadId);
    await up.complete(parts);
    return json({ ok: true, key });
  }
  if (request.method === "POST" && action === "abort" && uploadId) {
    await env.FILES.resumeMultipartUpload(key, uploadId).abort();
    return json({ ok: true });
  }
  return json({ error: "Unknown request" }, 400);
}
