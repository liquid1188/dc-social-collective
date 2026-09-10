export default {
  layout: "event.njk",
  eleventyComputed: {
    // A draft has no page of its own and stays out of the listings and the feed
    // until the Draft switch is turned off in the editor.
    permalink: (data) => (data.draft ? false : "/events/" + data.page.inputPath.split("/").pop().replace(/\.md$/, "") + "/"),
    eleventyExcludeFromCollections: (data) => Boolean(data.draft)
  }
};
