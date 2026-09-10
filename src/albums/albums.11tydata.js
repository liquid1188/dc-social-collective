// One folder per photo album: src/albums/<date-slug>/index.md, with any photos
// uploaded from the editor sitting in the same folder. The albums imported from
// Squarespace keep their CDN links instead, with the pixel size after a # so the
// page can hold the right amount of space for each photo while it loads.
const folderOf = (data) => data.page.filePathStem.split("/").at(-2);

const day = (v) => (v instanceof Date ? v.toISOString() : String(v || "")).slice(0, 10);

const photo = (value, folder) => {
  const [path, dims] = String(value).split("#");
  const [w, h] = (dims || "").split("x");
  const remote = /^https?:\/\//.test(path);
  const url = remote ? path : "/albums/" + folder + "/" + path.split("/").pop();
  return {
    thumb: remote ? url + "?format=1000w" : url,
    full: remote ? url + "?format=2500w" : url,
    name: url.split("/").pop(),
    remote,
    w,
    h
  };
};

export default {
  layout: "album.njk",
  tags: "album",
  eleventyComputed: {
    permalink: (data) => "/photos/" + folderOf(data) + "/",
    day: (data) => day(data.date),
    images: (data) => (data.photos || []).map((p) => photo(p, folderOf(data))),
    coverImage: (data) => {
      const source = data.cover || (data.photos || [])[0];
      return source ? photo(source, folderOf(data)).thumb : "";
    },
    description: (data) => "Photos from " + (data.title || "a DC Social Collective night") + ", a DC Social Collective night."
  }
};
