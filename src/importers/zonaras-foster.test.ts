import { load } from "cheerio"
import { describe, expect, it } from "vitest"
import { readZonarasFoster } from "./zonaras-foster.ts"

describe("readZonarasFoster", () => {
  it("cuts Foster's Zonaras at every chapter mark and stops before Dio's fragments", () => {
    const html = `<body>
<h3> <i>(BOOK 1, BOISSEVAIN.)</i></h3>
<p><span class="sidenote"><span class="smcap">Frag.</span> 1</span>VII, 1.—Æneas came.<a id="FNanchor_1_1"></a><a class="fnanchor" href="#Footnote_1_1">[1]</a></p>
<p>More of 7.1.</p>
<h3> <i>(BOOK 2, BOISSEVAIN.)</i></h3>
<p><span class="sidenote">B.C. 672<br>(<i>a.u.</i> 82)</span>IX, 30.—The harbour. <span class="smcap">a fragment</span> ends. IX, 31.—Corinth falls.<span class="pagenum">[Pg 9]</span></p>
<hr>
<p>Foster's note on the fragments.</p>
<h3> <i>(BOOK 22, BOISSEVAIN.)</i></h3>
<p>Viriathus.</p>
<div class="footnote"><p><a id="Footnote_1_1"></a><a href="#FNanchor_1_1">[1]</a> A note.</p></div>
</body>`
    const edition = readZonarasFoster(load(html))
    expect(edition.divisions.map((d) => d.locator)).toEqual(["7", "9"])
    expect(edition.passages.map((p) => [p.locator, p.text])).toEqual([
      ["7.1", "Æneas came. More of 7.1."],
      ["9.30", "The harbour. a fragment ends."],
      ["9.31", "Corinth falls."],
    ])
    const [first, second] = edition.passages
    expect(first?.headings.map((h) => h.html)).toEqual([
      "Book 7",
      "Dio, Book 1 (Boissevain)",
    ])
    expect(first?.notes).toEqual([{ id: "1", html: "A note." }])
    expect(second?.headings.map((h) => h.html)).toEqual([
      "Book 9",
      "Dio, Book 2 (Boissevain)",
      "B.C. 672 (<i>a.u.</i> 82)",
    ])
  })
})
