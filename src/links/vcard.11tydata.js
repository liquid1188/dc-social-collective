// "Save contact" file for each card page, at /links/<slug>/contact.vcf.
export default {
  pagination: { data: "team", size: 1, alias: "m", before: (d) => d.filter((x) => x.slug) },
  permalink: (d) => `/links/${d.m.slug}/contact.vcf`,
  eleventyExcludeFromCollections: true,
};
