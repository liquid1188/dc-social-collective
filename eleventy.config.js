import { HtmlBasePlugin } from "@11ty/eleventy";
import markdownIt from "markdown-it";
const mdlib = markdownIt({ html: true, typographer: true });
export default function (eleventyConfig) {
  eleventyConfig.addFilter("md", (t) => mdlib.render(t || ""));
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ "src/css": "css", "src/admin": "admin", "src/images": "images", "src/video": "video", "src/_redirects": "_redirects" });
  // Photos uploaded to an album folder ship next to the album page.
  eleventyConfig.addPassthroughCopy("src/albums/**/*.{jpg,jpeg,png,webp,gif,avif}");
  // "Add to calendar" hands the night straight to Google Calendar, already
  // filled in, rather than downloading a file nobody knows what to do with.
  const clock = (time) => {
    const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(time || "");
    if (!m) return null;
    return { h: (parseInt(m[1], 10) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0), mi: m[2] ? parseInt(m[2], 10) : 0 };
  };
  const stamp = (isoDay, c, addDays) => {
    const day = new Date(isoDay + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() + addDays);
    return day.toISOString().slice(0, 10).replace(/-/g, "") + "T" + String(c.h).padStart(2, "0") + String(c.mi).padStart(2, "0") + "00";
  };
  eleventyConfig.addFilter("gcalUrl", (e) => {
    const start = clock(e.time) || { h: 19, mi: 0 };
    let end = clock(e.end);
    let nextDay = 0;
    if (!end) {
      // No end time on the night, so hold three hours.
      nextDay = start.h + 3 >= 24 ? 1 : 0;
      end = { h: (start.h + 3) % 24, mi: start.mi };
    } else if (end.h < start.h || (end.h === start.h && end.mi <= start.mi)) {
      nextDay = 1;
    }
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: e.title || "",
      dates: stamp(e.date, start, 0) + "/" + stamp(e.date, end, nextDay),
      ctz: "America/New_York",
      location: [e.venue, e.address].filter(Boolean).join(", "),
      details: e.url || ""
    });
    // Google reads the date range with a literal slash between the two stamps.
    return "https://calendar.google.com/calendar/render?" + params.toString().replace("%2F", "/");
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
  eleventyConfig.addFilter("rfc822", (x) => new Date(typeof x === "string" ? x + "T12:00:00Z" : x).toUTCString());
  eleventyConfig.addFilter("eventBlurb", (data) => [data.venue, data.address].filter(Boolean).join(", ") + (data.time ? ", " + data.time : "") + ".");
  eleventyConfig.addGlobalData("today", () => new Date().toISOString().slice(0, 10));
  // RSVPify serves the form on its own, without the event microsite, when the
  // page is asked for with embed=1. That is what goes in the frame on our page.
  eleventyConfig.addFilter("embedUrl", (url) => {
    if (!url) return "";
    return url + (url.includes("?") ? "&" : (url.endsWith("/") ? "?" : "/?")) + "embed=1";
  });
  eleventyConfig.addFilter("publications", (items) => [...new Set((items || []).map((i) => (i.publication || "").trim()).filter(Boolean))]);
  eleventyConfig.addFilter("photoCount", (albums) => (albums || []).reduce((n, a) => n + ((a.data.photos || []).length), 0).toLocaleString("en-US"));
  eleventyConfig.addGlobalData("buildId", () => Date.now().toString(36));
  const iso = (e) => e.date.toISOString().slice(0, 10);
  eleventyConfig.addCollection("upcoming", (api) => api.getFilteredByTag("event").filter((e) => iso(e) >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date - b.date));
  eleventyConfig.addCollection("past", (api) => api.getFilteredByTag("event").filter((e) => iso(e) < new Date().toISOString().slice(0, 10)).sort((a, b) => b.date - a.date));
  eleventyConfig.addCollection("feed", (api) => api.getFilteredByTag("event").sort((a, b) => b.date - a.date).slice(0, 40));
  // The four recurring nights on the homepage link to whichever album is the
  // most recent for that night, so they never need updating by hand.
  eleventyConfig.addFilter("latestAlbum", (albums, keywords) => {
    const words = String(keywords || "").split("|").map((w) => w.trim().toLowerCase()).filter(Boolean);
    return (albums || []).find((album) => {
      const title = String(album.data.title || "").toLowerCase();
      return words.some((word) => title.includes(word));
    }) || null;
  });

  eleventyConfig.addCollection("albums", (api) => api.getFilteredByTag("album").sort((a, b) => b.date - a.date));
  eleventyConfig.addFilter("iso", iso);
  return { dir: { input: "src", includes: "_includes", output: "_site" } };
}
