// pnpm align-chapters <author/title> <edition> <reference edition> [--force]: finds where
// each chapter starts in an Edition that prints no chapter numbers, by matching
// its sentences to the reference Edition's chapters with BGE-M3, and writes
// split Corrections for them. Needs Ollama. The result is a proposal: about one
// boundary in five lands a sentence or more out, so read every boundary against
// the reference and correct it by hand before committing. It will not overwrite
// an Edition's Corrections (which hold those checked boundaries) without --force.
//
// Each sentence is assigned to a chapter, in order, so that the summed
// similarity of every sentence to its chapter is as high as it can be, with
// every chapter getting at least one sentence.

import { existsSync, writeFileSync } from "node:fs"
import { loadWorks, readEditionText } from "../src/corpus.ts"
import type { Correction } from "../src/corrections.ts"
import { correctionsFile, importUncorrected } from "../src/importing.ts"
import { piecesOf } from "../src/search/index.ts"
import {
  HOW_TO_START,
  embedWithOllama,
  ollamaReady,
} from "../src/search/ollama.ts"
import { sentenceSpans } from "../src/sentences.ts"

/** How much a run's length straying from its chapter's costs, against similarity. */
const LENGTH_PENALTY = 2

const [workSlug, editionSlug, referenceSlug] = process.argv.slice(2)
const work = loadWorks().find((w) => w.slug === workSlug)
const edition = work?.editions.find((e) => e.slug === editionSlug)
const reference = work?.editions.find((e) => e.slug === referenceSlug)
if (!work || !edition || !reference) {
  console.error(
    "Usage: pnpm align-chapters zosimus/historia-nova green-chaplin mendelssohn",
  )
  process.exit(1)
}
if (
  existsSync(correctionsFile(work, edition)) &&
  !process.argv.includes("--force")
) {
  console.error(
    `${correctionsFile(work, edition)} exists and may hold boundaries checked by hand. Rerun with --force to replace it.`,
  )
  process.exit(1)
}
if (!(await ollamaReady())) {
  console.error(HOW_TO_START)
  process.exit(1)
}

// Before any split, so a rerun aligns the whole book again.
const text = importUncorrected(work, edition)
const chapters = Map.groupBy(
  readEditionText(work, reference).passages,
  (p) => p.division,
)
const corrections: Correction[] = []

for (const passage of text.passages) {
  const book = chapters.get(passage.division) ?? []
  const spans = sentenceSpans(passage.text, edition.language)
  const sentences = spans.map(({ start, end }) =>
    passage.text.slice(start, end),
  )
  console.log(
    `Book ${passage.division}: ${sentences.length} sentences into ${book.length} chapters`,
  )

  const sentenceVectors = await embedAll(sentences)
  // A chapter is the mean of its pieces' vectors.
  const chapterVectors = await Promise.all(
    book.map(async (c) => mean(await embedAll(piecesOf(c.text)))),
  )
  const starts = align(
    sentenceVectors,
    sentences.map((t) => t.split(/\s+/).length),
    chapterVectors,
    book.map((c) => c.text.split(/\s+/).length),
  )

  starts.slice(1).forEach((start, j) => {
    const span = spans[start]
    if (!span) return
    const at = uniqueOpening(passage.text, span)
    corrections.push({
      op: "split",
      locator: `${passage.division}.${j + 1}`,
      at,
      newLocator: `${passage.division}.${j + 2}`,
    })
  })
}

writeFileSync(
  correctionsFile(work, edition),
  JSON.stringify(corrections, null, 2) + "\n",
)
console.log(`Wrote ${corrections.length} split Corrections.`)

async function embedAll(texts: string[]): Promise<Float32Array[]> {
  const vectors: Float32Array[] = []
  for (let i = 0; i < texts.length; i += 32)
    vectors.push(...(await embedWithOllama(texts.slice(i, i + 32))))
  return vectors
}

function mean(vectors: Float32Array[]): Float32Array {
  const sum = new Float32Array(vectors[0]?.length ?? 0)
  for (const v of vectors) v.forEach((x, i) => (sum[i] = (sum[i] ?? 0) + x))
  const length = Math.hypot(...sum) || 1
  return sum.map((x) => x / length)
}

function dot(a: Float32Array, b: Float32Array): number {
  let total = 0
  for (let i = 0; i < a.length; i++) total += (a[i] ?? 0) * (b[i] ?? 0)
  return total
}

/**
 * The index of the first sentence of each chapter: the split of the sentences
 * into consecutive runs, one per chapter, that scores highest. A run scores the
 * similarity of its sentences to its chapter (relative to their similarity to
 * the book's chapters on average), less a penalty when its length strays from
 * what the chapter's length predicts.
 */
function align(
  sentences: Float32Array[],
  sentenceWords: number[],
  chapters: Float32Array[],
  chapterWords: number[],
): number[] {
  const S = sentences.length
  const C = chapters.length
  // Words of this Edition per word of the reference, over the whole book.
  const ratio = sum(sentenceWords) / sum(chapterWords)
  // prefix[j][i]: the summed relative similarity of sentences 0..i-1 to chapter j.
  const prefix = chapters.map(() => new Float64Array(S + 1))
  sentences.forEach((s, i) => {
    const sims = chapters.map((c) => dot(s, c))
    const average = sum(sims) / C
    sims.forEach((sim, j) => {
      const row = prefix[j] as Float64Array
      row[i + 1] = (row[i] ?? 0) + sim - average
    })
  })
  const words = new Float64Array(S + 1)
  sentenceWords.forEach((w, i) => (words[i + 1] = (words[i] ?? 0) + w))

  const score = (j: number, from: number, to: number) => {
    const row = prefix[j] as Float64Array
    const expected = (chapterWords[j] ?? 1) * ratio
    const off = Math.log(
      ((words[to] ?? 0) - (words[from] ?? 0) + 1) / (expected + 1),
    )
    return (row[to] ?? 0) - (row[from] ?? 0) - LENGTH_PENALTY * off * off
  }

  // best[j][i]: the best score for chapters 0..j-1 covering sentences 0..i-1.
  const best = Array.from({ length: C + 1 }, () =>
    new Float64Array(S + 1).fill(-Infinity),
  )
  const back = Array.from({ length: C + 1 }, () => new Int32Array(S + 1))
  ;(best[0] as Float64Array)[0] = 0
  for (let j = 0; j < C; j++) {
    const here = best[j] as Float64Array
    const next = best[j + 1] as Float64Array
    for (let from = j; from < S; from++) {
      const base = here[from] ?? -Infinity
      if (base === -Infinity) continue
      // Room for the chapters still to come: one sentence each at least.
      for (let to = from + 1; to <= S - (C - j - 1); to++) {
        const total = base + score(j, from, to)
        if (total > (next[to] ?? -Infinity)) {
          next[to] = total
          ;(back[j + 1] as Int32Array)[to] = from
        }
      }
    }
  }
  const starts = new Array<number>(C).fill(0)
  for (let j = C, i = S; j > 0; j--) {
    i = (back[j] as Int32Array)[i] ?? 0
    starts[j - 1] = i
  }
  return starts
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/**
 * The opening words of the sentence at `span`, as many as make them unique in
 * the text, never running into the next sentence (it may be another paragraph).
 */
function uniqueOpening(
  text: string,
  span: { start: number; end: number },
): string {
  const words = text.slice(span.start, span.end).split(/\s+/)
  for (let n = Math.min(6, words.length); n <= words.length; n++) {
    const at = words.slice(0, n).join(" ")
    if (text.indexOf(at) === text.lastIndexOf(at)) return at
  }
  return words.join(" ")
}
