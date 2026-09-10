const day = (v) => (v instanceof Date ? v.toISOString() : String(v || "")).slice(0, 10);

export default {
  layout: "event.njk",
  eleventyComputed: {
    // The early bird line shows itself out. The site rebuilds every morning,
    // so the day after this date the line is simply gone.
    earlyBirdDay: (data) => day(data.earlyBird),
    // A draft has no page of its own and stays out of the listings and the feed
    // until the Draft switch is turned off in the editor.
    permalink: (data) => (data.draft ? false : "/events/" + data.page.inputPath.split("/").pop().replace(/\.md$/, "") + "/"),
    eleventyExcludeFromCollections: (data) => Boolean(data.draft)
  }
};
