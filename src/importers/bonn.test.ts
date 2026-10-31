import { describe, expect, it } from "vitest"
import { pagesOfLeaves, splitScripts } from "./bonn.ts"

const page = (leafNum: number, pageNumber: string, confidence = 100) => ({
  leafNum,
  pageNumber,
  confidence,
})

describe("pagesOfLeaves", () => {
  it("counts on between confident readings that agree", () => {
    const pages = pagesOfLeaves({
      pages: [page(10, "1"), page(11, "", 0), page(12, "3")],
    })
    expect([...pages]).toEqual([
      [10, 1],
      [11, 2],
      [12, 3],
    ])
  })

  it("leaves out a leaf between readings that disagree (a plate)", () => {
    const pages = pagesOfLeaves({
      pages: [page(10, "1"), page(11, "", 0), page(12, "2")],
    })
    expect([...pages]).toEqual([
      [10, 1],
      [12, 2],
    ])
  })

  it("ignores an unsure reading, and a page read twice keeps its first leaf", () => {
    const pages = pagesOfLeaves({
      pages: [page(10, "1"), page(11, "7", 20), page(12, "2"), page(13, "2")],
    })
    expect([...pages]).toEqual([
      [10, 1],
      [12, 2],
    ])
  })
})

describe("splitScripts", () => {
  it("cuts a block where the Greek gives way to the Latin below it", () => {
    const greek =
      "Μετὰ τοῦτον ἐβασίλευσε Γορδιανὸς ὁ υἱὸς αὐτοῦ ἔτη δ΄. καὶ ἐν πολέμῳ συμπεσὼν τῷ ἵππῳ καὶ θλασθεὶς τὸν μηρὸν ἀπέθανε."
    const latin =
      "Post hunc filius eius Gordianus imperavit annos 4. in bello cum equo corruens, fracto femore mortuus est."
    expect(splitScripts(`${greek} ${latin}`)).toEqual([greek, latin])
  })

  it("keeps a block in one script whole, misread words and all", () => {
    const block =
      "ὃς διὰ τὰς ἀκαθαρσίας xal μιαρίας xal ἀκολασίας αὐτοῦ ἐσφάγη, κακῶς τὸ ζῆν ἀπορρήξας, καὶ τὸν Ὠριγένην"
    expect(splitScripts(block)).toEqual([block])
  })
})
