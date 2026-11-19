// Place references: spans of a Passage's text that name or point to a Place,
// one Edition's in works/<author>/<title>/<edition>/place-references.jsonl.
// Each anchors on its Locator and the text exactly as the Edition prints it
// ("Κτησιφῶντα"), and the build fails once that text stops matching, the way
// a Correction does. An unpublished Edition's file stays on this machine with
// its text.
//
// Only an explicit, resolved reference is marked in the reader; the rest are
// kept for later work (Unlocated places, the Place pages).

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { workDir, type Edition, type Passage, type Work } from "./corpus.ts"
import type { Place, PlaceId } from "./places.ts"

export type Resolution =
  /** One Place. */
  | "resolved"
  /** Several Places it could be; `candidates` lists them. */
  | "ambiguous"
  /** A known Place whose position is unknown. */
  | "unlocated"
  /** Not in Pleiades. */
  | "unidentified"

export type PlaceReference = {
  locator: string
  /** The text as this Edition prints it, without markup. */
  text: string
  /** Which occurrence of `text` in the Passage, from 1; needed only when it occurs more than once. */
  occurrence?: number
  state: Resolution
  /** The Place, for a resolved or unlocated reference. */
  place?: PlaceId
  candidates?: PlaceId[]
  /** True for a name ("Ctesiphon"), false for a pointer that context resolves ("the city"). */
  explicit: boolean
  /** Who identified it: by hand, or a model on a date. */
  by: "hand" | { model: string; date: string }
}

export function placeReferencesFile(work: Work, edition: Edition): string {
  return path.join(workDir(work.slug), edition.slug, "place-references.jsonl")
}

export function problemWith(
  reference: PlaceReference,
  places: Map<PlaceId, Place>,
): string | undefined {
  if (!reference.locator?.trim()) return "it names no Locator"
  if (!reference.text?.trim()) return "it quotes no text"
  if (reference.occurrence !== undefined && !(reference.occurrence >= 1))
    return "its occurrence must be 1 or more"
  if (typeof reference.explicit !== "boolean")
    return "it does not say whether it is explicit"
  if (
    reference.by !== "hand" &&
    !(reference.by?.model?.trim() && reference.by?.date?.trim())
  )
    return 'it does not say who made it: "hand", or a model and a date'
  const needsPlace =
    reference.state === "resolved" || reference.state === "unlocated"
  if (needsPlace && !reference.place)
    return `a ${reference.state} reference needs a Place`
  if (reference.state === "ambiguous" && !(reference.candidates?.length ?? 0))
    return "an ambiguous reference needs its candidates"
  if (
    !["resolved", "ambiguous", "unlocated", "unidentified"].includes(
      reference.state,
    )
  )
    return `its state "${reference.state}" is not one of resolved, ambiguous, unlocated, unidentified`
  for (const id of [reference.place, ...(reference.candidates ?? [])])
    if (id && !places.has(id)) return `its Place ${id} is not in the snapshot`
  return undefined
}

/** One Edition's Place references, refusing any that is incomplete or names an unknown Place. */
export function readPlaceReferences(
  work: Work,
  edition: Edition,
  /** Read only when the Edition has Place references, since the snapshot is large. */
  readPlaces: () => Map<PlaceId, Place>,
): PlaceReference[] {
  const file = placeReferencesFile(work, edition)
  if (!existsSync(file)) return []
  const places = readPlaces()
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, i) => {
      if (!line.trim()) return []
      const reference = JSON.parse(line) as PlaceReference
      const problem = problemWith(reference, places)
      if (problem)
        throw new Error(
          `${work.slug}/${edition.slug} place reference on line ${i + 1} (${reference.locator} "${reference.text}"): ${problem}`,
        )
      return [reference]
    })
}

/** Shown in the reader: a name we have placed on the map. */
export function isMarked(reference: PlaceReference): boolean {
  return reference.state === "resolved" && reference.explicit
}

const escapeText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Where each occurrence of the text falls in a block's HTML, outside tags and note references. */
function occurrencesIn(html: string, text: string): number[] {
  const wanted = escapeText(text)
  const found: number[] = []
  // Text runs between tags; a note reference's number is not the source's text.
  const pattern = /<sup class="nref">.*?<\/sup>|<[^>]*>|[^<]+/gs
  for (const match of html.matchAll(pattern)) {
    if (match[0].startsWith("<")) continue
    for (
      let i = match[0].indexOf(wanted);
      i !== -1;
      i = match[0].indexOf(wanted, i + 1)
    ) {
      // A whole word: "Nisibis" in "Nisibis," but not "Edessa" in "Edessan".
      const before = match[0][i - 1] ?? " "
      const after = match[0][i + wanted.length] ?? " "
      if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) continue
      found.push((match.index ?? 0) + i)
    }
  }
  return found
}

/**
 * The Passages' blocks with each marked Place reference wrapped in a button
 * the reader opens a Place popover from. A Passage printed in parts counts
 * occurrences across its parts in print order. Throws when a reference's text
 * is not there, or is there more than once with no occurrence to choose.
 */
export function markPlaceReferences(
  passages: Passage[],
  references: PlaceReference[],
  label: string,
): Map<Passage, string[]> {
  const blocks = new Map(passages.map((p) => [p, [...p.blocks]]))
  const byLocator = new Map<string, PlaceReference[]>()
  for (const reference of references.filter(isMarked))
    byLocator.set(reference.locator, [
      ...(byLocator.get(reference.locator) ?? []),
      reference,
    ])

  for (const [locator, wanted] of byLocator) {
    const parts = passages.filter((p) => p.locator === locator)
    if (!parts.length)
      throw new Error(
        `${label}: place reference at ${locator}: no such Passage`,
      )
    // Wrap the latest positions first, so earlier positions stay valid.
    const edits: {
      part: Passage
      block: number
      at: number
      text: string
      place: PlaceId
    }[] = []
    for (const reference of wanted) {
      const hits = parts.flatMap((part) =>
        (blocks.get(part) ?? []).flatMap((html, block) =>
          occurrencesIn(html, reference.text).map((at) => ({
            part,
            block,
            at,
          })),
        ),
      )
      const where = `${label}: place reference "${reference.text}" at ${locator}`
      if (!hits.length) throw new Error(`${where}: text not found`)
      if (hits.length > 1 && reference.occurrence === undefined)
        throw new Error(
          `${where}: occurs ${hits.length} times; say which with "occurrence"`,
        )
      const hit = hits[(reference.occurrence ?? 1) - 1]
      if (!hit)
        throw new Error(
          `${where}: occurrence ${reference.occurrence} asked for, but it occurs ${hits.length} times`,
        )
      edits.push({
        ...hit,
        text: reference.text,
        place: reference.place as PlaceId,
      })
    }
    const spots = new Set(
      edits.map((e) => `${passages.indexOf(e.part)} ${e.block} ${e.at}`),
    )
    if (spots.size < edits.length)
      throw new Error(
        `${label}: two place references at ${locator} mark the same text`,
      )
    edits.sort((a, b) => b.at - a.at)
    for (const { part, block, at, text, place } of edits) {
      const list = blocks.get(part)
      const html = list?.[block]
      if (!list || html === undefined) continue
      const length = escapeText(text).length
      list[block] =
        html.slice(0, at) +
        `<button type="button" class="place-ref" data-place="${place}">${html.slice(at, at + length)}</button>` +
        html.slice(at + length)
    }
  }
  return blocks
}
