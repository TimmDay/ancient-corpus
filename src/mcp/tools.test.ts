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

  it("finds a Work by its author's surname", () => {
    expect(corpus.findWorks("Zonaras").map((w) => w.slug)).toEqual([
      "john-zonaras/epitome-historiarum",
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
    if (!("candidates" in result)) throw new Error(result.error)
    // Built without vectors, so the search says it used keywords only.
    expect(result.warning).toMatch(/^Keyword search only/)
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

  it("counts only Works with text, and names those the index has not caught up with", async () => {
    const db = openIndex(":memory:")
    const zosimus = corpus.works.filter((w) => w.slug.startsWith("zosimus/"))
    await buildIndex(
      db,
      [
        ...corpusPassages(zosimus),
        // A Work since removed from the corpus.
        { ...corpusPassages(zosimus)[0]!, work: "gone/work" },
      ],
      undefined,
      openCache(":memory:"),
    )
    const result = await searchCorpus(corpus, db, SITE, "Gordianus", {})
    if (!("candidates" in result)) throw new Error(result.error)
    expect(result.coverage).toEqual(["zosimus/historia-nova"])
    expect(result.warning).toMatch(
      /Not searched, because the index is older than the corpus: .*eutropius\/breviarium.*Run pnpm index\./,
    )
  })

  it("says when there is no index to search", async () => {
    const result = await searchCorpus(
      corpus,
      openIndex(":memory:"),
      SITE,
      "Gordian",
      {},
    )
    expect(result).toEqual({
      error: "The search index is empty. Run pnpm index in the checkout.",
    })
  })
})
