import { describe, expect, it } from "vitest"
import {
  buildIndex,
  openCache,
  openIndex,
  piecesOf,
  type IndexedPassage,
} from "./index.ts"
import { variantsOf } from "./names.ts"
import type { Embed } from "./ollama.ts"
import { keywordQuery, search } from "./search.ts"

const passage = (
  locator: string,
  text: string,
  language = "en",
): IndexedPassage => ({
  work: "anonymous/historia-augusta",
  author: "Unknown",
  title: "Historia Augusta",
  edition: language === "la" ? "magie-latin" : "magie",
  language,
  locator,
  division: locator.replace(/ \d+$/, ""),
  url: `/anonymous/historia-augusta/#${encodeURIComponent(locator)}`,
  draft: false,
  text,
})

const passages = [
  passage("Two Valerians 1", "Sapori regi regum vel soli", "la"),
  passage("Two Valerians 3", "Artavasdes sent a letter to Sapor"),
  passage("Three Gordians 30", "Philip became emperor in this unholy manner"),
  passage("Aurelian 25", "The emperor fought Zenobia near Emesa"),
]

/** A stand-in for BGE-M3: one dimension per topic word, so meaning is easy to fake. */
const fakeEmbed: Embed = async (texts) =>
  texts.map((t) => {
    const v = Float32Array.from(
      ["persia", "zenobia", "philip"].map((w) =>
        t.toLowerCase().includes(w) || (w === "persia" && /sapor/i.test(t))
          ? 1
          : 0,
      ),
    )
    const length = Math.hypot(...v) || 1
    return v.map((x) => x / length)
  })

describe("names", () => {
  it("widens any form of a name to all of them", () => {
    expect(variantsOf("Shapur")).toEqual(["shapur", "sapor", "sabuhr", "σαπωρ"])
    expect(variantsOf("Σαπώρης")).toContain("sapor")
    expect(variantsOf("Zenobia")).toEqual(["zenobia"])
  })

  it("builds a prefix query that drops common words", () => {
    expect(keywordQuery("What did Shapur do?")).toBe(
      '"shapur"* OR "sapor"* OR "sabuhr"* OR "σαπωρ"*',
    )
  })
})

describe("search", () => {
  it("finds every form of a name, in any Edition, and says what was searched", async () => {
    const db = openIndex(":memory:")
    await buildIndex(db, passages)
    const result = await search(db, "What did Shapur write?")
    expect(result.candidates.map((c) => c.locator).sort()).toEqual([
      "Two Valerians 1",
      "Two Valerians 3",
    ])
    expect(result.candidates[0]?.matchedBy).toEqual(["keyword"])
    expect(result.coverage).toEqual(["anonymous/historia-augusta"])
    expect(result.semantic).toBe(false)
  })

  it("adds Passages close in meaning, and ranks those both halves find first", async () => {
    const db = openIndex(":memory:")
    await buildIndex(db, passages, fakeEmbed, openCache(":memory:"))
    const result = await search(db, "Sapor and Persia", { embed: fakeEmbed })
    expect(result.semantic).toBe(true)
    expect(result.candidates[0]?.matchedBy.sort()).toEqual([
      "keyword",
      "semantic",
    ])
    const zenobia = await search(db, "the queen of Palmyra Zenobia", {
      embed: fakeEmbed,
    })
    expect(zenobia.candidates[0]?.locator).toBe("Aurelian 25")
  })

  it("embeds only text the cache has not seen", async () => {
    const cache = openCache(":memory:")
    let embedded = 0
    const counting: Embed = async (texts) => {
      embedded += texts.length
      return fakeEmbed(texts)
    }
    await buildIndex(openIndex(":memory:"), passages, counting, cache)
    await buildIndex(openIndex(":memory:"), passages, counting, cache)
    expect(embedded).toBe(passages.length)
  })
})

describe("piecesOf", () => {
  it("splits a long Passage into overlapping pieces and keeps a short one whole", () => {
    expect(piecesOf("one two")).toEqual(["one two"])
    const long = Array.from({ length: 450 }, (_, i) => `w${i}`).join(" ")
    const pieces = piecesOf(long)
    expect(pieces).toHaveLength(3)
    expect(pieces[1]?.startsWith("w160 ")).toBe(true)
  })
})
