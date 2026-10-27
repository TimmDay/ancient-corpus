// The corpus as files: one directory per Work under works/<author>/<title>/,
// holding work.json and one directory per Edition. These files are the source
// of truth (docs/adr/0002); the site and any index are built from them.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

export const REPO_ROOT = path.resolve(import.meta.dirname, "..")
export const WORKS_DIR = path.join(REPO_ROOT, "works")
export const INTAKE_DIR = path.join(REPO_ROOT, "data", "intake")

export type Work = {
  /** `author/title`, from the Work's directory. Permanent once published. */
  slug: string
  author: string
  title: string
  otherTitles: string[]
  originalLanguage: string | null
  writtenYearEarliest: number | null
  writtenYearLatest: number | null
  locatorFormat: string | null
  /** Old or longer slugs that redirect here, e.g. `eutropius/breviarium-historiae-romanae`. */
  slugAliases: string[]
  /** Other ways of naming a division, written → canonical, e.g. `Gaius` → `Caligula`. */
  locatorAliases: Record<string, string>
  editions: Edition[]
}

export type Edition = {
  slug: string
  preferred: boolean
  language: string
  title: string
  translator?: string
  editor?: string
  publicationYear?: number
  source: EditionSource
  /** Which importer under src/importers/ reads the source. */
  importer: string
}

export type EditionSource = {
  name: string
  url: string
  /** The unchanged archive in data/intake/ (not committed) and its SHA-256. */
  intakeFile: string
  sha256: string
  /** The source's licence or rights statement, kept for attribution. */
  rights: string
}

export type Heading = {
  /** `division` opens a book or Life; `section` is a heading inside one; `subtitle` describes the one above it. */
  kind: "division" | "section" | "subtitle"
  html: string
  /** True for headings an editor added (Hazzard's emperor headings), not the author's. */
  editorial: boolean
}

export type Note = { id: string; html: string }

export type FlagCode = "gap" | "long"

export type Flag = {
  code: FlagCode
  detail: string
  /** Why the Flag was judged harmless, from an `accept` Correction. */
  accepted?: string
}

/**
 * One addressable unit of an Edition's text. `blocks` are sanitized inline-HTML
 * paragraphs; footnote references inside them point at `notes`.
 */
export type Passage = {
  locator: string
  /** Headings that open just before this Passage (a new book, Life or section). */
  headings: Heading[]
  /** The division this Passage belongs to, e.g. `9` or `Augustus`, for the contents. */
  division: string
  blocks: string[]
  notes: Note[]
  /** Plain text of the blocks, for search and embeddings. */
  text: string
  flags: Flag[]
}

/** A division that has its own heading and can be linked to (a book, a Life). */
export type Division = { locator: string; label: string }

/** Content of an Edition that is not the Work's text, shown collapsed. */
export type EditorialSection = {
  id: string
  title: string
  html: string
  notes: Note[]
}

/** What an importer produces: the Edition before Corrections and Flags. */
export type ImportedEdition = {
  divisions: Division[]
  passages: Omit<Passage, "flags">[]
  editorial: EditorialSection[]
}

export type EditionText = {
  divisions: Division[]
  passages: Passage[]
  editorial: EditorialSection[]
}

export function workDir(slug: string): string {
  return path.join(WORKS_DIR, ...slug.split("/"))
}

export function editionDir(work: Work, edition: Edition): string {
  return path.join(workDir(work.slug), edition.slug)
}

export function loadWorks(): Work[] {
  const works: Work[] = []
  for (const author of readdirSync(WORKS_DIR).sort()) {
    const authorDir = path.join(WORKS_DIR, author)
    if (!existsSync(authorDir) || author.startsWith(".")) continue
    for (const title of readdirSync(authorDir).sort()) {
      const file = path.join(authorDir, title, "work.json")
      if (!existsSync(file)) continue
      const manifest = JSON.parse(readFileSync(file, "utf8")) as Omit<
        Work,
        "slug"
      >
      works.push({ ...manifest, slug: `${author}/${title}` })
    }
  }
  return works
}

export function preferredEdition(work: Work): Edition | undefined {
  return work.editions.find((e) => e.preferred) ?? work.editions[0]
}

export function hasEditionText(work: Work, edition: Edition): boolean {
  return existsSync(path.join(editionDir(work, edition), "passages.jsonl"))
}

export function readEditionText(work: Work, edition: Edition): EditionText {
  const dir = editionDir(work, edition)
  const passages = readFileSync(path.join(dir, "passages.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Passage)
  const { divisions, editorial } = JSON.parse(
    readFileSync(path.join(dir, "edition.json"), "utf8"),
  ) as Omit<EditionText, "passages">
  return { divisions, passages, editorial }
}

export function writeEditionText(
  work: Work,
  edition: Edition,
  text: EditionText,
): void {
  const dir = editionDir(work, edition)
  writeFileSync(
    path.join(dir, "passages.jsonl"),
    text.passages.map((p) => JSON.stringify(p)).join("\n") + "\n",
  )
  writeFileSync(
    path.join(dir, "edition.json"),
    JSON.stringify(
      { divisions: text.divisions, editorial: text.editorial },
      null,
      2,
    ) + "\n",
  )
}

/** Flags no Correction has accepted. An Edition with any of these is not published. */
export function unresolvedFlags(
  text: EditionText,
): { locator: string; flag: Flag }[] {
  return text.passages.flatMap((p) =>
    p.flags
      .filter((f) => !f.accepted)
      .map((flag) => ({ locator: p.locator, flag })),
  )
}
