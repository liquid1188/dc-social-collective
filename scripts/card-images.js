// Small images for the business card pages at /links/<slug>/.
// The team headshots are up to 900px and the logo 1309px, but the card page
// shows them at 148px and 84px. Built fresh on every deploy from team.json,
// so a new headshot uploaded in the editor flows through with no extra step.
// Committed copies in src/images/team/card are the fallback if sharp can't load.
import fs from "node:fs";
import path from "node:path";

export async function buildCardImages(out) {
  const { default: sharp } = await import("sharp");
  const team = JSON.parse(fs.readFileSync("src/_data/team.json", "utf8"));
  const dir = path.join(out, "images/team/card");
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const m of team) {
    if (!m.slug || !m.photo) continue;
    const src = path.join("src", m.photo);
    if (!fs.existsSync(src)) continue;
    // 320px covers the 148px circle on 2x phone screens.
    await sharp(src).rotate().resize(320, 320, { fit: "cover", position: "attention" }).webp({ quality: 80 }).toFile(path.join(dir, `${m.slug}.webp`));
    n++;
  }
  await sharp("src/images/logo.png").resize({ width: 200 }).webp({ quality: 90 }).toFile(path.join(dir, "logo.webp"));
  return n;
}
