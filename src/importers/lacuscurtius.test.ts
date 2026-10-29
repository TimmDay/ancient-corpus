import { load } from "cheerio"
import { describe, expect, it } from "vitest"
import { plainText } from "./gutenberg.ts"
import { readPage } from "./lacuscurtius.ts"

const page = `<html><body>
<h1><a id="p381"><span class="pagenum"> p381 </span></a>The Three Gordians</h1>
<p class="center"><i>(For the beginning of chapter 14, see Part 1.)</i></p>
<p class="justify"><a class="chapter" name="1">1</a><a class="sec" name="1.1">1</a>
<a href="L/x.html#1"><img alt="[Latin]"></a> It had been my plan,&#8288;<a class="ref" id="ref1" href="#note1">1</a> revered Augustus.
<a class="chapter" name="2">2</a><a class="sec" name="2.1">1</a> There were not two Gordians, but three.<a class="ref" id="ref2" href="#note2">2</a>
<a id="p383"><span class="pagenum"> p383 </span></a>He was sent to Africa as procon&shy;sul.</p>
<h3 class="center"><span class="caps">Gordian the Second.</span></h3>
<p class="justify"><a class="chapter" name="3">3</a> This was the son of the old Gordian.</p>
<hr class="endnotes"><h2>The Editor's Notes:</h2>
<p class="justify"><a class="note" id="note1" href="#ref1">1</a> Gordian I, II and III.</p>
<p class="justify"><a class="note" id="note2" href="#ref2">2</a> See note 1.</p>
</body></html>`

describe("readPage", () => {
  const { passages, notes } = readPage(load(page), "Three Gordians", 40)

  it("makes a Passage of each chapter, cutting a paragraph where one opens inside it", () => {
    expect(passages.map((p) => p.locator)).toEqual([
      "Three Gordians 1",
      "Three Gordians 2",
      "Three Gordians 3",
    ])
    expect(plainText(passages[1]?.blocks.join(" ") ?? "")).toBe(
      "There were not two Gordians, but three. He was sent to Africa as proconsul.",
    )
    expect(passages[1]?.blocks.join(" ")).toContain('id="r-41"')
  })

  it("drops section numbers, page numbers, links to the other language and the continuation note", () => {
    expect(passages[0]?.blocks).toHaveLength(1)
    expect(plainText(passages[0]?.blocks[0] ?? "")).toBe(
      "It had been my plan, revered Augustus.",
    )
    expect(passages[0]?.blocks[0]).toContain('id="r-40"')
  })

  it("keeps a heading inside the Life for the chapter after it", () => {
    expect(passages[2]?.headings).toEqual([
      { kind: "section", html: "Gordian the Second.", editorial: false },
    ])
  })

  it("numbers notes on from where the last page stopped", () => {
    expect([...notes.entries()]).toEqual([
      ["40", "Gordian I, II and III."],
      ["41", "See note 1."],
    ])
  })
})
