import { describe, expect, it } from "vitest"
import type { ImportedEdition, Passage } from "./corpus.ts"
import { correctEdition, type Correction } from "./corrections.ts"
import { plainText } from "./importers/gutenberg.ts"

function passage(locator: string, ...blocks: string[]): Omit<Passage, "flags"> {
  return {
    locator,
    headings: [],
    division: locator.split(" ")[0] ?? "",
    blocks,
    notes: [],
    text: plainText(blocks.join(" ")),
  }
}

function edition(...passages: Omit<Passage, "flags">[]): ImportedEdition {
  return { divisions: [], passages, editorial: [] }
}

function locators(corrections: Correction[], imported: ImportedEdition) {
  return correctEdition(imported, corrections).passages.map((p) => [
    p.locator,
    p.text,
  ])
}

describe("Flags", () => {
  it("flags the Passage before a missing number", () => {
    const text = correctEdition(
      edition(passage("Julius 1", "a"), passage("Julius 3", "c")),
      [],
    )
    expect(text.passages[0]?.flags).toEqual([
      { code: "gap", detail: "The next Passage is numbered 3, not 2" },
    ])
  })

  it("settles a Flag with an accept Correction, and refuses one that no longer matches", () => {
    const imported = edition(passage("Julius 1", "a"), passage("Julius 3", "c"))
    const accept: Correction = {
      op: "accept",
      locator: "Julius 1",
      flag: "gap",
      reason: "Chapter 2 is lost",
    }
    expect(
      correctEdition(imported, [accept]).passages[0]?.flags[0]?.accepted,
    ).toBe("Chapter 2 is lost")
    expect(() =>
      correctEdition(imported, [{ ...accept, locator: "Julius 3" }]),
    ).toThrow(/no such Flag/)
  })
})

describe("Corrections", () => {
  it("splits a Passage at quoted text inside a paragraph, keeping open tags balanced", () => {
    const imported = edition(
      passage("Julius 1", "First <i>chapter. II. Second</i> chapter."),
    )
    const text = correctEdition(imported, [
      {
        op: "split",
        locator: "Julius 1",
        at: "II. Second",
        newLocator: "Julius 2",
      },
    ])
    expect(text.passages.map((p) => p.blocks)).toEqual([
      ["First <i>chapter.</i>"],
      ["<i>II. Second</i> chapter."],
    ])
    expect(text.passages[0]?.flags).toEqual([])
  })

  it("splits between paragraphs and ignores note numbers when matching", () => {
    const imported = edition(
      passage(
        "Julius 1",
        "One.",
        'Two<sup class="nref"><a href="#n-4" id="r-4">4</a></sup> more.',
      ),
    )
    expect(
      locators(
        [
          {
            op: "split",
            locator: "Julius 1",
            at: "Two more",
            newLocator: "Julius 2",
          },
        ],
        imported,
      ),
    ).toEqual([
      ["Julius 1", "One."],
      ["Julius 2", "Two more."],
    ])
  })

  it("moves an appended essay into Editorial matter", () => {
    const imported = edition(
      passage(
        "Augustus 1",
        "The last chapter.",
        "Of the reign of Augustus, the translator says...",
      ),
    )
    const text = correctEdition(imported, [
      {
        op: "toEditorial",
        locator: "Augustus 1",
        at: "Of the reign",
        title: "Translator’s essay on Augustus",
      },
    ])
    expect(text.passages[0]?.text).toBe("The last chapter.")
    expect(text.editorial[0]).toMatchObject({
      title: "Translator’s essay on Augustus",
    })
  })

  it("merges, replaces and renumbers", () => {
    const imported = edition(
      passage("Nero 1", "a"),
      passage("Nero 2", "b"),
      passage("Nero 4", "typo"),
    )
    expect(
      locators(
        [
          { op: "merge", locator: "Nero 2" },
          { op: "replace", locator: "Nero 4", find: "typo", with: "fixed" },
          { op: "renumber", locator: "Nero 4", newLocator: "Nero 2" },
        ],
        imported,
      ),
    ).toEqual([
      ["Nero 1", "a b"],
      ["Nero 2", "fixed"],
    ])
  })

  it("fails loudly when quoted text has gone", () => {
    const imported = edition(passage("Nero 1", "a b"))
    expect(() =>
      correctEdition(imported, [
        { op: "split", locator: "Nero 1", at: "zzz", newLocator: "Nero 2" },
      ]),
    ).toThrow(/quoted text not found/)
  })
})
