// Cloudflare Pages Function: the download button on every album photo points here.
//   GET /api/original/<album-folder>/<photo>.webp
// It finds the full-size original for that photo in the bucket (same name, any
// extension, under originals/<album-folder>/) and streams it as a download. If
// no original was uploaded for that photo, the web copy on the site is sent
// instead, so the button always works.

export async function onRequestGet({ request, env, params }) {
  const parts = (params.path || []).map(decodeURIComponent);
  if (parts.length !== 2 || parts.some((p) => !p || p.includes(".."))) return new Response("Not found", { status: 404 });
  const [folder, photo] = parts;
  const base = photo.replace(/\.[^.]+$/, "");
  const fallback = () => Response.redirect(new URL("/albums/" + folder + "/" + photo, request.url).href, 302);
  if (!env.FILES) return fallback();

  const list = await env.FILES.list({ prefix: "originals/" + folder + "/" + base + ".", limit: 10 });
  const hit = list.objects.find((o) => o.key.replace(/\.[^.]+$/, "") === "originals/" + folder + "/" + base) || list.objects[0];
  if (!hit) return fallback();

  const obj = await env.FILES.get(hit.key);
  if (!obj) return fallback();
  const name = hit.key.split("/").pop();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Content-Disposition", 'attachment; filename="' + name.replace(/"/g, "") + '"');
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}
