import { HtmlBasePlugin } from "@11ty/eleventy";
export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ "src/css": "css", "src/admin": "admin", "src/images": "images", "src/video": "video" });
  eleventyConfig.addFilter("icsDate", (iso, time) => {
    const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(time || "");
    let h = m ? parseInt(m[1], 10) % 12 + (m[3].toLowerCase() === "pm" ? 12 : 0) : 19; const mi = m && m[2] ? m[2] : "00";
    return iso.replace(/-/g, "") + "T" + String(h).padStart(2, "0") + mi + "00";
  });
  eleventyConfig.addFilter("mapUrl", (venue, addr) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([venue, addr].filter(Boolean).join(", ")));
  const opts = { timeZone: "UTC" };
  const d = (iso) => new Date(iso + "T12:00:00Z");
  eleventyConfig.addFilter("longDate", (iso) => d(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", ...opts }));
  eleventyConfig.addFilter("fullDate", (iso) => d(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", ...opts }));
  eleventyConfig.addFilter("shortDate", (iso) => d(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...opts }));
  eleventyConfig.addFilter("monthDay", (iso) => d(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", ...opts }));
  eleventyConfig.addFilter("year", (iso) => iso.slice(0, 4));
  eleventyConfig.addFilter("weekday", (iso) => d(iso).toLocaleDateString("en-US", { weekday: "long", ...opts }));
  eleventyConfig.addFilter("isoDate", (x) => new Date(x).toISOString());
  eleventyConfig.addGlobalData("today", () => new Date().toISOString().slice(0, 10));
  eleventyConfig.addGlobalData("totalPhotos", async () => { const fs = await import("node:fs"); const a = JSON.parse(fs.readFileSync("src/_data/albums.json", "utf8")); return a.reduce((n, x) => n + x.count, 0).toLocaleString("en-US"); });
  eleventyConfig.addGlobalData("buildId", () => Date.now().toString(36));
  const iso = (e) => e.date.toISOString().slice(0, 10);
  eleventyConfig.addCollection("upcoming", (api) => api.getFilteredByTag("event").filter((e) => iso(e) >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date - b.date));
  eleventyConfig.addCollection("past", (api) => api.getFilteredByTag("event").filter((e) => iso(e) < new Date().toISOString().slice(0, 10)).sort((a, b) => b.date - a.date));
  eleventyConfig.addFilter("iso", iso);
  return { dir: { input: "src", includes: "_includes", output: "_site" } };
}
