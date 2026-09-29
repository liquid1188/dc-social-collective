import fs from "node:fs";
import path from "node:path";

// Width and height of a cover image, read from the file itself (PNG, JPEG,
// WebP) so a tall flyer gets a tall card and a wide banner a wide one.
function imageSize(src) {
  try {
    const b = fs.readFileSync(path.join("src", String(src || "").replace(/^\//, "")));
    if (b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (kind === "VP8L") { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
      if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (e) { /* missing or unreadable: fall back to the wide shape */ }
  return { w: 1500, h: 750 };
}

const day = (v) => (v instanceof Date ? v.toISOString() : String(v || "")).slice(0, 10);

export default {
  layout: "event.njk",
  eleventyComputed: {
    // A cover taller than it is wide is shown whole in a taller card.
    imageW: (data) => imageSize(data.image).w,
    imageH: (data) => imageSize(data.image).h,
    imagePortrait: (data) => { const s = imageSize(data.image); return s.h > s.w; },
    // The early bird line shows itself out. The site rebuilds every morning,
    // so the day after this date the line is simply gone.
    earlyBirdDay: (data) => day(data.earlyBird),
    // A draft has no page of its own and stays out of the listings and the feed
    // until the Draft switch is turned off in the editor.
    permalink: (data) => (data.draft ? false : "/events/" + data.page.inputPath.split("/").pop().replace(/\.md$/, "") + "/"),
    eleventyExcludeFromCollections: (data) => Boolean(data.draft)
  }
};
