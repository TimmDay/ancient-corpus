// HTML for every page the site serves. Pure functions of the corpus files.

import type { Edition, EditionText, Heading, Passage, Work } from "../corpus.ts"
import { escapeHtml } from "../importers/gutenberg.ts"
import { aliasKey, locatorId, type LocatorIndex } from "../locator.ts"

export const SITE_NAME = "Ancient Corpus"

const LANGUAGES: Record<string, string> = {
  la: "Latin",
  grc: "Greek",
  en: "English",
  cy: "Welsh",
  xpr: "Parthian",
}

export function languageName(code: string | null | undefined): string {
  return (code && LANGUAGES[code]) ?? code ?? ""
}

export function workUrl(work: Work, edition?: Edition): string {
  return edition && !edition.preferred
    ? `/${work.slug}/${edition.slug}/`
    : `/${work.slug}/`
}

type LayoutOptions = {
  title: string
  description: string
  canonical: string
  body: string
  scripts?: string[]
  head?: string
}

function layout({
  title,
  description,
  canonical,
  body,
  scripts = [],
  head = "",
}: LayoutOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${attr(canonical)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<link rel="stylesheet" href="/assets/site.css">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
${head}
${scripts.map((src) => `<script src="${attr(src)}" defer></script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><a class="brand" href="/">${SITE_NAME}</a></header>
${body}
<div class="toast" role="status" aria-live="polite" id="toast"></div>
</body>
</html>
`
}

/** The reader page for one Edition of a Work. */
export function workPage(
  work: Work,
  edition: Edition,
  text: EditionText,
  editions: Edition[],
): string {
  const index = locatorIndex(work, text)
  const otherTitles = work.otherTitles.length
    ? `<p class="other-titles">Also known as ${work.otherTitles.map((t) => `<i>${escapeHtml(t)}</i>`).join(", ")}</p>`
    : ""
  const switcher =
    editions.length > 1
      ? `<nav class="editions" aria-label="Editions"><ul>${editions
          .map(
            (e) =>
              `<li><a href="${workUrl(work, e)}" data-keep-hash${e.slug === edition.slug ? ' aria-current="page"' : ""}>${escapeHtml(editionLine(e))}</a></li>`,
          )
          .join("")}</ul></nav>`
      : ""

  const body = `
<div class="reader">
<nav class="toc" aria-label="Contents">
<details class="toc-panel" open>
<summary>Contents</summary>
${tableOfContents(text)}
</details>
</nav>
<main id="main" tabindex="-1">
<header class="work-header">
<p class="author">${escapeHtml(work.author === "Unknown" ? "Anonymous" : work.author)}</p>
<h1>${escapeHtml(work.title)}</h1>
${otherTitles}
<p class="edition-line">${escapeHtml(editionLine(edition))}. ${escapeHtml(languageName(edition.language))}.</p>
${switcher}
</header>
<div class="notice" id="notice" role="status" hidden></div>
<article class="text" lang="${attr(edition.language)}" aria-label="Text">
${text.passages.map(passageHtml).join("\n")}
</article>
${editorialHtml(text)}
<footer class="attribution">
<p>Text from <a href="${attr(edition.source.url)}">${escapeHtml(edition.source.name)}</a>. ${escapeHtml(edition.source.rights)}</p>
<p>Link to any passage by adding its Locator: <code>${escapeHtml(workUrl(work))}#${escapeHtml(text.passages[0]?.locator ?? "")}</code></p>
</footer>
</main>
</div>
<script type="application/json" id="locator-index">${jsonForScript(index)}</script>`

  return layout({
    title: `${work.title}, ${work.author === "Unknown" ? "Anonymous" : work.author}`,
    description: `${work.author}, ${work.title}: ${editionLine(edition)}`,
    canonical: workUrl(work, edition),
    body,
    scripts: ["/assets/reader.js"],
  })
}

/** "Eutropius, edited for school use, ed. J. C. Hazzard (1898)" */
export function editionLine(edition: Edition): string {
  const people = [
    edition.translator && `tr. ${edition.translator}`,
    edition.editor && `ed. ${edition.editor}`,
  ].filter(Boolean)
  const year = edition.publicationYear ? ` (${edition.publicationYear})` : ""
  return `${edition.title}${people.length ? `, ${people.join(", ")}` : ""}${year}`
}

export function locatorIndex(work: Work, text: EditionText): LocatorIndex {
  const divisions = new Map(text.divisions.map((d) => [d.locator, d]))
  const seen = new Set<string>()
  const targets = text.passages.flatMap((p) => {
    const division = !seen.has(p.division) && divisions.get(p.division)
    seen.add(p.division)
    const passage = { locator: p.locator, id: locatorId(p.locator) }
    return division
      ? [
          { locator: division.locator, id: locatorId(division.locator) },
          passage,
        ]
      : [passage]
  })
  const aliases = Object.fromEntries(
    Object.entries(work.locatorAliases).map(([from, to]) => [
      aliasKey(from),
      to,
    ]),
  )
  return { targets, aliases }
}

function tableOfContents(text: EditionText): string {
  const items = text.divisions.map((division) => {
    const sections = text.passages
      .filter((p) => p.division === division.locator)
      .flatMap((p) =>
        p.headings
          .filter((h) => h.kind === "section")
          .map(
            (h) =>
              `<li><a href="#${attr(locatorId(p.locator))}">${h.html}</a></li>`,
          ),
      )
    return `<li><a href="#${attr(locatorId(division.locator))}" data-division="${attr(locatorId(division.locator))}">${escapeHtml(division.label)}</a>${
      sections.length
        ? `<ol class="toc-sections">${sections.join("")}</ol>`
        : ""
    }</li>`
  })
  const editorial = text.editorial.length
    ? `<li class="toc-editorial"><a href="#editorial">Editorial matter</a></li>`
    : ""
  return `<ol class="toc-list">${items.join("")}${editorial}</ol>`
}

function passageHtml(passage: Passage): string {
  const id = locatorId(passage.locator)
  const label = passage.locator.split(/[\s.]/).at(-1) ?? passage.locator
  const notes = passage.notes.length
    ? `<aside class="notes" aria-label="Notes to ${attr(passage.locator)}" lang="en"><ol>${passage.notes
        .map(
          (n) =>
            `<li id="n-${attr(n.id)}"><a class="note-back" href="#r-${attr(n.id)}" aria-label="Back to the text of note ${attr(n.id)}">${escapeHtml(n.id)}</a> ${n.html}</li>`,
        )
        .join("")}</ol></aside>`
    : ""
  return `${passage.headings.map((h) => headingHtml(h, passage)).join("\n")}
<section class="passage" id="${attr(id)}" aria-label="${attr(passage.locator)}">
<a class="loc" href="#${attr(id)}" title="Copy a link to ${attr(passage.locator)}" aria-label="Copy a link to ${attr(passage.locator)}">${escapeHtml(label)}</a>
${passage.blocks.map((b) => `<p>${b}</p>`).join("\n")}
${notes}
</section>`
}

function headingHtml(heading: Heading, passage: Passage): string {
  const lang = heading.editorial ? ' lang="en"' : ""
  if (heading.kind === "division") {
    return `<h2 class="division" id="${attr(locatorId(passage.division))}" tabindex="-1"${lang}>${heading.html}</h2>`
  }
  if (heading.kind === "subtitle")
    return `<p class="subtitle"${lang}>${heading.html}</p>`
  return `<h3 class="section"${lang}>${heading.html}</h3>`
}

function editorialHtml(text: EditionText): string {
  if (!text.editorial.length) return ""
  return `<section class="editorial" aria-labelledby="editorial" lang="en">
<h2 id="editorial" tabindex="-1">Editorial matter</h2>
<p class="editorial-intro">Material the editor or translator added. It is not part of the ancient text and has no Locators.</p>
${text.editorial
  .map(
    (s) =>
      `<details id="${attr(s.id)}"><summary>${escapeHtml(s.title)}</summary><div class="editorial-body">${s.html}${
        s.notes.length
          ? `<aside class="notes"><ol>${s.notes.map((n) => `<li id="n-${attr(n.id)}">${escapeHtml(n.id)} ${n.html}</li>`).join("")}</ol></aside>`
          : ""
      }</div></details>`,
  )
  .join("\n")}
</section>`
}

/** The home page: every readable Work, grouped by author. */
export function homePage(works: { work: Work; edition: Edition }[]): string {
  const byAuthor = Map.groupBy(works, ({ work }) =>
    work.author === "Unknown" ? "Anonymous" : work.author,
  )
  const authors = [...byAuthor.keys()].sort((a, b) => a.localeCompare(b))
  const body = `
<main id="main" class="home" tabindex="-1">
<h1>${SITE_NAME}</h1>
<p class="lede">The full text of ancient works, linkable down to the passage.</p>
<div class="notice" id="notice" role="status" hidden></div>
<form class="filter" role="search" onsubmit="return false">
<label for="filter">Find a work</label>
<input id="filter" type="search" autocomplete="off" placeholder="Author or title">
</form>
<div class="catalogue">
${authors
  .map(
    (author) => `<section class="author-group" data-author="${attr(author)}">
<h2>${escapeHtml(author)}</h2>
<ul>${(byAuthor.get(author) ?? [])
      .map(
        ({ work, edition }) => `<li data-search="${attr(searchText(work))}">
<a href="${workUrl(work)}"><i>${escapeHtml(work.title)}</i></a>
<span class="meta">${escapeHtml([work.otherTitles[0], years(work), `${languageName(edition.language)}, ${editionLine(edition)}`].filter(Boolean).join(" · "))}</span>
</li>`,
      )
      .join("")}</ul>
</section>`,
  )
  .join("\n")}
</div>
<p class="empty" id="empty" hidden>No work matches.</p>
<section class="howto" aria-labelledby="howto">
<h2 id="howto">Linking to a passage</h2>
<p>Add the Locator after <code>#</code>: <code>/eutropius/breviarium#9.9</code>. If you only know the author and title, use <code>/cite?author=Eutropius&amp;title=Breviarium historiae Romanae&amp;loc=9.9</code>.</p>
</section>
</main>`
  return layout({
    title: SITE_NAME,
    description:
      "The full text of ancient works, linkable down to the passage.",
    canonical: "/",
    body,
    scripts: ["/assets/home.js"],
  })
}

export function citePage(): string {
  return layout({
    title: `Finding a passage · ${SITE_NAME}`,
    description: "Resolves an author, title and Locator to a passage.",
    canonical: "/cite",
    head: '<meta name="robots" content="noindex">',
    body: `<main id="main" class="home" tabindex="-1"><h1>Finding the passage…</h1>
<noscript><p>This lookup needs JavaScript. Browse the <a href="/">list of works</a> instead.</p></noscript></main>`,
    scripts: ["/assets/cite.js"],
  })
}

export function notFoundPage(): string {
  return layout({
    title: `Not found · ${SITE_NAME}`,
    description: "Page not found.",
    canonical: "/404",
    body: `<main id="main" class="home" tabindex="-1"><h1>Not found</h1><p>There is no page here. Browse the <a href="/">list of works</a>.</p></main>`,
  })
}

function years(work: Work): string {
  const { writtenYearEarliest: from, writtenYearLatest: to } = work
  const format = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`)
  if (from !== null && to !== null)
    return from === to ? format(from) : `${format(from)}–${to}`
  if (to !== null) return `before ${format(to)}`
  return from !== null ? `after ${format(from)}` : ""
}

function searchText(work: Work): string {
  return [work.author, work.title, ...work.otherTitles, work.slug].join(" ")
}

function attr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;")
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}
