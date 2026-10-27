import { describe, expect, it } from "vitest"
import { matchWork, type WorkListing } from "./works-index.ts"

const works: WorkListing[] = [
  {
    slug: "eutropius/breviarium",
    author: "Eutropius",
    title: "Breviarium historiae Romanae",
    otherTitles: ["Breviarium"],
    editions: ["hazzard-1898"],
    preferredEdition: "hazzard-1898",
  },
  {
    slug: "suetonius/de-vita-caesarum",
    author: "Suetonius",
    title: "De Vita Caesarum",
    otherTitles: ["The Twelve Caesars"],
    editions: ["thomson-forester"],
    preferredEdition: "thomson-forester",
  },
  {
    slug: "anonymous/historia-augusta",
    author: "Unknown",
    title: "Historia Augusta",
    otherTitles: [],
    editions: [],
    preferredEdition: "",
  },
]

describe("matchWork", () => {
  it("matches the exact author and title", () => {
    expect(
      matchWork(works, "Eutropius", "Breviarium historiae Romanae")?.slug,
    ).toBe("eutropius/breviarium")
  })

  it("ignores case, accents and a leading 'The', and accepts other titles and slugs", () => {
    expect(matchWork(works, "suetonius", "Twelve Caesars")?.slug).toBe(
      "suetonius/de-vita-caesarum",
    )
    expect(matchWork(works, "Eutropius", "breviarium")?.slug).toBe(
      "eutropius/breviarium",
    )
    expect(matchWork(works, "Anonymous", "Historia Augusta")?.slug).toBe(
      "anonymous/historia-augusta",
    )
  })

  it("accepts an author alone only when the author has one Work", () => {
    expect(matchWork(works, "Eutropius", "")?.slug).toBe("eutropius/breviarium")
  })

  it("does not guess", () => {
    expect(matchWork(works, "Eutropius", "Historia Augusta")).toBeUndefined()
    expect(matchWork(works, "Tacitus", "Annals")).toBeUndefined()
  })
})
