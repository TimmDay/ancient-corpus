// What the MCP server's tools return, kept apart from the server so it can be
// tested. Everything is read from the committed Passages and the local index
// (docs/adr/0002); the server makes no LLM calls (docs/v2-vector-search.md).

import type { DatabaseSync } from "node:sqlite"
import {
  hasEditionText,
  loadWorks,
  readEditionText,
  type Edition,
  type EditionText,
  type Passage,
  type Work,
} from "../corpus.ts"
import { resolveLocator, resolvedTargets } from "../locator.ts"
import { periodOf } from "../period.ts"
import { readerUrl } from "../search/index.ts"
import type { Embed } from "../search/ollama.ts"
import { search } from "../search/search.ts"
import { sentenceSpans, splitSentenceRef } from "../sentences.ts"
import { locatorIndex } from "../site/render.ts"
import { normalizeName } from "../works-index.ts"

/** Where reader links point: the published site, or `pnpm dev` by default. */
export const SITE = (
  process.env.ANCIENT_CORPUS_SITE ?? "http://localhost:4321"
).replace(/\/$/, "")

/** Passages one `read_passage` call returns at most, for a link to a whole book. */
const MAX_PASSAGES = 20

export type Corpus = {
  works: Work[]
  /** The Works a slug, title, author or "author title" could mean, those with text first. */
  findWorks(written: string): Work[]
  text(work: Work, edition: Edition): EditionText | undefined
}

export function openCorpus(works = loadWorks()): Corpus {
  const texts = new Map<string, EditionText>()
  return {
    works,
    findWorks(written) {
      const found = findWorks(works, written)
      const withText = found.filter((w) =>
        w.editions.some((e) => hasEditionText(w, e)),
      )
      return withText.length ? withText : found
    },
    text(work, edition) {
      if (!hasEditionText(work, edition)) return undefined
      const key = `${work.slug}/${edition.slug}`
      const cached = texts.get(key)
      if (cached) return cached
      const text = readEditionText(work, edition)
      texts.set(key, text)
      return text
    },
  }
}

export function findWorks(works: Work[], written: string): Work[] {
  const bySlug = works.filter((w) => w.slug === written.trim())
  if (bySlug.length) return bySlug
  const wanted = normalizeName(written)
  return works.filter((w) =>
    [
      w.author,
      w.title,
      ...w.otherTitles,
      `${w.author} ${w.title}`,
      w.slug.replace(/[/-]/g, " "),
      w.slug.split("/")[0]?.replace(/-/g, " ") ?? "",
    ]
      .map(normalizeName)
      .includes(wanted),
  )
}

/** A Passage's text as numbered Sentences, `[1] … [2] …`, so a Finding can cite `@2`. */
export function numberedSentences(text: string, language: string): string {
  return sentenceSpans(text, language)
    .map((s, i) => `[${i + 1}] ${text.slice(s.start, s.end)}`)
    .join(" ")
}

/** The whole text of a Passage, joining the parts of one printed in parts, as the reader does. */
function passageText(text: EditionText, locator: string): string {
  return text.passages
    .filter((p) => p.locator === locator)
    .map((p) => p.text)
    .join(" ")
}

function editionsWithText(corpus: Corpus, work: Work): Edition[] {
  return work.editions.filter((e) => corpus.text(work, e))
}

export function listWorks(corpus: Corpus) {
  return corpus.works
    .filter((work) => editionsWithText(corpus, work).length)
    .map((work) => {
      const { earliest, latest } = periodOf(work)
      return {
        work: work.slug,
        author: work.author,
        title: work.title,
        otherTitles: work.otherTitles,
        periodCovered:
          earliest === undefined && latest === undefined
            ? null
            : { earliest: earliest ?? null, latest: latest ?? null },
        locatorFormat: work.locatorFormat,
        editions: editionsWithText(corpus, work).map((e) => ({
          edition: e.slug,
          language: e.language,
          title: e.title,
          translator: e.translator ?? null,
          preferred: e.preferred,
        })),
      }
    })
}

export type ReadPassageInput = {
  work: string
  locator: string
  edition?: string
  lang?: string
}

export function readPassage(
  corpus: Corpus,
  site: string,
  input: ReadPassageInput,
) {
  const [work, ...others] = corpus.findWorks(input.work)
  if (!work)
    return { error: `No Work "${input.work}". list_works names them all.` }
  if (others.length)
    return {
      error: `"${input.work}" could be ${[work, ...others].map((w) => w.slug).join(", ")}. Ask again with one of those.`,
    }
  const editions = editionsWithText(corpus, work)
  const edition =
    editions.find((e) => e.slug === input.edition) ??
    editions.find((e) => e.language === input.lang) ??
    editions.find((e) => e.preferred) ??
    editions[0]
  if (input.edition && edition?.slug !== input.edition)
    return {
      error: `${work.title} has no Edition "${input.edition}"; it has ${editions.map((e) => e.slug).join(", ")}.`,
    }
  const text = edition && corpus.text(work, edition)
  if (!edition || !text) return { error: `${work.title} has no text yet.` }

  const { locator: written, sentences } = splitSentenceRef(input.locator)
  const index = locatorIndex(work, text)
  const resolution = resolveLocator(written, index)
  if (resolution.kind === "not-found")
    return {
      error: `No "${written}" in ${work.title}. Its Locators look like: ${text.passages
        .slice(0, 3)
        .map((p) => p.locator)
        .join(", ")}.`,
    }

  // A division (a book, a Life) stands for its Passages.
  const divisions = new Set(text.divisions.map((d) => d.locator))
  const locators = [
    ...new Set(
      resolvedTargets(resolution, index).flatMap((t) =>
        divisions.has(t.locator) &&
        !text.passages.some((p) => p.locator === t.locator)
          ? text.passages
              .filter((p) => p.division === t.locator)
              .map((p) => p.locator)
          : [t.locator],
      ),
    ),
  ]
  const shown = locators.slice(0, MAX_PASSAGES)
  const byLocator = new Map<string, Passage[]>()
  for (const p of text.passages)
    byLocator.set(p.locator, [...(byLocator.get(p.locator) ?? []), p])

  return {
    work: work.slug,
    title: work.title,
    edition: edition.slug,
    language: edition.language,
    translator: edition.translator ?? null,
    exact: resolution.exact,
    ...(sentences ? { sentences } : {}),
    passages: shown.map((locator) => ({
      locator,
      url: site + readerUrl(work, edition, locator),
      text: numberedSentences(passageText(text, locator), edition.language),
      notes: (byLocator.get(locator) ?? []).flatMap((p) =>
        p.notes.map((n) => ({ id: n.id, text: plain(n.html) })),
      ),
    })),
    ...(locators.length > shown.length
      ? {
          more: `${locators.length - shown.length} more Passages, from ${locators[shown.length]} to ${locators.at(-1)}. Ask for them by Locator.`,
        }
      : {}),
    otherEditions: editions
      .filter((e) => e !== edition)
      .map((e) => ({ edition: e.slug, language: e.language })),
  }
}

export async function searchCorpus(
  corpus: Corpus,
  db: DatabaseSync,
  site: string,
  question: string,
  options: { embed?: Embed; limit?: number },
) {
  const result = await search(db, question, {
    embed: options.embed,
    // Each Passage is found once per Edition; ask for enough to fill the limit.
    limit: (options.limit ?? 30) * 2,
  })
  // A Passage found in several Editions is one candidate, in the Edition that ranked highest.
  const seen = new Set<string>()
  const candidates = result.candidates
    .filter((c) => {
      const key = `${c.work}#${c.locator}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, options.limit ?? 30)
    .flatMap((c) => {
      const work = corpus.works.find((w) => w.slug === c.work)
      const edition = work?.editions.find((e) => e.slug === c.edition)
      const text = work && edition && corpus.text(work, edition)
      if (!work || !edition || !text) return []
      return [
        {
          work: c.work,
          title: c.title,
          edition: c.edition,
          language: c.language,
          locator: c.locator,
          url: site + c.url,
          ...(c.draft ? { draft: true } : {}),
          matchedBy: c.matchedBy,
          text: numberedSentences(passageText(text, c.locator), c.language),
          otherEditions: editionsWithText(corpus, work)
            .filter((e) => e !== edition)
            .map((e) => ({
              edition: e.slug,
              language: e.language,
              url: site + readerUrl(work, e, c.locator),
            })),
        },
      ]
    })
  if (!result.coverage.length)
    return {
      error: "The search index is empty. Run pnpm index in the checkout.",
    }
  // The index can lag the files: count only Works with text now, and say which are not indexed yet.
  const withText = corpus.works
    .filter((w) => editionsWithText(corpus, w).length)
    .map((w) => w.slug)
  const unindexed = withText.filter((w) => !result.coverage.includes(w))
  const warnings = [
    ...(result.semantic
      ? []
      : [
          "Keyword search only: Ollama isn't running or the index has no vectors, so Passages that never name the words asked about are missed.",
        ]),
    ...(unindexed.length
      ? [
          `Not searched, because the index is older than the corpus: ${unindexed.join(", ")}. Run pnpm index.`,
        ]
      : []),
  ]
  return {
    question,
    coverage: result.coverage.filter((w) => withText.includes(w)),
    semantic: result.semantic,
    ...(warnings.length ? { warning: warnings.join(" ") } : {}),
    candidates,
  }
}

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}
