// One folder per photo album: src/albums/<date-slug>/index.md, with any photos
// uploaded from the editor sitting in the same folder. The albums imported from
// Squarespace keep their CDN links instead, with the pixel size after a # so the
// page can hold the right amount of space for each photo while it loads.
const folderOf = (data) => data.page.filePathStem.split("/").at(-2);

const day = (v) => (v instanceof Date ? v.toISOString() : String(v || "")).slice(0, 10);

import { existsSync } from "node:fs";

// The mirror originally wrote the Squarespace albums into R2 under the filename
// exactly as it appeared in the CDN URL, still percent encoded. On Sept 19, 2026
// every such object was copied to a clean key, so "Crooner+%281%29.jpg" now lives
// at "Crooner-1.jpg". The rule is the same one safeName uses for thumbs, with the
// original extension kept, so the two always agree.
const r2Name = (name) =>
  (decodeURIComponent(name.replace(/\+/g, " ")).replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "photo") +
  (name.match(/\.[^.]*$/) || [""])[0].toLowerCase();

// Thumb basename for a mirrored photo. scripts/build_mirror_thumbs.py applies
// the same rule when it writes them, so the two always agree. Keep them in step.
const safeName = (name) =>
  (decodeURIComponent(name.replace(/\+/g, " ")).replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "photo") + ".webp";

const photo = (value, folder, filesBase) => {
  const [path, dims] = String(value).split("#");
  const [w, h] = (dims || "").split("x");
  const remote = /^https?:\/\//.test(path);
  const name = path.split("/").pop();
  const url = remote ? path : "/albums/" + folder + "/" + name;
  // A grid tile is about 370px wide, so serve a thumb there when one exists and
  // keep the full file for the click through and the download.
  const thumbPath = "src/albums/" + folder + "/thumbs/" + name;
  const localThumb = !remote && existsSync(thumbPath) ? "/albums/" + folder + "/thumbs/" + name : null;
  // Mirrored albums read their thumb from our bucket too, so no part of the page
  // depends on Squarespace still being up.
  const remoteThumb = filesBase
    ? filesBase + "/albums/" + folder + "/thumbs/" + safeName(name)
    : url + "?format=1000w";
  return {
    thumb: remote ? remoteThumb : (localThumb || url),
    // With a files host set (the R2 bucket), the click through and the download
    // use our own copy instead of Squarespace, so nothing breaks when it is cancelled.
    full: filesBase && remote ? filesBase + "/albums/" + folder + "/" + r2Name(name) : (remote ? url + "?format=2500w" : url),
    // The download button on a photo uploaded through the editor goes through
    // /api/original/, which hands over the full-size original when one exists.
    download: remote ? (filesBase ? filesBase + "/albums/" + folder + "/" + r2Name(name) : url + "?format=2500w") : "/api/original/" + folder + "/" + name,
    // Squarespace wrote spaces as "+", so undo that for the saved filename.
    name: remote ? decodeURIComponent(name.replace(/\+/g, " ")) : name,
    remote,
    w,
    h
  };
};

export default {
  layout: "album.njk",
  tags: "album",
  eleventyComputed: {
    // A draft album has no page and stays off the Photos page until Draft is turned off.
    permalink: (data) => (data.draft ? false : "/photos/" + folderOf(data) + "/"),
    eleventyExcludeFromCollections: (data) => Boolean(data.draft),
    day: (data) => day(data.date),
    images: (data) => (data.photos || []).map((p) => photo(p, folderOf(data), (data.site && data.site.filesBase) || "")),
    coverImage: (data) => {
      const source = data.cover || (data.photos || [])[0];
      return source ? photo(source, folderOf(data), (data.site && data.site.filesBase) || "").thumb : "";
    },
    description: (data) => "Photos from " + (data.title || "a DC Social Collective night") + ", a DC Social Collective night."
  }
};
