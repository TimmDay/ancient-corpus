// Corrections: recorded editorial fixes, reapplied every time an Edition is
// imported, so a re-import never loses them. Each one names its Passage by
// Locator and anchors on quoted text, and fails loudly once it stops matching.

import type {
  EditionText,
  EditorialSection,
  Flag,
  FlagCode,
  ImportedEdition,
  Passage,
} from "./corpus.ts"
import { plainText } from "./importers/gutenberg.ts"

export type Correction =
  | { op: "accept"; locator: string; flag: FlagCode; reason: string }
  /** Starts a new Passage at the quoted text (a chapter marker the importer missed). */
  | { op: "split"; locator: string; at: string; newLocator: string }
  /** Joins this Passage onto the one before it. `at` picks one of several that share a Locator. */
  | { op: "merge"; locator: string; at?: string }
  /** Moves the quoted text and everything after it in the Passage into Editorial matter. */
  | { op: "toEditorial"; locator: string; at: string; title: string }
  /** Swaps quoted HTML for new; a blank line in `with` starts a new paragraph (text the transcription dropped). */
  | { op: "replace"; locator: string; find: string; with: string }
  /** `at` picks one of several Passages that share a Locator, by text it contains. */
  | { op: "renumber"; locator: string; newLocator: string; at?: string }
  /** Moves a Passage to just after the first Passage at `after`, where the source prints it. */
  | { op: "move"; locator: string; after: string; at?: string }
  /** Marks the Passage holding the quoted text as where the source resumes the earlier Passage at its Locator. */
  | { op: "resume"; locator: string; at: string }

/** Applies Corrections to an importer's output, then raises and settles Flags. */
export function correctEdition(
  imported: ImportedEdition,
  corrections: Correction[],
): EditionText {
  const passages: Omit<Passage, "flags">[] = imported.passages.map((p) => ({
    ...p,
    blocks: [...p.blocks],
  }))
  const editorial: EditorialSection[] = [...imported.editorial]

  for (const correction of corrections) {
    if (correction.op === "accept") continue
    // Where two Passages share a Locator, quoted text says which one is meant.
    const at =
      "at" in correction && correction.at ? collapse(correction.at) : undefined
    const index = passages.findIndex(
      (p) =>
        p.locator === correction.locator &&
        (!at ||
          collapse(p.text).includes(at) ||
          p.blocks.some((b) => collapse(plainText(b)).includes(at))),
    )
    const passage = passages[index]
    if (!passage) {
      const exists = passages.some((p) => p.locator === correction.locator)
      throw new Error(
        exists
          ? `Correction ${describe(correction)}: quoted text not found in ${correction.locator}`
          : `Correction ${describe(correction)}: no Passage ${correction.locator}`,
      )
    }

    switch (correction.op) {
      case "split": {
        const [before, after] = splitBlocks(
          passage.blocks,
          correction.at,
          correction,
        )
        passages.splice(index, 1, withBlocks(passage, before), {
          ...withBlocks(passage, after),
          locator: correction.newLocator,
          headings: [],
        })
        break
      }
      case "merge": {
        const previous = passages[index - 1]
        if (!previous)
          throw new Error(
            `Correction ${describe(correction)}: nothing before it to merge into`,
          )
        passages.splice(
          index - 1,
          2,
          withBlocks(previous, [...previous.blocks, ...passage.blocks]),
        )
        break
      }
      case "toEditorial": {
        const [before, after] = splitBlocks(
          passage.blocks,
          correction.at,
          correction,
        )
        passages[index] = withBlocks(passage, before)
        const moved = withBlocks(passage, after)
        editorial.push({
          id: `ed-${editorial.length + 1}`,
          title: correction.title,
          html: after.map((block) => `<p>${block}</p>`).join(""),
          notes: moved.notes,
        })
        break
      }
      case "replace": {
        const matches = passage.blocks.filter((b) =>
          b.includes(correction.find),
        ).length
        if (matches !== 1) {
          throw new Error(
            `Correction ${describe(correction)}: expected the text once, found it ${matches} times`,
          )
        }
        passages[index] = withBlocks(
          passage,
          passage.blocks.flatMap((b) =>
            b.replace(correction.find, correction.with).split(/\n\s*\n/),
          ),
        )
        break
      }
      case "renumber":
        passages[index] = { ...passage, locator: correction.newLocator }
        break
      case "move": {
        passages.splice(index, 1)
        const target = passages.findIndex((p) => p.locator === correction.after)
        if (target === -1)
          throw new Error(
            `Correction ${describe(correction)}: no Passage ${correction.after} to move it after`,
          )
        passages.splice(target + 1, 0, passage)
        break
      }
      case "resume":
        if (
          passages.findIndex((p) => p.locator === correction.locator) === index
        )
          throw new Error(
            `Correction ${describe(correction)}: no earlier part to resume`,
          )
        passages[index] = { ...passage, resumes: true }
        break
    }
  }

  const flagged = raiseFlags(passages)
  settleFlags(flagged, corrections)
  return { divisions: imported.divisions, passages: flagged, editorial }
}

function withBlocks(
  passage: Omit<Passage, "flags">,
  blocks: string[],
): Omit<Passage, "flags"> {
  const html = blocks.join(" ")
  return {
    ...passage,
    blocks,
    notes: passage.notes.filter((n) => html.includes(`id="r-${n.id}"`)),
    text: plainText(html),
  }
}

/** Flags a missing or out-of-order number within a division, and a Passage far longer than its neighbours. */
export function raiseFlags(passages: Omit<Passage, "flags">[]): Passage[] {
  const result: Passage[] = passages.map((p) => ({ ...p, flags: [] }))
  const byDivision = Map.groupBy(result, (p) => p.division)

  const seen = new Set<string>()
  for (const passage of result) {
    if (seen.has(passage.locator) && !passage.resumes) {
      passage.flags.push({
        code: "duplicate",
        detail: `An earlier Passage already has the Locator ${passage.locator}`,
      })
    }
    seen.add(passage.locator)
  }

  for (const division of byDivision.values()) {
    // A run named apart from the division's own, like an epitome's version of
    // chapters already given (`60.32(epitome)`), sits outside its numbering.
    const own = qualifierOf(division[0]?.locator ?? "")
    const group = division.filter(
      (p) => qualifierOf(p.locator) === own && !p.resumes,
    )
    const numbers = group.map((p) => lastNumber(p.locator))
    group.forEach((passage, i) => {
      if (passage.flags.some((f) => f.code === "duplicate")) return
      const current = numbers[i] ?? NaN
      if (i === 0 && current !== 1) {
        passage.flags.push({
          code: "gap",
          detail: `The division starts at ${current}, not 1`,
        })
      }
      // A number is missing only if no Passage anywhere in the division has it:
      // the source may print chapters out of number order.
      // A repeated number just after is the duplicate Flag's to report.
      const following = numbers[i + 1]
      const repeats =
        following !== undefined && numbers.slice(0, i + 1).includes(following)
      const next = Math.min(...numbers.filter((n) => n > current))
      if (Number.isFinite(next) && !numbers.includes(current + 1) && !repeats) {
        passage.flags.push({
          code: "gap",
          detail: `The next Passage is numbered ${next}, not ${current + 1}`,
        })
      }
    })

    const words = group.map((p) => p.text.split(/\s+/).length)
    const median =
      [...words].sort((a, b) => a - b)[Math.floor(words.length / 2)] ?? 0
    group.forEach((passage, i) => {
      const count = words[i] ?? 0
      if (count > Math.max(1200, 4 * median)) {
        passage.flags.push({
          code: "long",
          detail: `${count} words; the division's median is ${median}`,
        })
      }
    })
  }
  return result
}

function settleFlags(passages: Passage[], corrections: Correction[]): void {
  for (const correction of corrections) {
    if (correction.op !== "accept") continue
    const flag: Flag | undefined = passages
      .find((p) => p.locator === correction.locator)
      ?.flags.find((f) => f.code === correction.flag && !f.accepted)
    if (!flag)
      throw new Error(
        `Correction ${describe(correction)}: there is no such Flag to accept any more`,
      )
    flag.accepted = correction.reason
  }
}

/** Splits blocks where the quoted text starts: between blocks, or inside one. */
export function splitBlocks(
  blocks: string[],
  at: string,
  correction: Correction,
): [string[], string[]] {
  const wanted = collapse(at)
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] ?? ""
    const position = htmlPositionOf(block, wanted)
    if (position === undefined) continue
    const [head, tail] = splitHtml(block, position)
    const before = [...blocks.slice(0, i), head].filter((b) => plainText(b))
    const after = [tail, ...blocks.slice(i + 1)].filter((b) => plainText(b))
    if (!before.length || !after.length) {
      throw new Error(
        `Correction ${describe(correction)}: the quoted text is at the very start or end`,
      )
    }
    return [before, after]
  }
  throw new Error(
    `Correction ${describe(correction)}: quoted text not found: "${at}"`,
  )
}

/** Where the visible text `wanted` starts in `html`, ignoring tags, note references and spacing. */
/** The bracketed name of a run, `Alexander` in `80.1(Alexander)`, if any. */
function qualifierOf(locator: string): string | undefined {
  return /\(([^)]*)\)$/.exec(locator)?.[1]
}

/** The chapter number a Locator ends with: 5 in `Augustus 5`, 1 in `80.1(Alexander)`, 10 in `55.10a`. */
function lastNumber(locator: string): number {
  return Number.parseInt(
    locator
      .replace(/\(.*\)$/, "")
      .split(/[\s.]/)
      .at(-1) ?? "",
  )
}

function htmlPositionOf(html: string, wanted: string): number | undefined {
  let text = ""
  const positions: number[] = []
  for (let i = 0; i < html.length;) {
    if (html.startsWith('<sup class="nref">', i)) {
      i = html.indexOf("</sup>", i) + "</sup>".length
      continue
    }
    if (html[i] === "<") {
      i = html.indexOf(">", i) + 1
      continue
    }
    const entity = html.slice(i).match(/^&(amp|lt|gt);/)
    const char = entity
      ? { amp: "&", lt: "<", gt: ">" }[entity[1] as "amp" | "lt" | "gt"]
      : (html[i] ?? "")
    if (!(/\s/.test(char) && (text.endsWith(" ") || text === ""))) {
      text += /\s/.test(char) ? " " : char
      positions.push(i)
    }
    i += entity ? entity[0].length : 1
  }
  const found = text.indexOf(wanted)
  return found === -1 ? undefined : positions[found]
}

/** Cuts HTML at a text position, closing tags left open in the first half and reopening them in the second. */
function splitHtml(html: string, position: number): [string, string] {
  const open: string[] = []
  for (const match of html
    .slice(0, position)
    .matchAll(/<(\/?)([a-z0-9]+)[^>]*>/g)) {
    if (match[1]) open.pop()
    else if (!/^(br|img)$/.test(match[2] ?? "")) open.push(match[0])
  }
  const closing = [...open]
    .reverse()
    .map((tag) => `</${tag.match(/^<([a-z0-9]+)/)?.[1] ?? ""}>`)
  return [
    (html.slice(0, position).trimEnd() + closing.join("")).trim(),
    (open.join("") + html.slice(position)).trim(),
  ]
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function describe(correction: Correction): string {
  return `${correction.op} ${correction.locator}`
}
