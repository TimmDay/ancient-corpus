// The search index: one SQLite file built from the committed Passages
// (docs/adr/0002), holding each Passage's text for keyword search (FTS5) and
// BGE-M3 vectors of its text for semantic search. Gitignored; safe to delete.
// Vectors are cached by a hash of their text in a second file, so a rebuild
// only embeds what changed.

import { createHash } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  REPO_ROOT,
  hasEditionText,
  loadWorks,
  readEditionText,
  unresolvedFlags,
  type Edition,
  type Work,
} from "../corpus.ts"
import { MODEL, type Embed } from "./ollama.ts"

export const INDEX_FILE = path.join(REPO_ROOT, "indexes", "corpus.sqlite")
export const CACHE_FILE = path.join(REPO_ROOT, "indexes", "embeddings.sqlite")

/** Bump when the tables change, so an old index is rebuilt rather than misread. */
const SCHEMA = 2

/** Words in one embedded piece of a long Passage; pieces overlap so no sentence is only ever cut in half. */
const PIECE_WORDS = 200
const OVERLAP_WORDS = 40

export type IndexedPassage = {
  work: string
  author: string
  title: string
  edition: string
  language: string
  locator: string
  division: string
  /** The reader link, from the site root. */
  url: string
  /** The Edition still has unresolved Flags and is not published. */
  draft: boolean
  text: string
}

export function openIndex(file = INDEX_FILE): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  // An index built to an older layout is dropped; pnpm index rebuilds it.
  if (
    (db.prepare("pragma user_version").get() as { user_version: number })
      .user_version !== SCHEMA
  )
    db.exec(`
      drop table if exists passages; drop table if exists passages_fts;
      drop table if exists pieces; drop table if exists meta;
      pragma user_version = ${SCHEMA};
    `)
  db.exec(`
    create table if not exists passages (
      id integer primary key, work text, author text, title text, edition text,
      language text, locator text, division text, url text, draft integer, text text
    );
    create virtual table if not exists passages_fts using fts5(
      place, text, tokenize = 'unicode61 remove_diacritics 2'
    );
    create table if not exists pieces (passage integer, vector blob);
    create table if not exists meta (key text primary key, value text);
  `)
  return db
}

/** Every Passage of every Edition with text, in reading order. */
export function corpusPassages(works = loadWorks()): IndexedPassage[] {
  return works.flatMap((work) =>
    work.editions
      .filter((edition) => hasEditionText(work, edition))
      .flatMap((edition) => {
        const text = readEditionText(work, edition)
        const draft = unresolvedFlags(text).length > 0
        return text.passages.map((p) => ({
          work: work.slug,
          author: work.author,
          title: work.title,
          edition: edition.slug,
          language: edition.language,
          locator: p.locator,
          division: p.division,
          url: readerUrl(work, edition, p.locator),
          draft,
          text: p.text,
        }))
      }),
  )
}

/** `/anonymous/historia-augusta/magie/#Three%20Gordians%2030`; the preferred Edition is the Work's own page. */
export function readerUrl(
  work: Work,
  edition: Edition,
  locator: string,
): string {
  const page = edition.preferred
    ? `/${work.slug}/`
    : `/${work.slug}/${edition.slug}/`
  return `${page}#${encodeURIComponent(locator)}`
}

/**
 * Where a Passage is, `Historia Augusta, Caracalla 7`: indexed and embedded with
 * its text, since a Passage often says only "he" of the man its Life is about.
 */
export function placeOf(p: IndexedPassage): string {
  return `${p.title}, ${p.locator}`
}

/** The overlapping pieces of a Passage's text that are embedded. */
export function piecesOf(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= PIECE_WORDS) return [text]
  const pieces: string[] = []
  for (let start = 0; ; start += PIECE_WORDS - OVERLAP_WORDS) {
    pieces.push(words.slice(start, start + PIECE_WORDS).join(" "))
    if (start + PIECE_WORDS >= words.length) break
  }
  return pieces
}

/**
 * Rebuilds the index from the Passages given. Without `embed`, only keyword
 * search is built and the old vectors are dropped.
 */
export async function buildIndex(
  db: DatabaseSync,
  passages: IndexedPassage[],
  embed?: Embed,
  cache: DatabaseSync = openCache(),
  onProgress: (done: number, total: number) => void = () => undefined,
): Promise<{ passages: number; pieces: number; embedded: number }> {
  db.exec(
    "delete from passages; delete from pieces; delete from meta; delete from passages_fts;",
  )
  const insert = db.prepare(
    "insert into passages (work, author, title, edition, language, locator, division, url, draft, text) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
  const insertFts = db.prepare(
    "insert into passages_fts (rowid, place, text) values (?, ?, ?)",
  )
  const ids: number[] = []
  db.exec("begin")
  for (const p of passages) {
    const { lastInsertRowid } = insert.run(
      p.work,
      p.author,
      p.title,
      p.edition,
      p.language,
      p.locator,
      p.division,
      p.url,
      p.draft ? 1 : 0,
      p.text,
    )
    insertFts.run(lastInsertRowid, placeOf(p), p.text)
    ids.push(Number(lastInsertRowid))
  }
  db.exec("commit")
  if (!embed) return { passages: passages.length, pieces: 0, embedded: 0 }

  // Embed what the cache lacks, a batch at a time.
  const pieces = passages.flatMap((p, i) =>
    piecesOf(p.text)
      .map((piece) => `${placeOf(p)}: ${piece}`)
      .map((text) => ({
        passage: ids[i] ?? 0,
        text,
        hash: hashOf(text),
      })),
  )
  const cached = cache.prepare(
    "select vector from embeddings where hash = ? and model = ?",
  )
  const store = cache.prepare(
    "insert or replace into embeddings (hash, model, vector) values (?, ?, ?)",
  )
  const missing = [
    ...new Map(
      pieces
        .filter((p) => !cached.get(p.hash, MODEL))
        .map((p) => [p.hash, p.text]),
    ),
  ]
  for (let i = 0; i < missing.length; i += 32) {
    const batch = missing.slice(i, i + 32)
    const vectors = await embed(batch.map(([, text]) => text))
    cache.exec("begin")
    batch.forEach(([hash], j) => {
      const vector = vectors[j]
      if (vector) store.run(hash, MODEL, Buffer.from(vector.buffer))
    })
    cache.exec("commit")
    onProgress(Math.min(i + 32, missing.length), missing.length)
  }

  const insertPiece = db.prepare(
    "insert into pieces (passage, vector) values (?, ?)",
  )
  db.exec("begin")
  for (const piece of pieces) {
    const row = cached.get(piece.hash, MODEL) as
      { vector: Uint8Array } | undefined
    if (row) insertPiece.run(piece.passage, row.vector)
  }
  db.prepare("insert into meta (key, value) values ('model', ?)").run(MODEL)
  db.exec("commit")
  return {
    passages: passages.length,
    pieces: pieces.length,
    embedded: missing.length,
  }
}

export function openCache(file = CACHE_FILE): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true })
  const cache = new DatabaseSync(file)
  cache.exec(
    "create table if not exists embeddings (hash text, model text, vector blob, primary key (hash, model))",
  )
  return cache
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}
