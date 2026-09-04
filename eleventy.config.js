import { HtmlBasePlugin } from "@11ty/eleventy";
export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ "src/css": "css", "src/admin": "admin", "src/images": "images" });
  const opts = { timeZone: "UTC" };
  const d = (iso) => new Date(iso + "T12:00:00Z");
  eleventyConfig.addFilter("longDate", (iso) => d(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", ...opts }));
  eleventyConfig.addFilter("shortDate", (iso) => d(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...opts }));
  eleventyConfig.addFilter("monthDay", (iso) => d(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", ...opts }));
  eleventyConfig.addFilter("year", (iso) => iso.slice(0, 4));
  eleventyConfig.addFilter("weekday", (iso) => d(iso).toLocaleDateString("en-US", { weekday: "long", ...opts }));
  eleventyConfig.addFilter("isoDate", (x) => new Date(x).toISOString());
  eleventyConfig.addGlobalData("today", () => new Date().toISOString().slice(0, 10));
  eleventyConfig.addGlobalData("buildId", () => Date.now().toString(36));
  const iso = (e) => e.date.toISOString().slice(0, 10);
  eleventyConfig.addCollection("upcoming", (api) => api.getFilteredByTag("event").filter((e) => iso(e) >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date - b.date));
  eleventyConfig.addCollection("past", (api) => api.getFilteredByTag("event").filter((e) => iso(e) < new Date().toISOString().slice(0, 10)).sort((a, b) => b.date - a.date));
  eleventyConfig.addFilter("iso", iso);
  return { dir: { input: "src", includes: "_includes", output: "_site" } };
}
