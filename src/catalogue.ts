// The Catalogue: the ancient sources for the coin cabinet's period (Creation to
// 457), whether or not they are in the corpus, kept by hand in catalogue.json.
// An entry for a Work in the corpus names its slug and adds only what work.json
// lacks; its status is read from the Work's Editions, never typed, so
// CATALOGUE.md, which `pnpm ingest` rewrites, cannot go stale.

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { format } from "prettier"
import {
  REPO_ROOT,
  readEditionText,
  type Edition,
  type Work,
} from "./corpus.ts"

export const CATALOGUE_JSON = path.join(REPO_ROOT, "catalogue.json")
export const CATALOGUE_MD = path.join(REPO_ROOT, "CATALOGUE.md")

export type Catalogue = {
  /** When the list was last compared with the First1KGreek, Perseus and PHI catalogues. */
  checkedAgainstCatalogues: string
  sections: { heading: string; entries: CatalogueEntry[] }[]
}

export type CatalogueEntry = {
  /** The Work's slug, when it is in the corpus. */
  work?: string
  /** The rest are for a Work not in the corpus, or fill a gap in its work.json. */
  author?: string
  title?: string
  /** A language code, as in work.json: `la`, `grc`, `hbo`. */
  language?: string
  /** When it was written, as a reader would say it: "c. 93", "after 337". */
  written?: string
  /** The years it narrates, in words: "Creation to 66". */
  covers?: string
  /** A public-domain English translation, by translator and year. */
  freeEnglish?: string
  note?: string
}

const LANGUAGES: Record<string, string> = {
  akk: "Akkadian",
  ar: "Arabic",
  cy: "Welsh",
  en: "English",
  grc: "Greek",
  hbo: "Hebrew",
  hy: "Armenian",
  la: "Latin",
  pal: "Middle Persian",
  peo: "Old Persian",
  syc: "Syriac",
  xpr: "Parthian",
}

export function readCatalogue(): Catalogue {
  return JSON.parse(readFileSync(CATALOGUE_JSON, "utf8")) as Catalogue
}

/** Fields an entry sets that its Work's work.json already records, which would be a second source of truth. */
export function duplicatedFields(entry: CatalogueEntry, work: Work): string[] {
  return [
    entry.author !== undefined && "author",
    entry.title !== undefined && "title",
    entry.language !== undefined &&
      work.originalLanguage !== null &&
      "language",
    entry.written !== undefined &&
      (work.writtenYearEarliest ?? work.writtenYearLatest) != null &&
      "written",
    entry.covers !== undefined &&
      (work.coversYearEarliest ?? work.coversYearLatest) != null &&
      "covers",
  ].filter((field): field is string => Boolean(field))
}

const year = (y: number) => (y < 0 ? `${-y} BC` : `${y}`)

function span(from?: number | null, to?: number | null): string {
  if (from == null) return to == null ? "" : `to ${year(to)}`
  if (to == null || to === from) return year(from)
  return `${year(from)} to ${year(to)}`
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

/** The published Editions, whose text is committed and so the same on every machine. */
const published = (work: Work) => work.editions.filter((e) => !e.unpublished)

const isOurs = (edition: Edition) => edition.importer === "translation"

function originalCell(work: Work): string {
  const originals = work.editions.filter(
    (e) => e.language === work.originalLanguage,
  )
  if (!originals.length) return "no"
  const here = originals.find((e) => !e.unpublished)
  return here
    ? `yes (${here.editor ?? here.translator ?? here.slug})`
    : "waiting"
}

function englishCell(work: Work): string {
  const english = work.editions.filter((e) => e.language === "en")
  const cells = english.map((e) => {
    if (e.unpublished) return `waiting (${e.translator ?? e.slug})`
    if (!isOurs(e)) return `yes (${e.translator ?? e.slug})`
    const original = published(work).find(
      (o) => o.language === work.originalLanguage,
    )
    const ours = readEditionText(work, e).passages.length
    return original
      ? `ours: ${ours} of ${readEditionText(work, original).passages.length} Passages`
      : "ours"
  })
  return cells.join("; ") || "no"
}

function status(work: Work | undefined): string {
  if (!work) return "not here"
  if (!work.editions.length) return "listed, no text yet"
  const visible = published(work)
  if (!visible.length) return "waiting for permission"
  if (visible.some((e) => e.language === "en"))
    return visible.some((e) => e.language === "en" && isOurs(e))
      ? "our translation"
      : "in corpus"
  return "original only"
}

/** Words in the Work's own language, counted from its first published Edition in it. */
function originalWords(work: Work): string {
  const original = published(work).find(
    (e) => e.language === work.originalLanguage,
  )
  if (!original) return ""
  const count = readEditionText(work, original).passages.reduce(
    (n, p) => n + words(p.text),
    0,
  )
  return count.toLocaleString("en-GB")
}

const cell = (s: string) => s.replace(/\|/g, "\\|")

function row(entry: CatalogueEntry, works: Map<string, Work>): string {
  const work = entry.work ? works.get(entry.work) : undefined
  if (entry.work && !work) throw new Error(`No Work ${entry.work}`)
  const language = work?.originalLanguage ?? entry.language ?? ""
  const cells = [
    work
      ? `${work.author}, _${work.title}_ (\`${work.slug}\`)`
      : `${entry.author}, _${entry.title}_`,
    LANGUAGES[language] ?? language,
    span(work?.writtenYearEarliest, work?.writtenYearLatest) ||
      entry.written ||
      "",
    span(work?.coversYearEarliest, work?.coversYearLatest) ||
      entry.covers ||
      "",
    status(work),
    work ? originalCell(work) : "",
    work ? englishCell(work) : "",
    work ? originalWords(work) : "",
    entry.freeEnglish ?? "",
    entry.note ?? "",
  ]
  return `| ${cells.map(cell).join(" | ")} |`
}

/** CATALOGUE.md, formatted as prettier would leave it. */
export async function renderCatalogue(
  catalogue: Catalogue,
  works: Work[],
): Promise<string> {
  const bySlug = new Map(works.map((w) => [w.slug, w]))
  const lines = [
    "# Catalogue",
    "",
    "The ancient sources for the coin cabinet's period, Creation to 457, and where each one stands in this corpus. Kept by hand in `catalogue.json`; `pnpm ingest` rewrites this file, and the status, Editions and word counts are read from `works/`, so do not edit it here.",
    "",
    `Last compared with the First1KGreek, Perseus and PHI catalogues: ${catalogue.checkedAgainstCatalogues}.`,
    "",
    "**Status:** _in corpus_ has an English Edition; _our translation_ has an English Edition made by this project (ADR 0003); _original only_ has no English yet; _waiting for permission_ is imported for study but unpublished; _listed, no text yet_ has a Work but no Edition; _not here_ is not in the corpus. **Words** are counted in the original-language Edition here. **Free English** names a public-domain translation, not yet checked online.",
  ]
  for (const section of catalogue.sections) {
    lines.push(
      "",
      `## ${section.heading}`,
      "",
      "| Work | Language | Written | Covers | Status | Original here | English here | Words | Free English | Note |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...section.entries.map((entry) => row(entry, bySlug)),
    )
  }
  return format(lines.join("\n") + "\n", { parser: "markdown" })
}

export async function writeCatalogue(works: Work[]): Promise<void> {
  writeFileSync(CATALOGUE_MD, await renderCatalogue(readCatalogue(), works))
}
