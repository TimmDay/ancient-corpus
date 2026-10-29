// Searching the index for a question: keyword matches (every form of a name
// the question mentions) and, when the index has vectors, semantic matches,
// merged into one wide list of candidates. Judging which are relevant, and
// why, is the chat model's job (docs/v2-vector-search.md).

import type { DatabaseSync } from "node:sqlite"
import type { IndexedPassage } from "./index.ts"
import { variantsOf } from "./names.ts"
import type { Embed } from "./ollama.ts"

export type Candidate = IndexedPassage & {
  /** Which halves of the search found it. */
  matchedBy: ("keyword" | "semantic")[]
  score: number
}

export type SearchResult = {
  question: string
  candidates: Candidate[]
  /** The Works searched: a Work not listed has no Edition in the corpus yet. */
  coverage: string[]
  /** False when the index was built without vectors, so only keywords were searched. */
  semantic: boolean
}

/** Words too common to search on, in the languages of the corpus's questions. */
const STOP_WORDS = new Set(
  "a about all an and any are as at be by did do does for from had has have he her his how in information is it its know of on or that the their there this to was we were what when where which who whom why with".split(
    " ",
  ),
)

/** An FTS5 query for every word of the question, each widened to every form of the name it could be. */
export function keywordQuery(question: string): string | undefined {
  const words = question
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))
  const terms = [...new Set(words.flatMap(variantsOf))]
  return terms.length
    ? terms.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ")
    : undefined
}

export async function search(
  db: DatabaseSync,
  question: string,
  options: { embed?: Embed; limit?: number } = {},
): Promise<SearchResult> {
  const limit = options.limit ?? 50
  const ranked = new Map<number, { score: number; matchedBy: Set<string> }>()
  // Reciprocal rank fusion: each half adds 1/(60 + rank), so a Passage both find rises.
  const add = (ids: number[], by: "keyword" | "semantic") =>
    ids.forEach((id, rank) => {
      const entry = ranked.get(id) ?? { score: 0, matchedBy: new Set() }
      entry.score += 1 / (60 + rank)
      entry.matchedBy.add(by)
      ranked.set(id, entry)
    })

  const query = keywordQuery(question)
  if (query) {
    const rows = db
      .prepare(
        "select rowid as id from passages_fts where passages_fts match ? order by bm25(passages_fts) limit ?",
      )
      .all(query, limit) as { id: number }[]
    add(
      rows.map((r) => r.id),
      "keyword",
    )
  }

  const semantic =
    Boolean(options.embed) &&
    (db.prepare("select count(*) as n from pieces").get() as { n: number }).n >
      0
  if (semantic && options.embed) {
    const [asked] = await options.embed([question])
    if (asked) add(nearest(db, asked, limit), "semantic")
  }

  const byId = db.prepare("select * from passages where id = ?")
  const candidates = [...ranked]
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, limit)
    .map(([id, { score, matchedBy }]) => {
      const row = byId.get(id) as unknown as Omit<IndexedPassage, "draft"> & {
        draft: number
      }
      return {
        ...row,
        draft: Boolean(row.draft),
        matchedBy: [...matchedBy] as Candidate["matchedBy"],
        score,
      }
    })
  const coverage = (
    db.prepare("select distinct work from passages order by work").all() as {
      work: string
    }[]
  ).map((r) => r.work)
  return { question, candidates, coverage, semantic }
}

/** Passages whose closest piece is nearest the question, by cosine similarity. */
function nearest(
  db: DatabaseSync,
  asked: Float32Array,
  limit: number,
): number[] {
  const best = new Map<number, number>()
  for (const row of db
    .prepare("select passage, vector from pieces")
    .iterate()) {
    const { passage, vector } = row as { passage: number; vector: Uint8Array }
    const v = new Float32Array(
      vector.buffer,
      vector.byteOffset,
      vector.byteLength / 4,
    )
    let dot = 0
    for (let i = 0; i < v.length; i++) dot += (v[i] ?? 0) * (asked[i] ?? 0)
    if (dot > (best.get(passage) ?? -Infinity)) best.set(passage, dot)
  }
  return [...best]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id]) => id)
}
