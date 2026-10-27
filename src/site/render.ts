// HTML for every page the site serves. Pure functions of the corpus files.

import type {
  Division,
  Edition,
  EditionText,
  Heading,
  Passage,
  Work,
} from "../corpus.ts"
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

// Applies a remembered theme before first paint, so a dark page never flashes light.
export const THEME_SCRIPT = `<script>try{const t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}</script>`

// Hidden until site.js runs, since it does nothing without it.
export const THEME_TOGGLE = `<button type="button" class="theme-toggle" aria-label="Switch theme" hidden>
<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>
<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
</button>`

const TO_TOP = `<button type="button" class="to-top" aria-label="Back to top" title="Back to top" data-away="false" hidden>
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
</button>`

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
${THEME_SCRIPT}
${head}
${[...scripts, "/assets/site.js"].map((src) => `<script src="${attr(src)}" defer></script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="site-header-inner"><a class="brand" href="/">${SITE_NAME}</a>${THEME_TOGGLE}</div></header>
${body}
${TO_TOP}
<div class="toast" role="status" aria-live="polite" id="toast"></div>
</body>
</html>
`
}

/**
 * A reader page: the whole Edition, or for an Edition read a book at a time,
 * the divisions that share one number (Dio's Book 80 and Book 80 (Alexander)).
 */
type ReaderPage = { slug: string; divisions: Division[] }

/** The pages an Edition is read on; one, unless it is split by division. */
export function readerPages(edition: Edition, text: EditionText): ReaderPage[] {
  if (!edition.pagePerDivision) return [{ slug: "", divisions: text.divisions }]
  const bySlug = Map.groupBy(text.divisions, (d) => pageSlug(d.locator))
  return [...bySlug].map(([slug, divisions]) => ({ slug, divisions }))
}

/** "Book 80" for the page holding Book 80 and Book 80 (Alexander). */
function pageLabel(page: ReaderPage): string {
  return (page.divisions[0]?.label ?? page.slug).replace(/\s*\(.*\)$/, "")
}

/** `80(Alexander)` is read on the same page as `80`. */
function pageSlug(divisionLocator: string): string {
  return locatorId(divisionLocator.replace(/\(.*\)$/, ""))
}

/**
 * Every page of one Edition of a Work, keyed by its path under the Edition's
 * URL ("" for the Edition's own page). An Edition split by division gets a
 * contents page there, which sends a Locator link on to the right book.
 */
export function workPages(
  work: Work,
  edition: Edition,
  text: EditionText,
  editions: Edition[],
  /** Unresolved Flags, when rendering an unpublished draft for review. */
  draftFlags = 0,
): Map<string, string> {
  const pages = readerPages(edition, text)
  const base = workUrl(work, edition)
  const pageLink = (page: ReaderPage | undefined, rel: string, text: string) =>
    page ? `<a rel="${rel}" href="${pageUrl(page)}">${text}</a>` : ""
  const pageUrl = (page: ReaderPage) =>
    `${base}${page.slug ? `${page.slug}/` : ""}`
  const pageOf = new Map(
    pages.flatMap((page) => page.divisions.map((d) => [d.locator, page])),
  )
  const ids = passageIds(text.passages)
  const index = locatorIndex(
    work,
    text,
    edition.pagePerDivision
      ? (division) => {
          const page = pageOf.get(division)
          return page ? pageUrl(page) : undefined
        }
      : undefined,
  )
  const author = work.author === "Unknown" ? "Anonymous" : work.author
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

  const render = (
    page: ReaderPage | undefined,
    content: string,
    toc: string,
  ) => {
    const isBook = Boolean(page?.slug)
    const body = `
<div class="reader">
${
  toc
    ? `<nav class="toc" aria-label="Contents">
<details class="toc-panel" open>
<summary>Contents</summary>
${toc}
</details>
</nav>`
    : ""
}
<main id="main" tabindex="-1">
<header class="work-header">
<p class="author">${escapeHtml(author)}</p>
<h1>${isBook ? `<a class="work-title" href="${base}">${escapeHtml(work.title)}</a>` : escapeHtml(work.title)}</h1>
${isBook ? "" : otherTitles}
<p class="edition-line">${escapeHtml(editionLine(edition))}. ${escapeHtml(languageName(edition.language))}.</p>
${switcher}
</header>
${draftFlags ? `<p class="draft-banner">Draft: ${draftFlags} unresolved Flags. Not published until they are reviewed with <code>pnpm review</code>.</p>` : ""}
<div class="notice" id="notice" role="status" hidden></div>
${content}
<footer class="attribution">
<p>Text from ${sourceLinks(edition)}. ${escapeHtml(edition.source.rights)}</p>
<p>Link to any passage by adding its Locator: <code>${escapeHtml(workUrl(work))}#${escapeHtml(text.passages[0]?.locator ?? "")}</code></p>
</footer>
</main>
</div>
<script type="application/json" id="locator-index">${jsonForScript(index)}</script>`
    return layout({
      title: page?.slug
        ? `${pageLabel(page)} · ${work.title}, ${author}`
        : `${work.title}, ${author}`,
      description: `${work.author}, ${work.title}: ${editionLine(edition)}`,
      canonical: page ? pageUrl(page) : base,
      body,
      scripts: ["/assets/reader.js"],
    })
  }

  const article = (passages: Passage[]) =>
    `<article class="text" lang="${attr(edition.language)}" aria-label="Text">
${passages.map((p) => passageHtml(p, ids.get(p) ?? "", text.divisions)).join("\n")}
</article>`

  if (!edition.pagePerDivision) {
    const toc = tableOfContents(text, ids, text.divisions, () => "")
    return new Map([
      [
        "",
        render(undefined, article(text.passages) + editorialHtml(text), toc),
      ],
    ])
  }

  const result = new Map<string, string>()
  const contents = `<section class="book-index" aria-label="Books">
<ol>${pages
    .map(
      (page) =>
        `<li><a href="${pageUrl(page)}">${escapeHtml(pageLabel(page))}</a></li>`,
    )
    .join("")}</ol>
</section>${editorialHtml(text)}`
  // The book list is the contents here, so there is no sidebar to repeat it.
  result.set("", render(undefined, contents, ""))
  pages.forEach((page, i) => {
    const onPage = new Set(page.divisions.map((d) => d.locator))
    const [prev, next] = [pages[i - 1], pages[i + 1]]
    const label = (p: ReaderPage | undefined) =>
      escapeHtml(p ? pageLabel(p) : "")
    const pager =
      pageLink(prev, "prev", `← ${label(prev)}`) +
      pageLink(next, "next", `${label(next)} →`)
    result.set(
      page.slug,
      render(
        page,
        `${article(text.passages.filter((p) => onPage.has(p.division)))}
<nav class="pager" aria-label="Books">${pager}</nav>`,
        tableOfContents(
          text,
          ids,
          page.divisions,
          (d) =>
            onPage.has(d.locator) ? "" : pageUrl(pageOf.get(d.locator) ?? page),
          `${base}#editorial`,
        ),
      ),
    )
  })
  return result
}

/** One link for a single source; one per volume when the Edition spans several. */
function sourceLinks(edition: Edition): string {
  const volumes = edition.source.archives.filter((a) => a.url)
  if (volumes.length < 2) {
    return `<a href="${attr(edition.source.url)}">${escapeHtml(edition.source.name)}</a>`
  }
  return `${escapeHtml(edition.source.name)} (${volumes
    .map((a, i) => `<a href="${attr(a.url ?? "")}">volume ${i + 1}</a>`)
    .join(", ")})`
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

/**
 * Each Passage's HTML id. Published Editions have unique Locators; a draft may
 * not yet, so a repeated Locator gets `~2`, `~3` to keep anchors distinct.
 */
export function passageIds(passages: Passage[]): Map<Passage, string> {
  const counts = new Map<string, number>()
  return new Map(
    passages.map((p) => {
      const count = (counts.get(p.locator) ?? 0) + 1
      counts.set(p.locator, count)
      return [
        p,
        count === 1 ? locatorId(p.locator) : `${locatorId(p.locator)}~${count}`,
      ]
    }),
  )
}

export function locatorIndex(
  work: Work,
  text: EditionText,
  /** For an Edition split into pages: the URL of the page holding a division. */
  pageOf?: (division: string) => string | undefined,
): LocatorIndex {
  const ids = passageIds(text.passages)
  const divisions = new Map(text.divisions.map((d) => [d.locator, d]))
  const seen = new Set<string>()
  const targets = text.passages.flatMap((p) => {
    const division = !seen.has(p.division) && divisions.get(p.division)
    seen.add(p.division)
    const page = pageOf?.(p.division)
    const at = page ? { page } : {}
    const passage = { locator: p.locator, id: ids.get(p) ?? "", ...at }
    return division
      ? [
          { locator: division.locator, id: locatorId(division.locator), ...at },
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

/**
 * The contents: every division, with its sections listed for the divisions on
 * this page. `href` gives the page a division lives on ("" for this one).
 */
function tableOfContents(
  text: EditionText,
  ids: Map<Passage, string>,
  expanded: Division[],
  href: (division: Division) => string,
  editorialHref = "#editorial",
): string {
  const items = text.divisions.map((division) => {
    const id = locatorId(division.locator)
    const page = href(division)
    if (page) {
      return `<li><a href="${attr(page)}${expanded.length ? "" : `#${attr(id)}`}">${escapeHtml(division.label)}</a></li>`
    }
    const sections = expanded.includes(division)
      ? text.passages
          .filter((p) => p.division === division.locator)
          .flatMap((p) =>
            p.headings
              .filter((h) => h.kind === "section")
              .map(
                (h) =>
                  `<li><a href="#${attr(ids.get(p) ?? "")}">${h.html}</a></li>`,
              ),
          )
      : []
    return `<li><a href="#${attr(id)}" data-division="${attr(id)}">${escapeHtml(division.label)}</a>${
      sections.length
        ? `<ol class="toc-sections">${sections.join("")}</ol>`
        : ""
    }</li>`
  })
  const editorial = text.editorial.length
    ? `<li class="toc-editorial"><a href="${editorialHref}">Editorial matter</a></li>`
    : ""
  return `<ol class="toc-list">${items.join("")}${editorial}</ol>`
}

function passageHtml(
  passage: Passage,
  id: string,
  divisions: Division[],
): string {
  // The bracketed name of a restarted run is in the heading above, so the margin shows just the number.
  const label =
    passage.locator
      .replace(/\(.*\)$/, "")
      .split(/[\s.]/)
      .at(-1) ?? passage.locator
  const notes = passage.notes.length
    ? `<aside class="notes" aria-label="Notes to ${attr(passage.locator)}" lang="en"><ol>${passage.notes
        .map(
          (n) =>
            `<li id="n-${attr(n.id)}"><a class="note-back" href="#r-${attr(n.id)}" aria-label="Back to the text of note ${attr(n.id)}">${escapeHtml(n.id)}</a> ${n.html}</li>`,
        )
        .join("")}</ol></aside>`
    : ""
  return `${passage.headings.map((h) => headingHtml(h, passage, divisions)).join("\n")}
<section class="passage" id="${attr(id)}" aria-label="${attr(passage.locator)}">
<a class="loc" href="#${attr(id)}" title="Copy a link to ${attr(passage.locator)}" aria-label="Copy a link to ${attr(passage.locator)}">${escapeHtml(label)}</a>
${passage.blocks.map((b) => `<p>${b}</p>`).join("\n")}
${notes}
</section>`
}

function headingHtml(
  heading: Heading,
  passage: Passage,
  divisions: Division[],
): string {
  const lang = heading.editorial ? ' lang="en"' : ""
  if (heading.kind === "division") {
    const summary = divisions.find(
      (d) => d.locator === passage.division,
    )?.summary
    return `<h2 class="division" id="${attr(locatorId(passage.division))}" tabindex="-1"${lang}>${heading.html}</h2>${
      summary
        ? `<details class="division-summary" lang="en"><summary>Translator’s summary</summary>${summary}</details>`
        : ""
    }`
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
