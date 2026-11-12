// Cloudflare Pages Function: download button for the older (mirrored) albums.
//   GET /api/photo/<album-folder>/<file>
// Those photos live in the R2 bucket under albums/<album-folder>/. Serving them
// from the site's own address (instead of files.dcsocialcollective.com) lets the
// browser save the file directly and lets the page hand it to the iPhone share
// sheet, which a cross-site link cannot do.

const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic" };

export async function onRequestGet({ env, params }) {
  const parts = (params.path || []).map(decodeURIComponent);
  if (parts.length !== 2 || parts.some((p) => !p || p.includes(".."))) return new Response("Not found", { status: 404 });
  const [folder, file] = parts;
  if (!env.FILES) return new Response("Not available", { status: 503 });
  const obj = await env.FILES.get("albums/" + folder + "/" + file);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const ext = (file.split(".").pop() || "").toLowerCase();
  if (!headers.get("content-type") && TYPES[ext]) headers.set("content-type", TYPES[ext]);
  headers.set("etag", obj.httpEtag);
  headers.set("Content-Disposition", 'attachment; filename="' + file.replace(/"/g, "") + '"');
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}
