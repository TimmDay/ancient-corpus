import { describe, expect, it } from "vitest"
import {
  buildIndex,
  corpusPassages,
  openCache,
  openIndex,
} from "../search/index.ts"
import {
  listWorks,
  numberedSentences,
  openCorpus,
  readPassage,
  searchCorpus,
} from "./tools.ts"

const SITE = "https://example.org"
const corpus = openCorpus()

/** A Passage read, failing the test if reading it failed. */
function read(input: Parameters<typeof readPassage>[2]) {
  const result = readPassage(corpus, SITE, input)
  if ("error" in result && result.error) throw new Error(result.error)
  return result as Exclude<typeof result, { error: string }>
}

describe("numberedSentences", () => {
  it("numbers each Sentence from 1", () => {
    expect(numberedSentences("He fell. Philip ruled.", "en")).toBe(
      "[1] He fell. [2] Philip ruled.",
    )
  })
})

describe("findWorks", () => {
  it("finds a Work by its id, title, other title or author", () => {
    for (const written of [
      "zosimus/historia-nova",
      "Historia Nova",
      "new history",
      "Zosimus",
    ])
      expect(corpus.findWorks(written).map((w) => w.slug)).toEqual([
        "zosimus/historia-nova",
      ])
  })

  it("prefers the Work with text when a title is shared", () => {
    // Festus's Breviarium is planned but has no text yet.
    expect(corpus.findWorks("Breviarium").map((w) => w.slug)).toEqual([
      "eutropius/breviarium",
    ])
  })
})

describe("readPassage", () => {
  it("reads the preferred Edition, with numbered Sentences and a reader link", () => {
    const found = read({
      work: "Zosimus",
      locator: "1.19",
    })
    expect(found).toMatchObject({ edition: "mendelssohn", language: "grc" })
    expect(found.passages[0]).toMatchObject({
      locator: "1.19",
      url: `${SITE}/zosimus/historia-nova/#1.19`,
    })
    expect(found.passages[0]?.text).toMatch(/^\[1\] /)
  })

  it("reads the Edition in the language asked for", () => {
    const found = read({
      work: "zosimus/historia-nova",
      locator: "1.19",
      lang: "en",
    })
    expect(found).toMatchObject({ edition: "green-chaplin" })
    expect(found.passages[0]?.url).toBe(
      `${SITE}/zosimus/historia-nova/green-chaplin/#1.19`,
    )
    expect(found.passages[0]?.text).toContain("Gordianus")
  })

  it("reads a range, and keeps the Sentences asked for", () => {
    const found = read({
      work: "Zosimus",
      locator: "1.18-1.19@2",
    })
    expect(found.passages.map((p) => p.locator)).toEqual(["1.18", "1.19"])
    expect(found.sentences).toEqual({ from: 2, to: 2 })
  })

  it("reads a book a page at a time", () => {
    const found = read({ work: "Zosimus", locator: "1" })
    expect(found.passages).toHaveLength(20)
    expect(found.more).toMatch(/^\d+ more Passages, from 1\.21 to 1\.\d+/)
  })

  it("says what went wrong", () => {
    expect(
      readPassage(corpus, SITE, { work: "Livy", locator: "1" }),
    ).toHaveProperty("error")
    expect(
      readPassage(corpus, SITE, { work: "Zosimus", locator: "99.1" }).error,
    ).toMatch(/Its Locators look like: 1\.1/)
    expect(
      readPassage(corpus, SITE, {
        work: "Zosimus",
        locator: "1.19",
        edition: "loeb",
      }).error,
    ).toMatch(/mendelssohn, green-chaplin/)
  })
})

describe("listWorks", () => {
  it("lists the Works with text, with their Editions", () => {
    const zosimus = listWorks(corpus).find(
      (w) => w.work === "zosimus/historia-nova",
    )
    expect(zosimus?.editions.map((e) => e.language)).toEqual(["grc", "en"])
    expect(listWorks(corpus).some((w) => w.work === "festus/breviarium")).toBe(
      false,
    )
  })
})

describe("searchCorpus", () => {
  it("gives one candidate per Passage, linking its other Editions", async () => {
    const db = openIndex(":memory:")
    await buildIndex(
      db,
      corpusPassages(corpus.works.filter((w) => w.slug.startsWith("zosimus/"))),
      undefined,
      openCache(":memory:"),
    )
    const result = await searchCorpus(corpus, db, SITE, "Gordianus Philip", {
      limit: 10,
    })
    expect(result.coverage).toEqual(["zosimus/historia-nova"])
    const keys = result.candidates.map((c) => `${c.work}#${c.locator}`)
    expect(new Set(keys).size).toBe(keys.length)
    const at119 = result.candidates.find((c) => c.locator === "1.19")
    expect(at119?.text).toMatch(/^\[1\] /)
    expect(at119?.otherEditions).toHaveLength(1)
    expect(at119?.otherEditions[0]?.url).toMatch(
      new RegExp(`^${SITE}/zosimus/historia-nova/`),
    )
  })
})
