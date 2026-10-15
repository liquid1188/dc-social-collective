// Link-preview cards (the picture iMessage, Facebook, and group chats show
// when someone shares a DSC link). Built fresh on every deploy, so a night
// Chris adds in the editor gets its own card with no extra step.
//
// Site card: the DSC logo on navy.
// Committed copies in src/og are the fallback if the build can't load sharp.
//
// Event card: the night's flyer shown whole beside the logo. A wide cover is
// shown whole on navy instead. Never cropped, never a stock dance photo.
import fs from "node:fs";
import path from "node:path";

const W = 1200, H = 630, PAD = 36;
const NAVY = { r: 7, g: 26, b: 58, alpha: 1 };
const CORAL = "#f04e49";

const canvas = () => sharp({ create: { width: W, height: H, channels: 4, background: NAVY } });
const bar = (h) => Buffer.from(`<svg width="${W}" height="${h}"><rect width="${W}" height="${h}" fill="${CORAL}"/></svg>`);

async function logo(maxW, maxH) {
  return sharp("src/images/logo.png").resize({ width: maxW, height: maxH, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
}

async function siteCard(out) {
  const l = await logo(640, 390);
  await canvas()
    .composite([
      { input: l.data, left: Math.round((W - l.info.width) / 2), top: Math.round((H - l.info.height) / 2) },
      { input: bar(10), left: 0, top: H - 10 }
    ])
    .jpeg({ quality: 88, mozjpeg: true }).toFile(out);
}

async function eventCard(src, out) {
  const meta = await sharp(src).metadata();
  const portraitish = meta.height >= meta.width * 0.9;
  const layers = [];
  if (portraitish) {
    const f = await sharp(src).rotate().resize({ height: H - PAD * 2, width: 700, fit: "inside" }).toBuffer({ resolveWithObject: true });
    const fx = W - PAD - f.info.width;
    const l = await logo(fx - PAD * 3, 380);
    layers.push(
      { input: f.data, left: fx, top: Math.round((H - f.info.height) / 2) },
      { input: l.data, left: Math.round((fx - l.info.width) / 2), top: Math.round((H - l.info.height) / 2) }
    );
  } else {
    const f = await sharp(src).rotate().resize({ width: W - PAD * 2, height: H - PAD * 2, fit: "inside" }).toBuffer({ resolveWithObject: true });
    layers.push({ input: f.data, left: Math.round((W - f.info.width) / 2), top: Math.round((H - f.info.height) / 2) });
  }
  layers.push({ input: bar(10), left: 0, top: H - 10 });
  await canvas().composite(layers).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
}

let sharp;
export async function buildOgCards(outDir = "_site") {
  try { sharp = (await import("sharp")).default; }
  catch (e) { console.warn("[og] sharp unavailable, using committed cards:", e.message); return; }
  const dir = path.join(outDir, "og");
  fs.mkdirSync(dir, { recursive: true });
  await siteCard(path.join(dir, "site.jpg"));
  let n = 0;
  for (const file of fs.readdirSync("src/events").filter((f) => f.endsWith(".md"))) {
    const fm = (fs.readFileSync(path.join("src/events", file), "utf8").split(/^---\s*$/m)[1]) || "";
    const pick = (k) => { const m = new RegExp("^" + k + ":\\s*['\"]?([^'\"\\n]+)", "m").exec(fm); return m && m[1].trim(); };
    const img = pick("flyer") || pick("image");
    const src = img && path.join("src", img.replace(/^\//, ""));
    if (!src || !fs.existsSync(src)) continue;
    try { await eventCard(src, path.join(dir, file.replace(/\.md$/, ".jpg"))); n++; }
    catch (e) { console.warn("[og] skipped", file, e.message); }
  }
  console.log(`[og] site card + ${n} event cards`);
}
