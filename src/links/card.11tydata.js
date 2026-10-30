// One hidden page per team member with a slug, at /links/<slug>/.
// The slugs are printed in the business-card QR codes, so never change one.
export default {
  pagination: { data: "team", size: 1, alias: "m", before: (d) => d.filter((x) => x.slug) },
  permalink: (d) => `/links/${d.m.slug}/`,
  eleventyExcludeFromCollections: true,
};
