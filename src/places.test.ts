import { describe, expect, it } from "vitest"
import { cutSnapshot, parseCsv, parseExtent, type Place } from "./places.ts"

const PLACES = `id,title,bbox,extent,locationPrecision,featureTypes,timePeriodsKeys,minDate,maxDate,reprLat,reprLong,description
893976,Ctesiphon,"44.580717, 33.093563, 44.581919, 33.096964","{""type"": ""Polygon"", ""coordinates"": [[[44.58, 33.09], [44.58, 33.1], [44.59, 33.1], [44.58, 33.09]]]}",precise,"urban, settlement","roman,late-antique",-540,2000,33.094703,44.5812226667,"An imperial capital,
on the Tigris"
981534,Mesopotamia,"35.0, 35.0, 40.0, 40.0","{""type"": ""Polygon"", ""coordinates"": [[[35.0, 35.0, 0.0], [35.0, 40.0, NaN], [35.0, 40.0, 0.0], [40.0, 40.0, 0.0], [40.0, 35.0, 0.0], [35.0, 35.0, 0.0]]]}",rough,province,,,,37.5,37.5,
1001,Lost Town,,,unlocated,settlement,roman,,,,,
`

const NAMES = `pid,nameAttested,nameTransliterated,nameLanguage
/places/893976,,Ctesiphon,
/places/893976,Κτησιφῶν,"Ktēsiphōn, Ktesiphon",grc
/places/893976,,Ctesiphon,
`

const lines = (text: string) =>
  text
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Place)

describe("parseCsv", () => {
  it("reads quoted fields holding commas, doubled quotes and line breaks", () => {
    const rows = parseCsv('a,b\n"x, ""y""","line\none"\n')
    expect(rows).toEqual([{ a: 'x, "y"', b: "line\none" }])
  })
})

describe("cutSnapshot", () => {
  const places = lines(cutSnapshot(PLACES, NAMES))

  it("keeps every Place, in ID order", () => {
    expect(places.map((p) => p.id)).toEqual([
      "pleiades:1001",
      "pleiades:893976",
      "pleiades:981534",
    ])
  })

  it("gives a located Place a [lng, lat] point and its names, once each", () => {
    const ctesiphon = places.find((p) => p.title === "Ctesiphon")
    expect(ctesiphon).toMatchObject({
      point: [44.5812, 33.0947],
      precision: "precise",
      types: ["settlement", "urban"],
      periods: ["late-antique", "roman"],
      start: -540,
      end: 2000,
      names: [
        ["Ctesiphon", ""],
        ["Ktesiphon", "grc"],
        ["Ktēsiphōn", "grc"],
        ["Κτησιφῶν", "grc"],
      ],
    })
    // A city is a pin, so its tiny outline is not kept.
    expect(ctesiphon?.extent).toBeUndefined()
  })

  it("keeps an Unlocated place, with no point", () => {
    expect(places.find((p) => p.title === "Lost Town")).toMatchObject({
      precision: "unlocated",
      point: null,
      bbox: null,
    })
  })

  it("keeps a province's outline, flat and without unusable vertices", () => {
    expect(places.find((p) => p.title === "Mesopotamia")?.extent).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [35, 35],
          [35, 40],
          [40, 40],
          [40, 35],
          [35, 35],
        ],
      ],
    })
  })

  it("cuts the same snapshot from the same dump", () => {
    expect(cutSnapshot(PLACES, NAMES)).toBe(cutSnapshot(PLACES, NAMES))
  })
})

describe("parseExtent", () => {
  it("gives up on an outline with too few usable vertices", () => {
    expect(
      parseExtent(
        '{"type": "Polygon", "coordinates": [[[1, 1], [NaN, 2], [1, 1]]]}',
      ),
    ).toBeUndefined()
  })
})
