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

  it("numbers a bracketed run on its own: a restarted book counts from 1, an epitome sits outside", () => {
    const inDivision = (division: string, locator: string) => ({
      ...passage(locator, "x"),
      division,
    })
    const text = correctEdition(
      edition(
        inDivision("80", "80.1"),
        inDivision("80", "80.11(epitome)"),
        inDivision("80", "80.2"),
        inDivision("80(Alexander)", "80.1(Alexander)"),
        inDivision("80(Alexander)", "80.2(Alexander)"),
      ),
      [],
    )
    expect(text.passages.flatMap((p) => p.flags)).toEqual([])
  })

  it("reads a lettered chapter as part of the run, not a gap", () => {
    const text = correctEdition(
      edition(
        { ...passage("55.1", "a"), division: "55" },
        { ...passage("55.2", "a"), division: "55" },
        { ...passage("55.3", "b"), division: "55" },
        { ...passage("55.3a", "c"), division: "55" },
        { ...passage("55.4", "d"), division: "55" },
      ),
      [],
    )
    expect(text.passages.flatMap((p) => p.flags)).toEqual([])
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

  it("matches quoted text as the plain text reads, without the space a transcription leaves before punctuation", () => {
    const imported = edition(
      passage(
        "2.29",
        "He was put to death. He engaged in no more wars ; and even so.",
      ),
    )
    const text = correctEdition(imported, [
      {
        op: "split",
        locator: "2.29",
        at: "He engaged in no more wars; and",
        newLocator: "2.30",
      },
    ])
    expect(text.passages.map((p) => p.blocks)).toEqual([
      ["He was put to death."],
      ["He engaged in no more wars ; and even so."],
    ])
  })

  it("matches quoted text across a line break in verse, and leaves no break dangling", () => {
    const text = correctEdition(
      edition(
        passage("13.1", "And fights, homicides,<br>And battles did<br>Arise."),
      ),
      [
        {
          op: "split",
          locator: "13.1",
          at: "homicides, And battles",
          newLocator: "13.13",
        },
      ],
    )
    expect(text.passages.map((p) => p.blocks)).toEqual([
      ["And fights,"],
      ["homicides,<br>And battles did<br>Arise."],
    ])
    const between = correctEdition(
      edition(passage("13.1", "One verse.<br>Another verse.")),
      [{ op: "split", locator: "13.1", at: "Another", newLocator: "13.2" }],
    )
    expect(between.passages.map((p) => p.blocks)).toEqual([
      ["One verse."],
      ["Another verse."],
    ])
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

  it("removes a Passage moved whole into Editorial matter", () => {
    const text = correctEdition(
      edition(
        passage("8.217", "Ἱδρώσει δὲ χθών"),
        passage("8.222", "Iudicii signum tellus sudore madescet."),
      ),
      [
        {
          op: "toEditorial",
          locator: "8.222",
          at: "Iudicii signum",
          title: "Augustine’s Latin version",
        },
      ],
    )
    expect(text.passages.map((p) => p.locator)).toEqual(["8.217"])
    expect(text.editorial[0]?.html).toBe(
      "<p>Iudicii signum tellus sudore madescet.</p>",
    )
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

  it("restores dropped paragraphs with a replace", () => {
    const imported = edition(passage("Nero 1", "one and the four"))
    const text = correctEdition(imported, [
      {
        op: "replace",
        locator: "Nero 1",
        find: "and the four",
        with: "and the two.\n\nThree and the four",
      },
    ])
    expect(text.passages[0]?.blocks).toEqual([
      "one and the two.",
      "Three and the four",
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

describe("duplicate Locators", () => {
  it("flags the later Passage, and a renumber with quoted text picks it out", () => {
    const imported = edition(
      passage("Nero 1", "first"),
      passage("Nero 1", "second"),
      passage("Nero 3", "third"),
    )
    expect(
      correctEdition(imported, []).passages.map((p) =>
        p.flags.map((f) => f.code),
      ),
    ).toEqual([[], ["duplicate"], []])
    const fixed = correctEdition(imported, [
      { op: "renumber", locator: "Nero 1", at: "second", newLocator: "Nero 2" },
    ])
    expect(
      fixed.passages.map((p) => [p.locator, p.text, p.flags.length]),
    ).toEqual([
      ["Nero 1", "first", 0],
      ["Nero 2", "second", 0],
      ["Nero 3", "third", 0],
    ])
  })

  it("merges the one a quote picks out", () => {
    const imported = edition(
      passage("Nero 1", "first"),
      passage("Nero 2", "second"),
      passage("Nero 1", "stray"),
      passage("Nero 3", "third"),
    )
    expect(
      locators([{ op: "merge", locator: "Nero 1", at: "stray" }], imported),
    ).toEqual([
      ["Nero 1", "first"],
      ["Nero 2", "second stray"],
      ["Nero 3", "third"],
    ])
  })
})

describe("Passages printed out of number order", () => {
  it("moves a Passage to where the source prints it, and resumes an interrupted one", () => {
    const imported = edition(
      passage("Nero 1", "a1", "a2"),
      passage("Nero 2", "b"),
      passage("Nero 3", "c"),
    )
    const text = correctEdition(imported, [
      { op: "split", locator: "Nero 1", at: "a2", newLocator: "Nero 1" },
      { op: "resume", locator: "Nero 1", at: "a2" },
      { op: "move", locator: "Nero 3", after: "Nero 1" },
    ])
    expect(
      text.passages.map((p) => [p.locator, p.text, p.resumes ?? false]),
    ).toEqual([
      ["Nero 1", "a1", false],
      ["Nero 3", "c", false],
      ["Nero 1", "a2", true],
      ["Nero 2", "b", false],
    ])
    // Neither the resumed part nor the printed order is a duplicate or a gap.
    expect(text.passages.flatMap((p) => p.flags)).toEqual([])
  })

  it("still flags a number missing from the whole division", () => {
    const text = correctEdition(
      edition(
        passage("Nero 1", "a"),
        passage("Nero 4", "d"),
        passage("Nero 2", "b"),
      ),
      [],
    )
    expect(text.passages.flatMap((p) => p.flags)).toEqual([
      { code: "gap", detail: "The next Passage is numbered 4, not 3" },
    ])
  })

  it("refuses to resume a Passage with no earlier part", () => {
    expect(() =>
      correctEdition(edition(passage("Nero 1", "a")), [
        { op: "resume", locator: "Nero 1", at: "a" },
      ]),
    ).toThrow(/no earlier part/)
  })
})
