import { describe, expect, it } from "vitest"
import {
  aliasKey,
  locatorId,
  locatorTokens,
  resolveLocator,
  resolvedTargets,
  type LocatorIndex,
} from "./locator.ts"

function indexOf(
  locators: string[],
  aliases: Record<string, string> = {},
): LocatorIndex {
  return {
    targets: locators.map((locator) => ({ locator, id: locatorId(locator) })),
    aliases: Object.fromEntries(
      Object.entries(aliases).map(([from, to]) => [aliasKey(from), to]),
    ),
  }
}

const eutropius = indexOf([
  "9",
  "9.8",
  "9.9",
  "9.10",
  "9.11",
  "10",
  "10.1",
  "10.2",
])
const suetonius = indexOf(
  [
    "Augustus",
    "Augustus 4",
    "Augustus 5",
    "Augustus 6",
    "Caligula",
    "Caligula 8",
  ],
  {
    Gaius: "Caligula",
  },
)

function landsOn(written: string, index: LocatorIndex) {
  const resolution = resolveLocator(written, index)
  return resolution.kind === "found"
    ? {
        start: resolution.start.locator,
        end: resolution.end?.locator,
        exact: resolution.exact,
      }
    : "not-found"
}

describe("locatorId", () => {
  it("keeps dotted Locators and joins words with a hyphen", () => {
    expect(locatorId("9.9")).toBe("9.9")
    expect(locatorId("Augustus 5")).toBe("Augustus-5")
  })
})

describe("locatorTokens", () => {
  it("drops 'Life of', case, commas and diacritics", () => {
    expect(locatorTokens("Life of Augustus, 5")).toEqual(["augustus", "5"])
    expect(locatorTokens("Life of the Three Gordians 23.4")).toEqual([
      "three",
      "gordians",
      "23",
      "4",
    ])
    expect(locatorTokens("Nōnus 3")).toEqual(["nonus", "3"])
  })

  it("reads Roman numerals as numbers only where they can't be a name", () => {
    expect(locatorTokens("IX.9")).toEqual(["9", "9"])
    expect(locatorTokens("Augustus V")).toEqual(["augustus", "5"])
    expect(locatorTokens("Vitellius 3")).toEqual(["vitellius", "3"])
  })
})

describe("resolveLocator", () => {
  it("finds a canonical Locator exactly", () => {
    expect(landsOn("9.9", eutropius)).toEqual({
      start: "9.9",
      end: undefined,
      exact: true,
    })
    expect(landsOn("Augustus 5", suetonius)).toEqual({
      start: "Augustus 5",
      end: undefined,
      exact: true,
    })
  })

  // Spellings taken from real somnus-data-ingestion citations
  it("accepts the ways somnus writes Locators today", () => {
    expect(landsOn("Life of Augustus, 5", suetonius)).toMatchObject({
      start: "Augustus 5",
      exact: true,
    })
    expect(landsOn("Life%20of%20Caligula%2C%208", suetonius)).toMatchObject({
      start: "Caligula 8",
    })
    expect(landsOn("#9.9", eutropius)).toMatchObject({ start: "9.9" })
  })

  it("resolves abbreviated ranges with an en dash or a hyphen", () => {
    expect(landsOn("9.9–10", eutropius)).toEqual({
      start: "9.9",
      end: "9.10",
      exact: true,
    })
    expect(landsOn("9.9-11", eutropius)).toEqual({
      start: "9.9",
      end: "9.11",
      exact: true,
    })
    expect(landsOn("Augustus 4 - 6", suetonius)).toEqual({
      start: "Augustus 4",
      end: "Augustus 6",
      exact: true,
    })
    expect(landsOn("9.10–10.2", eutropius)).toEqual({
      start: "9.10",
      end: "10.2",
      exact: true,
    })
  })

  it("falls back to the nearest enclosing target when the Locator is more precise than the Edition", () => {
    expect(landsOn("9.9.2", eutropius)).toEqual({
      start: "9.9",
      end: undefined,
      exact: false,
    })
    expect(landsOn("9.99", eutropius)).toEqual({
      start: "9",
      end: undefined,
      exact: false,
    })
    expect(landsOn("Augustus 200", suetonius)).toMatchObject({
      start: "Augustus",
      exact: false,
    })
  })

  it("applies the Work's Locator aliases", () => {
    expect(landsOn("Gaius 8", suetonius)).toMatchObject({
      start: "Caligula 8",
      exact: true,
    })
    expect(landsOn("Life of Gaius, 8", suetonius)).toMatchObject({
      start: "Caligula 8",
    })
  })

  it("tells a restarted run of chapters apart by its bracketed name", () => {
    const dio = indexOf([
      "80",
      "80.1",
      "80.2",
      "80(Alexander)",
      "80.1(Alexander)",
    ])
    expect(landsOn("80.1", dio)).toEqual({ start: "80.1", exact: true })
    for (const written of [
      "80.1(Alexander)",
      "80.1 (Alexander)",
      "80.1%20(alexander)",
    ]) {
      expect(landsOn(written, dio)).toEqual({
        start: "80.1(Alexander)",
        exact: true,
      })
    }
    expect(landsOn("80.1.2(Alexander)", dio)).toEqual({
      start: "80.1(Alexander)",
      exact: false,
    })
    expect(landsOn("80 (Alexander)", dio)).toEqual({
      start: "80(Alexander)",
      exact: true,
    })
  })

  it("offers the other readings when a link leaves out the bracketed name", () => {
    const dio = indexOf(["80", "80.1", "80(Alexander)", "80.1(Alexander)"])
    const alternativesOf = (written: string) => {
      const resolution = resolveLocator(written, dio)
      return resolution.kind === "found"
        ? (resolution.alternatives ?? []).map((t) => t.locator)
        : []
    }
    expect(alternativesOf("80.1")).toEqual(["80.1(Alexander)"])
    expect(alternativesOf("80.1.2")).toEqual(["80.1(Alexander)"])
    expect(alternativesOf("80")).toEqual(["80(Alexander)"])
    expect(alternativesOf("80.1(Alexander)")).toEqual([])
    expect(alternativesOf("9.9")).toEqual([])
  })

  it("reports Locators that match nothing", () => {
    expect(landsOn("Thirty Tyrants 12", suetonius)).toBe("not-found")
    expect(landsOn("", suetonius)).toBe("not-found")
    expect(landsOn("%E0%A4%A", eutropius)).toBe("not-found")
  })
})

describe("resolvedTargets", () => {
  it("lists every target a range covers, in document order", () => {
    const resolution = resolveLocator("9.9–11", eutropius)
    expect(
      resolvedTargets(resolution, eutropius).map((t) => t.locator),
    ).toEqual(["9.9", "9.10", "9.11"])
  })
})
