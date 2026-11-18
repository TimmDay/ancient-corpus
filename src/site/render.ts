// HTML for every page the site serves. Pure functions of the corpus files.

import {
  LICENCES,
  type Division,
  type Edition,
  type EditionText,
  type Flag,
  type Heading,
  type Passage,
  type Work,
} from "../corpus.ts"
import {
  UNSUPPORTED,
  annotationsByLocator,
  readAnnotations,
  type Annotation,
} from "../annotations.ts"
import { workDates, type CatalogueEntry } from "../catalogue.ts"
import { flagExplanation } from "../flags.ts"
import { escapeHtml } from "../importers/gutenberg.ts"
import {
  aliasKey,
  locatorId,
  type Choice,
  type LocatorIndex,
  type LocatorTarget,
} from "../locator.ts"

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

// Applies a remembered theme before first paint, so a dark page never flashes
// light, and marks the page as scripted, so the menu folds away only when its
// button can open it.
export const THEME_SCRIPT = `<script>document.documentElement.classList.add("js");try{const t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}</script>`

const NAV_LINKS: [href: string, label: string][] = [
  ["/", "Works"],
  ["/editions/", "Index"],
  ["/how-to-use/", "How to Use"],
]

// Links in the header on wide screens; behind a menu button on narrow ones,
// where site.js slides the panel in.
function siteNav(canonical: string): string {
  return `<nav class="site-nav" aria-label="Site">
<button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-menu" aria-label="Open menu" hidden>
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
</button>
<div class="nav-panel" id="site-menu">
<button type="button" class="nav-close" aria-label="Close menu" hidden>
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
</button>
<ul>${NAV_LINKS.map(
    ([href, label]) =>
      `<li><a href="${href}"${href === canonical ? ' aria-current="page"' : ""}>${label}</a></li>`,
  ).join("")}</ul>
</div>
<div class="nav-scrim" hidden></div>
</nav>`
}

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
<header class="site-header"><div class="site-header-inner"><a class="brand" href="/">${SITE_NAME}</a>${siteNav(canonical)}${THEME_TOGGLE}</div></header>
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
  /** Every Edition's Locators, keyed by its slug, so `?lang=` can pick one that has the Passage. */
  locatorsOf: Map<string, string[]> = new Map(),
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
  /** The page a division is read on, for an Edition split by division. */
  const bookUrl = (division: string) => {
    const page = pageOf.get(division)
    return edition.pagePerDivision && page ? pageUrl(page) : ""
  }
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
  const annotations = annotationsByLocator(readAnnotations(work), index)
  const author = work.author === "Unknown" ? "Anonymous" : work.author
  const otherTitles = work.otherTitles.length
    ? `<p class="other-titles">Also known as ${work.otherTitles.map((t) => `<i>${escapeHtml(t)}</i>`).join(", ")}</p>`
    : ""
  const switcher =
    editions.length > 1
      ? `<nav class="editions" aria-label="Editions"><ul>${editions
          .map(
            (e) =>
              `<li><a href="${workUrl(work, e)}" data-lang="${attr(e.language)}" data-edition="${attr(e.slug)}" data-keep-hash${e.slug === edition.slug ? ' aria-current="page"' : ""}><span class="lang">${escapeHtml(languageName(e.language))}</span> ${escapeHtml(editionLine(e))}</a></li>`,
          )
          .join("")}</ul></nav>`
      : ""

  // Where two Editions share a language, `?lang=` needs to know which has a Locator.
  const sameLanguage = editions.filter(
    (e) => editions.filter((o) => o.language === e.language).length > 1,
  )

  const render = (
    page: ReaderPage | undefined,
    content: string,
    toc: string,
    /** The Passages this page is about: its own, or the whole Edition's on a contents page. */
    passages: Passage[],
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
${humanTranslationLine(edition)}
${edition.notice ? `<p class="rights-notice">${escapeHtml(edition.notice)}</p>` : ""}
${edition.unpublished ? `<p class="draft-banner">Not published: ${escapeHtml(edition.unpublished)}</p>` : ""}
${flagBanner(
  passages
    .filter((p) => openFlags(p).length)
    .map((p) => ({
      locator: p.locator,
      // A contents page holds no text, so its links go to the book's page.
      href: `${page ? "" : bookUrl(p.division)}#${ids.get(p) ?? ""}`,
    })),
  edition.pagePerDivision && !page ? "in this Edition" : "on this page",
)}
<div class="notice" id="notice" role="status" hidden></div>
<section class="chooser" id="chooser" aria-labelledby="chooser-title" hidden></section>
${content}
<footer class="attribution">
<p>Text from ${sourceLinks(edition)}. ${escapeHtml(edition.source.rights)}</p>
<p>Link to any passage by adding its Locator: <code>${escapeHtml(workUrl(work))}#${escapeHtml(text.passages[0]?.locator ?? "")}</code></p>
</footer>
</main>
</div>
${flagDialog(edition)}
${sameLanguage.length ? `<script type="application/json" id="edition-locators">${jsonForScript(Object.fromEntries(sameLanguage.map((e) => [e.slug, locatorsOf.get(e.slug) ?? []])))}</script>` : ""}
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
${passages.map((p) => passageHtml(p, ids.get(p) ?? "", text.divisions, p.resumes ? [] : (annotations.get(p.locator) ?? []))).join("\n")}
</article>`

  if (!edition.pagePerDivision) {
    const toc = tableOfContents(text, ids, text.divisions, () => "")
    return new Map([
      [
        "",
        render(
          undefined,
          article(text.passages) + editorialHtml(text),
          toc,
          text.passages,
        ),
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
  result.set("", render(undefined, contents, "", text.passages))
  pages.forEach((page, i) => {
    const onPage = new Set(page.divisions.map((d) => d.locator))
    const passages = text.passages.filter((p) => onPage.has(p.division))
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
        `${article(passages)}
<nav class="pager" aria-label="Books">${pager}</nav>`,
        tableOfContents(
          text,
          ids,
          page.divisions,
          (d) =>
            onPage.has(d.locator) ? "" : pageUrl(pageOf.get(d.locator) ?? page),
          `${base}#editorial`,
        ),
        passages,
      ),
    )
  })
  return result
}

/**
 * The human translation, at the top of the page: our machine translation
 * points readers to it, and a translator's Edition thanks its translator.
 */
function humanTranslationLine(edition: Edition): string {
  const human = edition.humanTranslation
  if (!human) return ""
  const label =
    edition.importer === "translation"
      ? "Read a human translation:"
      : "Translated by"
  const access = human.access ? ` ${escapeHtml(human.access)}` : ""
  return `<p class="human-translation">${label} <a href="${attr(human.url)}">${escapeHtml(human.citation)}</a>.${access}</p>`
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
  const choices = choicesFor(work, text, targets)
  return {
    targets,
    aliases,
    ...(Object.keys(choices).length ? { choices } : {}),
    ...(work.numberedLines ? { lines: true as const } : {}),
  }
}

/**
 * What tells apart targets that share a Locator but for a bracketed name, so a
 * link that leaves the name out can ask which one it meant.
 */
function choicesFor(
  work: Work,
  text: EditionText,
  targets: LocatorTarget[],
): Record<string, Choice> {
  const bare = (locator: string) => aliasKey(locator.replace(/\([^)]*\)/g, ""))
  const shared = Map.groupBy(targets, (t) => bare(t.locator))
  const ids = passageIds(text.passages)
  const passageById = new Map(text.passages.map((p) => [ids.get(p), p]))
  const divisionById = new Map(
    text.divisions.map((d) => [locatorId(d.locator), d]),
  )
  const choices: Record<string, Choice> = {}
  for (const group of shared.values()) {
    // Parts of one Passage share its Locator; only different Locators need a choice.
    if (new Set(group.map((t) => t.locator)).size < 2) continue
    for (const target of group) {
      const division = divisionById.get(target.id)
      const passage =
        passageById.get(target.id) ??
        text.passages.find((p) => p.division === division?.locator)
      const label =
        division?.label ??
        text.divisions.find((d) => d.locator === passage?.division)?.label ??
        ""
      const name = /\(([^)]*)\)$/.exec(target.locator)?.[1]
      choices[target.id] = {
        what: name
          ? (work.locatorQualifiers?.[name] ?? name)
          : `The main text of ${label.replace(/\s*\(.*\)$/, "")}`,
        excerpt: excerptOf(passage?.text ?? ""),
      }
    }
  }
  return choices
}

/** The first words of a text, about a sentence's worth. */
function excerptOf(text: string): string {
  const words = text.replace(/^[[\s¶]+/, "").split(/\s+/)
  return words.length > 30
    ? `${words.slice(0, 30).join(" ")}…`
    : words.join(" ")
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
  annotations: Annotation[] = [],
): string {
  // The bracketed name of a restarted run is in the heading above, so the margin shows just the number.
  const label =
    passage.locator
      .replace(/\(.*\)$/, "")
      .split(/[\s.]/)
      .at(-1) ?? passage.locator
  const flags = openFlags(passage)
  const notes = passage.notes.length
    ? `<aside class="notes" aria-label="Notes to ${attr(passage.locator)}" lang="en"><ol>${passage.notes
        .map(
          (n) =>
            `<li id="n-${attr(n.id)}"><a class="note-back" href="#r-${attr(n.id)}" aria-label="Back to the text of note ${attr(n.label ?? n.id)}">${escapeHtml(n.id)}</a> ${n.html}</li>`,
        )
        .join("")}</ol></aside>`
    : ""
  return `${passage.headings.map((h) => headingHtml(h, passage, divisions)).join("\n")}
<section class="passage${flags.length ? " flagged" : ""}" id="${attr(id)}" aria-label="${attr(passage.locator)}">
${flags.length ? flagNote(passage, flags) : ""}
<a class="loc" href="#${attr(id)}" title="Copy a link to ${attr(passage.locator)}" aria-label="Copy a link to ${attr(passage.locator)}">${escapeHtml(label)}</a>
${passage.blocks.map((b) => `<p>${b}</p>`).join("\n")}
${notes}
${annotations.length ? annotationsHtml(passage, annotations) : ""}
</section>`
}

/** Flags no Correction has accepted. Accepted ones match the print, so they go unmarked. */
function openFlags(passage: Passage): Flag[] {
  return passage.flags.filter((f) => !f.accepted)
}

const FLAG_ICON = `<svg class="flag-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>`

/** The warning at the head of a flagged Passage, shown before its text. */
function flagNote(passage: Passage, flags: Flag[]): string {
  return `<div class="flag-note" role="note" lang="en">
<p class="flag-title">${FLAG_ICON}Flagged: may not match the printed source</p>
${flags.map((f) => `<p class="flag-why">${escapeHtml(flagExplanation(passage.locator, f))}</p>`).join("\n")}
</div>`
}

/** Above the text: how many Passages here are flagged, each linked. */
function flagBanner(
  flagged: { locator: string; href: string }[],
  where: string,
): string {
  if (!flagged.length) return ""
  const one = flagged.length === 1
  return `<aside class="flag-banner" aria-label="Flagged Passages" lang="en">
<p class="flag-title">${FLAG_ICON}${one ? "One Passage" : `${flagged.length} Passages`} ${where} ${one ? "is" : "are"} flagged</p>
<p>When the text was imported, a check found something that may not match the printed source: a missing or repeated chapter number, or a chapter far longer than the rest. No one has yet compared ${one ? "it" : "them"} with the print, so read ${one ? "it" : "them"} with care.</p>
<p class="flag-links">${flagged.map((f) => `<a href="${attr(f.href)}">${escapeHtml(f.locator)}</a>`).join(", ")}</p>
</aside>`
}

/** Opened by reader.js when a link lands on a flagged Passage. */
function flagDialog(edition: Edition): string {
  return `<dialog class="flag-dialog" id="flag-dialog" aria-labelledby="flag-dialog-title" lang="en">
<p class="flag-title" id="flag-dialog-title">${FLAG_ICON}<span></span></p>
<div class="flag-dialog-body"></div>
<p class="flag-dialog-source">A check found this when the text was imported, and no one has yet compared it with the print. You can check it yourself in ${sourceLinks(edition)}.</p>
<form method="dialog"><button type="submit" autofocus>Read the passage</button></form>
</dialog>`
}

/** A Passage's Annotations: modern notes, collapsed, after the source's own text and notes. */
function annotationsHtml(passage: Passage, annotations: Annotation[]): string {
  const items = annotations.map(
    (a) => `<details class="annotation">
<summary><span class="annotation-label">Annotation</span> ${escapeHtml(a.identifies.join(", "))}</summary>
<p>${escapeHtml(a.note).replace(/\*([^*]+)\*/g, "<i>$1</i>")}</p>
${
  a.sources?.length
    ? `<p class="annotation-sources">Sources: ${a.sources.map((s) => escapeHtml(s).replace(/\*([^*]+)\*/g, "<i>$1</i>")).join("; ")}</p>`
    : `<p class="annotation-sources">${UNSUPPORTED}.</p>`
}
</details>`,
  )
  return `<aside class="annotations" lang="en" aria-label="Annotations to ${attr(passage.locator)}">${items.join("\n")}</aside>`
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
export function homePage(
  /** `flagged`: how many of the Edition's Passages have unresolved Flags. */
  works: { work: Work; edition: Edition; flagged?: number }[],
): string {
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
        ({
          work,
          edition,
          flagged,
        }) => `<li data-search="${attr(searchText(work))}">
<a href="${workUrl(work)}"><i>${escapeHtml(work.title)}</i></a>${flagged ? ` <span class="flag-tag" title="Passages that may not match the printed source">${FLAG_ICON}${flagged} flagged</span>` : ""}
<span class="meta">${escapeHtml([work.otherTitles[0], years(work), `${languageName(edition.language)}, ${editionLine(edition)}`].filter(Boolean).join(" · "))}</span>
</li>`,
      )
      .join("")}</ul>
</section>`,
  )
  .join("\n")}
</div>
<p class="empty" id="empty" hidden>No work matches.</p>
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

/** How to use the site: for now, how to link to a passage. */
export function howToUsePage(): string {
  const body = `
<main id="main" class="home" tabindex="-1">
<h1>How to Use</h1>
<p class="lede">Every passage has an address you can link to, cite or share.</p>
<section class="howto" aria-labelledby="howto">
<h2 id="howto">Linking to a passage</h2>
<ul class="howto-list">
<li><b>A passage:</b> add its Locator after <code>#</code>: <code>/eutropius/breviarium#9.9</code>. A range lights up every passage in it: <code>#9.9-10</code>.</li>
<li><b>A sentence:</b> add <code>@</code> and its number, counting from 1 within the passage: <code>#9.9@2</code>, or several in a row with <code>#9.9@2-4</code>. Sentences are counted in the edition the link opens.</li>
<li><b>An edition:</b> put the edition's name in the path: <code>/anonymous/historia-augusta/magie/#Hadrian 11</code>. Without one, a link opens the work's preferred edition, usually in the language it was written in.</li>
<li><b>A language:</b> add <code>?lang=</code> and a language code before the <code>#</code>: <code>/anonymous/historia-augusta/?lang=en#Hadrian 11</code>. If the work has no edition in that language, the link opens the preferred edition.</li>
<li><b>By author and title:</b> if you don't know a work's address, use <code>/cite?author=Eutropius&amp;title=Breviarium historiae Romanae&amp;loc=9.9</code>.</li>
</ul>
</section>
</main>`
  return layout({
    title: `How to Use · ${SITE_NAME}`,
    description: "How to link to a work, a passage or a sentence.",
    canonical: "/how-to-use/",
    body,
  })
}

const INDEX_COLUMNS: [key: string, label: string][] = [
  ["author", "Author"],
  ["work", "Work"],
  ["covers", "Covers"],
  ["written", "Written"],
  ["language", "Language"],
  ["translator", "Translator or editor"],
  ["licence", "Licence"],
  ["published", "Published"],
]

/**
 * Every published Edition, one row each, sorted by author, and those waiting
 * for permission, unlinked. editions.js sorts by any column and filters by
 * text, years and language; on a phone each row becomes a card.
 */
export function editionsPage(
  rows: { work: Work; edition: Edition; entry?: CatalogueEntry }[],
): string {
  const sorted = rows
    .map(({ work, edition, entry }) => ({
      work,
      edition,
      dates: workDates(work, entry),
      author: work.author === "Unknown" ? "Anonymous" : work.author,
    }))
    .sort(
      (a, b) =>
        a.author.localeCompare(b.author) ||
        a.work.title.localeCompare(b.work.title) ||
        Number(b.edition.preferred) - Number(a.edition.preferred),
    )
  const languages = [
    ...new Set(sorted.map(({ edition }) => languageName(edition.language))),
  ].sort((a, b) => a.localeCompare(b))
  const body = `
<main id="main" class="index-page" tabindex="-1">
<h1>Index</h1>
<form class="index-filters" role="search" onsubmit="return false">
<div class="field field-text"><label for="index-q">Search</label>
<input id="index-q" name="q" type="search" autocomplete="off" placeholder="Author, work, translator"></div>
<div class="field field-years" role="group" aria-labelledby="index-years"><span class="field-label" id="index-years">Years</span><div class="year-inputs">
<label class="visually-hidden" for="index-from">From</label><input id="index-from" name="from" type="text" inputmode="text" autocomplete="off" placeholder="from, e.g. 44 BC">
<span aria-hidden="true">to</span>
<label class="visually-hidden" for="index-to">To</label><input id="index-to" name="to" type="text" inputmode="text" autocomplete="off" placeholder="to, e.g. AD 476"></div>
</div>
<div class="field field-language"><label for="index-lang">Language</label>
<select id="index-lang" name="lang"><option value="">All languages</option>${languages
    .map((l) => `<option>${escapeHtml(l)}</option>`)
    .join("")}</select></div>
<div class="field field-made"><label for="index-made">Translated by</label>
<select id="index-made" name="made"><option value="">Human or AI</option><option value="human">Human</option><option value="ai">AI</option></select></div>
<div class="field field-sort"><label for="index-sort">Sort by</label>
<select id="index-sort" name="sort">${INDEX_COLUMNS.map(
    ([key, label]) => `<option value="${key}">${label}</option>`,
  ).join("")}</select></div>
<button type="reset" class="index-reset">Clear</button>
</form>
<p class="index-count" id="index-count" role="status">${sorted.length} editions</p>
<table class="index-table">
<thead><tr>${INDEX_COLUMNS.map(
    ([key, label]) =>
      `<th scope="col" data-key="${key}"${key === "author" ? ' aria-sort="ascending"' : ""}><button type="button">${label}<span class="sort-mark" aria-hidden="true"></span></button></th>`,
  ).join("")}</tr></thead>
<tbody>
${sorted
  .map(({ work, edition, author, dates }) => {
    const language = languageName(edition.language)
    const machine = edition.importer === "translation"
    // A machine translation is credited to the model that made it.
    const person =
      (machine ? edition.model : undefined) ??
      edition.translator ??
      edition.editor ??
      ""
    const licence = edition.licence ? LICENCES[edition.licence] : "Unknown"
    const cells: Record<string, string> = {
      author: escapeHtml(author),
      work: edition.unpublished
        ? `<i>${escapeHtml(work.title)}</i> <span class="none">(not published)</span>`
        : `<a href="${workUrl(work, edition)}"><i>${escapeHtml(work.title)}</i></a>`,
      covers: escapeHtml(dates.covers),
      written: escapeHtml(dates.written),
      language: escapeHtml(language),
      translator: person
        ? escapeHtml(person)
        : '<span class="none">not named</span>',
      licence:
        edition.licence === "permission-needed"
          ? permissionPopover(work, edition, person)
          : escapeHtml(licence),
      published: edition.publicationYear ? String(edition.publicationYear) : "",
    }
    const data = {
      author,
      work: work.title,
      language,
      translator: person,
      machine: machine ? "Yes" : "No",
      licence,
      // A Work known only to end at a year ("to 417") is open at the start.
      coversFrom: work.coversYearEarliest,
      coversTo: work.coversYearLatest ?? work.coversYearEarliest,
      written:
        work.writtenYearEarliest ??
        work.writtenYearLatest ??
        looseYear(dates.written),
      published: edition.publicationYear,
      search: [
        author,
        work.title,
        ...work.otherTitles,
        language,
        person,
        licence,
      ]
        .filter(Boolean)
        .join(" "),
    }
    return `<tr${Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(
        ([k, v]) =>
          ` data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${attr(String(v))}"`,
      )
      .join("")}>${INDEX_COLUMNS.map(
      ([key, label]) =>
        `<td data-label="${label}"${cells[key] ? "" : ' class="empty-cell"'}>${cells[key]}</td>`,
    ).join("")}${indexCard(
      cells,
      { author, written: dates.written, covers: dates.covers, licence },
      edition.licence === "permission-needed"
        ? permissionId(work, edition)
        : undefined,
    )}</tr>`
  })
  .join("\n")}
</tbody>
</table>
<p class="empty" id="index-empty" hidden>No edition matches.</p>
</main>`
  return layout({
    title: `Index · ${SITE_NAME}`,
    description:
      "Every edition in the corpus: author, work, dates, language and translator, sortable and filterable.",
    canonical: "/editions/",
    body,
    scripts: ["/assets/editions.js"],
  })
}

/**
 * "Permission needed", opening a note on who to ask. Without an address on
 * file it points to where the translator published the work.
 */
function permissionPopover(
  work: Work,
  edition: Edition,
  person: string,
): string {
  const id = permissionId(work, edition)
  const who = escapeHtml(person || "the translator")
  const ask = edition.permissionContact
    ? `Write to ${who} at <a href="mailto:${attr(edition.permissionContact)}">${escapeHtml(edition.permissionContact)}</a>.`
    : `Contact ${who} through <a href="${attr(edition.source.url)}">${escapeHtml(edition.source.name)}</a>.`
  return `${permissionButton(id)}<div class="permission-note" id="${id}" popover><p>This translation is in copyright. We use it for study only, and will publish it here once ${who} gives permission. To use it yourself, ask too.</p><p>${ask}</p></div>`
}

const permissionId = (work: Work, edition: Edition) =>
  `permission-${work.slug.replace(/\//g, "-")}-${edition.slug}`

/** Opens the note on who to ask; a card reuses the table cell's note. */
const permissionButton = (id: string) =>
  `<button type="button" class="permission" popovertarget="${id}">Permission needed</button>`

/**
 * A row as a card, for a phone: "Title, Author" with the language as a tag;
 * then when it was written and what it covers; then who made it, when, and
 * on what terms.
 */
function indexCard(
  cells: Record<string, string>,
  { author, written, covers, licence }: Record<string, string>,
  permission: string | undefined,
): string {
  // Upright here: in a short heading the italic title crowds the author.
  const head = `${(cells.work ?? "").replace(/<\/?i>/g, "")}, ${escapeHtml(author ?? "")}`
  const span = covers?.startsWith("to ") ? `up ${covers}` : covers
  const when = [written, span && `covering ${span}`].filter(Boolean)
  const made = [
    cells.translator?.includes('class="none"') ? "" : cells.translator,
    cells.published,
    permission ? permissionButton(permission) : escapeHtml(licence ?? ""),
  ].filter(Boolean)
  return `<td class="index-card"><p class="card-head"><span class="card-title">${head}</span><span class="card-lang">${cells.language}</span></p>${when.length ? `<p>${escapeHtml(when.join(", "))}</p>` : ""}<p>${made.join(", ")}</p></td>`
}

/** A year to sort by, from words like "c. 361", "after 270", "late 4th century", "2nd century BC". */
function looseYear(text: string): number | undefined {
  const century =
    /(early|mid|late)?[ -]*(\d+)(?:st|nd|rd|th) century( BC)?/i.exec(text)
  if (century?.[2]) {
    const part = { early: 10, mid: 50, late: 80 }[
      (century[1]?.toLowerCase() ?? "mid") as "early" | "mid" | "late"
    ]
    const year = (Number(century[2]) - 1) * 100 + part
    return century[3] ? -year : year
  }
  const plain = /(\d+)( BC)?/.exec(text)
  if (!plain?.[1]) return undefined
  return plain[2] ? -Number(plain[1]) : Number(plain[1])
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
