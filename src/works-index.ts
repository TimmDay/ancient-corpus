// The small list of Works the site publishes as /works.json, and how /cite
// matches an author and title someone typed against it.

export type WorkListing = {
  slug: string
  author: string
  title: string
  otherTitles: string[]
  editions: string[]
  preferredEdition: string
}

/** Case, accents, punctuation and a leading "The" don't distinguish names. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
}

export function matchWork(
  works: WorkListing[],
  author: string,
  title: string,
): WorkListing | undefined {
  const wantedAuthor = normalizeName(author)
  const wantedTitle = normalizeName(title)
  const authorMatches = (w: WorkListing) =>
    !wantedAuthor ||
    [w.author, w.slug.split("/")[0] ?? ""]
      .map(normalizeName)
      .includes(wantedAuthor) ||
    (wantedAuthor === "anonymous" && w.author === "Unknown")
  const titleMatches = (w: WorkListing) =>
    [w.title, ...w.otherTitles, (w.slug.split("/")[1] ?? "").replace(/-/g, " ")]
      .map(normalizeName)
      .includes(wantedTitle)

  const candidates = works.filter(
    (w) => authorMatches(w) && (!wantedTitle || titleMatches(w)),
  )
  // An author alone is only enough when they wrote one Work here.
  return candidates.length === 1 || (wantedTitle && candidates.length)
    ? candidates[0]
    : undefined
}
