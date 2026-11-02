// Annotations: modern notes on a Passage, kept apart from the source's text,
// in works/<author>/<title>/annotations.json. Most identify someone or
// something a source does not name in words we search for: the Sibylline
// Oracle's "young Ares" is Gordian III, Dio's "Gaius" is Caligula. Each one
// cites its sources or says it is our own unsupported reading. They show on
// the reader page, collapsed, and search indexes them beside the text.

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { workDir, type Work } from "./corpus.ts"
import {
  resolveLocator,
  resolvedTargets,
  type LocatorIndex,
} from "./locator.ts"

export type Annotation = {
  /** The Passage or range it is about, as a Locator: `13.13`, `13.13-20`. */
  locator: string
  /** Who or what it identifies, in the words a question would use: "Gordian III". */
  identifies: string[]
  /** What it says, and why. Plain text; *asterisks* for italics. */
  note: string
  /** Where the reading comes from: a modern work, or a source in the corpus. */
  sources?: string[]
  /** Set instead of `sources` when the reading is ours alone. */
  unsupported?: true
}

/** How an Annotation with no sources is labelled, wherever it is shown. */
export const UNSUPPORTED = "Our unsupported amateur interpretation"

export function annotationsFile(work: Work): string {
  return path.join(workDir(work.slug), "annotations.json")
}

/** A Work's Annotations, refusing one that neither cites a source nor says it is our own reading. */
export function readAnnotations(work: Work): Annotation[] {
  const file = annotationsFile(work)
  if (!existsSync(file)) return []
  const annotations = JSON.parse(readFileSync(file, "utf8")) as Annotation[]
  annotations.forEach((a, i) => {
    const problem = problemWith(a)
    if (problem)
      throw new Error(
        `${work.slug} annotation ${i + 1} (${a.locator}): ${problem}`,
      )
  })
  return annotations
}

export function problemWith(annotation: Annotation): string | undefined {
  const sources = annotation.sources?.filter((s) => s.trim()) ?? []
  if (!annotation.locator?.trim()) return "it names no Locator"
  if (!annotation.note?.trim()) return "it has no note"
  if (!annotation.identifies?.some((s) => s.trim()))
    return "it identifies nothing"
  if (sources.length && annotation.unsupported)
    return "it cites sources and is also marked unsupported"
  if (!sources.length && !annotation.unsupported)
    return `it cites no source; cite one, or mark it "unsupported": true`
  return undefined
}

/** Each Passage's Annotations, by Locator, resolved the way the reader resolves links. */
export function annotationsByLocator(
  annotations: Annotation[],
  index: LocatorIndex,
): Map<string, Annotation[]> {
  const byLocator = new Map<string, Annotation[]>()
  for (const annotation of annotations) {
    const resolution = resolveLocator(annotation.locator, index)
    for (const target of resolvedTargets(resolution, index))
      byLocator.set(target.locator, [
        ...(byLocator.get(target.locator) ?? []),
        annotation,
      ])
  }
  return byLocator
}

/** An Annotation as plain text, for search to index beside its Passage. */
export function annotationText(annotation: Annotation): string {
  return `${annotation.identifies.join("; ")}. ${annotation.note}`.replace(
    /\*/g,
    "",
  )
}
