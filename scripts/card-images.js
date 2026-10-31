// Small logo for the business card pages at /links/<slug>/. The full logo is
// 1309px wide but shows at 100px there. Headshots stay at full quality
// (Andrew's call, Oct 31, 2026), so the card pages use the Team page photos.
// The committed copy in src/images/team/card is the fallback if sharp can't load.
import fs from "node:fs";
import path from "node:path";

export async function buildCardImages(out) {
  const { default: sharp } = await import("sharp");
  const dir = path.join(out, "images/team/card");
  fs.mkdirSync(dir, { recursive: true });
  await sharp("src/images/logo.png").resize({ width: 200 }).webp({ quality: 90 }).toFile(path.join(dir, "logo.webp"));
  return 1;
}
