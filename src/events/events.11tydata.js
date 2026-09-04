export default {
  layout: "event.njk",
  eleventyComputed: {
    permalink: (data) => "/events/" + data.page.inputPath.split("/").pop().replace(/\.md$/, "") + "/"
  }
};
