import { load } from "cheerio"
import { describe, expect, it } from "vitest"
import { readSidenoteVolume } from "./dio.ts"

const wrap = (html: string) => `<div class="pg_body_wrapper">${html}</div>`
const BREAK = wrap("<br>") + wrap("<br>")

describe("readSidenoteVolume", () => {
  it("reads volume 5's run of divs into Passages, footnotes and Book 72", () => {
    const html = `<body>
<div class="book"><a id="b71"></a>DIO'S ROMAN HISTORY<div class="bignum">71</div></div>
<div class="menu">Marcus succeeds (chapter 1).<br><br>War (chapter 2).</div>
<div class="rsidenote">A.D. 161</div>
<div class="lsidenote">1 </div>${wrap('<a id="a71_1"></a>')}${wrap("Marcus, the philo")}${wrap("sopher, ruled")}${wrap(" well. [")}${wrap('<a href="#foot1">1</a>')}${wrap("]")}
${BREAK}${wrap("A second paragraph--with a dash.")}
<div class="lsidenote">2 </div>${wrap("Chapter two.")}
<div class="lsidenote">3 </div>${wrap("Chapter three, in Book 72.")}
<h2>FOOTNOTES</h2><div class="foot"><a id="foot1"></a><b>Footnote 1</b>: A <i>note</i>.<br><br></div>
</body>`
    const volume = readSidenoteVolume(load(html), 7)
    expect(volume.divisions.map((d) => d.locator)).toEqual(["71", "72"])
    expect(volume.divisions[0]?.summary).toBe(
      "<p>Marcus succeeds (chapter 1).</p><p>War (chapter 2).</p>",
    )
    expect(volume.passages.map((p) => [p.locator, p.division])).toEqual([
      ["71.1", "71"],
      ["71.2", "71"],
      ["72.3", "72"],
    ])
    const [first, , third] = volume.passages
    expect(first?.headings.map((h) => h.html)).toEqual(["Book 71", "A.D. 161"])
    expect(first?.text).toBe(
      "Marcus, the philosopher, ruled well. A second paragraph—with a dash.",
    )
    expect(first?.blocks).toHaveLength(2)
    expect(first?.notes).toEqual([
      { id: "7", html: "A <i>note</i>.", label: "1" },
    ])
    expect(third?.headings.map((h) => h.html)).toEqual(["Book 72"])
  })
})
