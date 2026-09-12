// Cloudflare Pages Function: adds a mailing-list signup to Squarespace Contacts
// with marketing opt-in. Needs the SQSP_API_KEY environment variable (a
// Squarespace developer key with Contacts read/write permission).

const API = "https://api.squarespace.com/v1/contacts";
const UA = "dcsocialcollective.com signup";

function clean(v, max) {
  return String(v || "").trim().slice(0, max);
}

async function sq(env, method, path, body) {
  return fetch(API + path, {
    method,
    headers: {
      Authorization: "Bearer " + env.SQSP_API_KEY,
      "User-Agent": UA,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function onRequestPost({ request, env }) {
  const site = new URL(request.url).origin;
  const back = (ok) => Response.redirect(site + (ok ? "/thanks/" : "/#signup"), 303);

  if (!env.SQSP_API_KEY) return back(false);

  let data;
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) data = await request.json();
  else data = Object.fromEntries((await request.formData()).entries());

  // Honeypot: bots fill the hidden field, people don't.
  if (data._gotcha) return back(true);

  const email = clean(data.email, 254).toLowerCase();
  const firstName = clean(data.first, 60);
  const lastName = clean(data.last, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back(false);

  const payload = {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    primaryEmail: { email, acceptsMarketing: true },
  };

  try {
    const res = await sq(env, "POST", "", payload);
    if (res.status === 409) {
      // Already a contact: make sure they're opted in.
      const q = await sq(env, "POST", "/query", { filter: { email }, pageSize: 1 });
      const found = q.ok ? await q.json() : null;
      const id = found && found.contacts && found.contacts[0] && found.contacts[0].id;
      if (id) {
        await sq(env, "PATCH", "/" + id, {
          firstName: firstName || undefined,
          primaryEmail: { email, acceptsMarketing: true },
        });
      }
    } else if (!res.ok) {
      console.log("Squarespace error", res.status, await res.text());
      return back(false);
    }
  } catch (e) {
    console.log("Squarespace request failed", e);
    return back(false);
  }
  return back(true);
}
