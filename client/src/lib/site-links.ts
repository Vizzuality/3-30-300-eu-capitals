/*
 * The addresses outside the site that it links to: who made it, and where
 * its code is published. The links to the code (in the footer and on the
 * About page) show only once it has a public address.
 */
export const siteLinks: { vizzuality: string; code?: string } = {
  vizzuality: "https://www.vizzuality.com",
}

/*
 * A link that leaves the site opens in the same tab, like every other link,
 * and says it leads to another site
 */
export const externalRel = "external"

/** The two papers the site builds on, by their DOI */
export const papers = {
  konijnendijk: "https://doi.org/10.1007/s11676-022-01523-z",
  bertassello: "https://doi.org/10.1038/s41467-026-71523-8",
} as const
