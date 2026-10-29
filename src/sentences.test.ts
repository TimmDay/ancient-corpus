import { describe, expect, it } from "vitest"
import { hasEditionText, loadWorks, readEditionText } from "./corpus.ts"
import { sentenceSpans, splitSentenceRef } from "./sentences.ts"

const sentences = (text: string, language = "en") =>
  sentenceSpans(text, language).map(({ start, end }) => text.slice(start, end))

describe("sentenceSpans", () => {
  it("splits at a stop and a space, whatever the case of the next word (Magie's Latin)", () => {
    expect(
      sentences(
        "conquestus est, sperans imperium abrogari. sed hac conquestione nihil egit. et cum milites rogasset?",
        "la",
      ),
    ).toEqual([
      "conquestus est, sperans imperium abrogari.",
      "sed hac conquestione nihil egit.",
      "et cum milites rogasset?",
    ])
  })

  it("does not split after an initial, an abbreviation or before a number", () => {
    expect(
      sentences(
        "Sex. Iulio Caesare et L. Marcio cos. bellum fuit. Mox pax.",
        "la",
      ),
    ).toEqual(["Sex. Iulio Caesare et L. Marcio cos. bellum fuit.", "Mox pax."])
    expect(
      sentences("In 238. 2 years later, see c. xiv.2 for this. It is untrue."),
    ).toHaveLength(2)
  })

  it("keeps closing quotes with their sentence and folds a leading ellipsis into the next", () => {
    expect(sentences('. . . to Sapor: "Did I but know." He wrote.')).toEqual([
      '. . . to Sapor: "Did I but know."',
      "He wrote.",
    ])
  })
})

describe("splitSentenceRef", () => {
  it("reads a Sentence or a run of them after @", () => {
    expect(splitSentenceRef("9.2@3")).toEqual({
      locator: "9.2",
      sentences: { from: 3, to: 3 },
    })
    expect(splitSentenceRef("Three Gordians 30@3-7")).toEqual({
      locator: "Three Gordians 30",
      sentences: { from: 3, to: 7 },
    })
    expect(splitSentenceRef("9.9-10")).toEqual({ locator: "9.9-10" })
  })
})

describe("every Edition's Sentence counts", () => {
  // A link such as `9.2@3` points at a Sentence number, so a change to the
  // splitter that moves any count must be seen and meant: update with `vitest -u`.
  it("match the committed snapshot", async () => {
    const counts: Record<string, Record<string, number>> = {}
    for (const work of loadWorks())
      // An unpublished Edition's text is only on the machine that imported it.
      for (const edition of work.editions.filter(
        (e) => hasEditionText(work, e) && !e.unpublished,
      )) {
        const byLocator: Record<string, number> = {}
        for (const p of readEditionText(work, edition).passages)
          byLocator[p.locator] =
            (byLocator[p.locator] ?? 0) +
            sentenceSpans(p.text, edition.language).length
        counts[`${work.slug}/${edition.slug}`] = byLocator
      }
    await expect(JSON.stringify(counts, null, 1)).toMatchFileSnapshot(
      "./__snapshots__/sentence-counts.json",
    )
  })
})
