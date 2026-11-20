import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { hasEditionText, loadWorks } from "../src/corpus.ts"
import { build } from "./build.ts"

const unpublished = loadWorks().flatMap((w) =>
  w.editions
    .filter((e) => e.unpublished)
    .map((e) => ({ work: w.slug, edition: e.slug })),
)

// Builds from the committed works/, exactly as CI and Cloudflare do, into a
// scratch folder so a running dev server's dist/ is left alone.
describe("build", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "corpus-build-"))
  const result = build({ outDir })
  const read = (file: string) => readFileSync(path.join(outDir, file), "utf8")

  it("puts the site menu in every header, marking the page it is on", () => {
    for (const [page, current] of [
      ["index.html", "Works"],
      ["editions/index.html", "Index"],
      ["how-to-use/index.html", "How to Use"],
    ] as const) {
      const html = read(page)
      expect(html).toContain('<nav class="site-nav" aria-label="Site">')
      expect(html).toContain(`aria-current="page">${current}</a>`)
    }
    expect(read("eutropius/breviarium/index.html")).toContain(
      'href="/editions/">Index</a>',
    )
  })

  it("moves linking help from the home page to How to Use", () => {
    expect(read("index.html")).not.toContain("Linking to a passage")
    expect(read("how-to-use/index.html")).toMatch(
      /Linking to a passage[\s\S]*?\/cite\?author=Eutropius/,
    )
  })

  it("lists every published Edition in the Index, one row each, with the catalogue's dates", () => {
    const html = read("editions/index.html")
    const rows = html.match(/<tr data-author=/g) ?? []
    expect(rows.length).toBe(
      loadWorks().flatMap((w) =>
        w.editions.filter((e) => e.unpublished ?? hasEditionText(w, e)),
      ).length,
    )
    // Magie's Latin and English are two rows; the Historia Augusta's date
    // comes from the catalogue, since its work.json has none.
    expect(html.match(/<tr[^>]*data-work="Historia Augusta"/g)).toHaveLength(2)
    expect(html).toContain('data-label="Written">late 4th century</td>')
    expect(html).toContain("<option>English</option>")
  })

  it("credits machine translations to their model, and gives every Edition's licence", () => {
    const html = read("editions/index.html")
    const orosius =
      html.match(
        /<tr[^>]*data-work="Historiae adversus Paganos"[^>]*data-language="English"[\s\S]*?<\/tr>/,
      )?.[0] ?? ""
    expect(orosius).toContain(
      'data-label="Translator or editor">Claude Opus 5.5</td>',
    )
    // Filterable, but not a column: data-machine marks it, for Human or AI.
    expect(orosius).toContain('data-machine="Yes"')
    expect(html).not.toContain("Machine translated")
    expect(html).toContain('<option value="ai">AI</option>')
    expect(orosius).toContain('data-label="Licence">CC0 (public domain)</td>')
    // Waiting for permission: listed, unlinked, with a note on who to ask.
    expect(html).toMatch(
      /Res Gestae Divi Saporis <span class="none">\(not published\)[\s\S]*?popovertarget="permission-shapur-i-res-gestae-nabel">Permission needed/,
    )
    for (const work of loadWorks())
      for (const edition of work.editions) {
        expect(edition.licence, `${work.slug}/${edition.slug}`).toBeDefined()
        expect(edition.licence === "permission-needed").toBe(
          Boolean(edition.unpublished),
        )
      }
  })

  it("holds back only Editions waiting for permission", () => {
    expect(result.published).toBeGreaterThanOrEqual(1)
    expect(
      result.skipped.every((s) =>
        unpublished.some((u) => s.startsWith(`${u.work}/${u.edition}`)),
      ),
    ).toBe(true)
  })

  it("publishes flagged Passages, each marked and listed above the text", () => {
    const page = read("cassius-dio/roman-history/42/index.html")
    const passage = page.slice(page.indexOf('id="42.24"'))
    expect(passage.slice(0, passage.indexOf("</section>"))).toMatch(
      /^id="42\.24"[^>]*>\s*<div class="flag-note" role="note" lang="en">[\s\S]*The numbering jumps from 42\.24 to 26\. Chapter 25 may be inside this Passage/,
    )
    expect(page).toContain('<section class="passage flagged" id="42.24"')
    expect(page).toContain('<a href="#42.24">42.24</a>')
    expect(page).toContain('<dialog class="flag-dialog" id="flag-dialog"')
    // The contents page links each flagged Passage to the book it is read on.
    expect(read("cassius-dio/roman-history/index.html")).toContain(
      '<a href="/cassius-dio/roman-history/42/#42.24">42.24</a>',
    )
    expect(read("index.html")).toMatch(
      /Roman History<\/i><\/a> <span class="flag-tag"[^>]*>.*\d+ flagged<\/span>/,
    )
  })

  it("leaves Passages unflagged once their Flags are accepted", () => {
    // De Caesaribus 20 was flagged long, and accepted: the print has it so.
    const page = read("aurelius-victor/de-caesaribus/ancient-corpus/index.html")
    expect(page).toContain('<section class="passage" id="20"')
    expect(page).not.toContain("passage flagged")
    expect(page).not.toContain("flag-banner")
  })

  it("never publishes an Edition waiting for permission", () => {
    // Its text is gitignored, so only a machine that imported it has any to leak.
    for (const { work, edition } of unpublished) {
      expect(existsSync(path.join(outDir, work, edition))).toBe(false)
      const workPage = path.join(work, "index.html")
      if (existsSync(path.join(outDir, workPage)))
        expect(read(workPage)).not.toContain(`/${work}/${edition}/`)
    }
  })

  it("shows a Passage's Annotations collapsed, after its text", () => {
    const page = read("anonymous/oracula-sibyllina/13/index.html")
    const passage = page.slice(page.indexOf('id="13.13"'))
    expect(passage.slice(0, passage.indexOf("</section>"))).toMatch(
      /<\/p>\s*<aside class="annotations"[^>]*>\s*<details class="annotation">\s*<summary><span class="annotation-label">Annotation<\/span> Gordian III<\/summary>/,
    )
  })

  it("gives every Passage an anchor and the page its Locator index", () => {
    const page = read("eutropius/breviarium/index.html")
    expect(page).toContain('<section class="passage" id="9.9"')
    expect(page).toContain('id="locator-index"')
    expect(page).toContain('lang="la"')
  })

  it("reads a long Edition a book at a time, from one link", () => {
    const book = read("cassius-dio/roman-history/44/index.html")
    expect(book).toContain('<section class="passage" id="44.19"')
    expect(book).not.toContain('id="45.1"')
    // The Work's own page knows which book holds every Locator.
    expect(read("cassius-dio/roman-history/index.html")).toContain(
      '"locator":"44.19","id":"44.19","page":"/cassius-dio/roman-history/44/"',
    )
    expect(read("cassius-dio/roman-history/80/index.html")).toContain(
      'id="80.1(Alexander)"',
    )
  })

  it("lists the Locators of Editions that share a language, for ?lang=", () => {
    const page = read("john-zonaras/epitome-historiarum/12/index.html")
    const locators = JSON.parse(
      /<script type="application\/json" id="edition-locators">(.*?)<\/script>/.exec(
        page,
      )?.[1] ?? "{}",
    ) as Record<string, string[]>
    expect(Object.keys(locators).sort()).toEqual(["ancient-corpus", "foster"])
    expect(locators.foster).toContain("8.1")
    expect(locators.foster).not.toContain("12.1")
    expect(locators["ancient-corpus"]).toContain("12.1")
    // A Work with one Edition per language needs no list.
    expect(read("zosimus/historia-nova/index.html")).not.toContain(
      "edition-locators",
    )
  })

  it("reads Ammianus a book at a time, by book, chapter and section", () => {
    // The Latin, preferred, at the same Locator as Yonge's English.
    expect(read("ammianus-marcellinus/res-gestae/31/index.html")).toMatch(
      /id="31\.5\.17"[^>]*>[\s\S]*?per Aurelianum, acrem virum/,
    )
    expect(read("ammianus-marcellinus/res-gestae/yonge/31/index.html")).toMatch(
      /id="31\.5\.17"[^>]*>[\s\S]*?routed by Aurelian, an untiring leader/,
    )
    // Gutenberg's second "XII." in Book 22 is chapter 13.
    expect(read("ammianus-marcellinus/res-gestae/yonge/22/index.html")).toMatch(
      /id="22\.13\.1"[^>]*>[\s\S]*?temple of Apollo, at Daphne/,
    )
  })

  it("reads Eusebius and Lactantius on Aurelian, in the original and in English", () => {
    const greek = read("eusebius/historia-ecclesiastica/7/index.html")
    expect(greek).toContain('<section class="passage" id="7.praef"')
    expect(greek).toContain('<section class="passage" id="7.30"')
    // Dindorf's margin references to Nicephorus are not Eusebius's text.
    expect(greek).not.toContain("Nic. H. E.")
    const english = read(
      "eusebius/historia-ecclesiastica/mcgiffert/7/index.html",
    )
    expect(english).toContain("the Emperor Aurelian was petitioned")
    expect(english).toContain(
      "Chapter XXX.—<i>The Epistle of the Bishops against Paul.</i>",
    )
    // Only the appendix the Greek numbers apart is a Passage of its own.
    expect(
      read("eusebius/historia-ecclesiastica/mcgiffert/8/index.html"),
    ).toContain('id="8.appendix"')
    expect(
      read("eusebius/historia-ecclesiastica/mcgiffert/10/index.html"),
    ).not.toContain('id="10.appendix"')
    expect(read("lactantius/de-mortibus-persecutorum/index.html")).toMatch(
      /id="6"[^>]*>[\s\S]*?Aurelianus, qui esset natura vesanus/,
    )
    expect(
      read("lactantius/de-mortibus-persecutorum/fletcher/index.html"),
    ).toContain(
      "Aurelian might have recollected the fate of the captived emperor",
    )
  })

  it("reads Dexippus on Aurelian's embassies, in Müller's Greek and our English", () => {
    const greek = read("dexippus/scythica/index.html")
    expect(greek).toMatch(
      /id="24"[^>]*>[\s\S]*?Ὅτε Αὐρηλιανὸς κατὰ κράτος νικήσας τοὺς Ἰουθούγγους Σκύθας/,
    )
    // Müller's markers for his notes are dropped; his notes stay.
    expect(greek).not.toContain("Ἰουθούγγους (*)")
    expect(read("dexippus/scythica/ancient-corpus/index.html")).toContain(
      "When Aurelian had defeated the Juthungian Scythians outright",
    )
  })

  it("links every translation to its human translator, to read or to thank", () => {
    expect(
      read("aurelius-victor/de-caesaribus/ancient-corpus/index.html"),
    ).toContain(
      '<p class="human-translation">Read a human translation: <a href="https://search.worldcat.org/search?q=bn:0853232180">H. W. Bird',
    )
    expect(read("anonymous/historia-augusta/magie/index.html")).toContain(
      '<p class="human-translation">Translated by <a href="https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Historia_Augusta/home.html">David Magie',
    )
    const unthanked = loadWorks().flatMap((w) =>
      w.editions
        .filter((e) => e.language !== w.originalLanguage && !e.humanTranslation)
        .map((e) => `${w.slug}/${e.slug}`),
    )
    expect(unthanked).toEqual([])
  })

  it("reads the Continuation of Dio and Peter the Patrician on Aurelian, in Müller's Greek and our English", () => {
    // Aurelian's answer to the mutiny: the god who gave the purple sets the reign.
    expect(read("anonymous/continuation-of-dio/index.html")).toMatch(
      /id="10"[^>]*>[\s\S]*?τὸν θεὸν δωρησάμενον τὴν πορφύραν/,
    )
    expect(
      read("anonymous/continuation-of-dio/ancient-corpus/index.html"),
    ).toMatch(/id="10"[^>]*>[\s\S]*?the god who had given him the purple/)
    // DFHG's doubled word, corrected.
    expect(read("anonymous/continuation-of-dio/index.html")).not.toContain(
      "Ἡσθεὶς Ἡσθεὶς",
    )
    expect(
      read("peter-the-patrician/historiae/ancient-corpus/index.html"),
    ).toMatch(
      /id="12"[^>]*>[\s\S]*?The Vandals, defeated, sent an embassy to Aurelian/,
    )
  })

  it("reads Jerome's Chronicle by Helm's page and letter, in Latin and English", () => {
    expect(read("jerome/chronicon/2/index.html")).toMatch(
      /id="305a"[^>]*>[\s\S]*?Aurelianus templum Soli aedificat/,
    )
    const english = read("jerome/chronicon/pearse/2/index.html")
    expect(english).toMatch(
      /id="305a"[^>]*>[\s\S]*?Aurelian builds a temple to the Sun/,
    )
    // A letter missing from Pearse's page, restored by a split Correction.
    expect(read("jerome/chronicon/pearse/2/index.html")).toMatch(
      /id="193l"[^>]*>[\s\S]*?Cratinus and Plato/,
    )
  })

  it("reads the Epitome de Caesaribus in Latin, section for section with Banchich", () => {
    expect(
      read("pseudo-aurelius-victor/epitome-de-caesaribus/index.html"),
    ).toMatch(/id="35\.1"[^>]*>[\s\S]*?Aurelianus, genitus patre mediocri/)
    // The page prints Otho as a second chapter 6; he is chapter 7.
    expect(
      read("pseudo-aurelius-victor/epitome-de-caesaribus/index.html"),
    ).toMatch(/id="7\.1"[^>]*>[\s\S]*?Salvius Otho/)
  })

  it("reads Suetonius in Latin, chapter for chapter with Thomson and Forester", () => {
    const latin = read("suetonius/de-vita-caesarum/index.html")
    expect(latin).toMatch(
      /id="Augustus-1"[^>]*>[\s\S]*?Gentem Octaviam Velitris/,
    )
    expect(latin).toMatch(/id="Caligula-48"[^>]*>[\s\S]*?Prius quam provincia/)
    expect(latin).not.toContain("The Classics Page</p>")
  })

  it("reads Dio's Greek beside Foster's English, Books 36 to 55", () => {
    expect(read("cassius-dio/roman-history/cary/44/index.html")).toMatch(
      /id="44\.19"[^>]*>[\s\S]*?Καῖσαρ/,
    )
  })

  it("reads the Chronicon Paschale by Bonn page, Greek, Latin and our English", () => {
    const greek = read("anonymous/chronicon-paschale/2/index.html")
    expect(greek).toMatch(/id="508"[^>]*>[\s\S]*?τείχη ῾Ρώμης ἀνανεοῦν/)
    // An unclosed footnote on page 378 must not swallow the pages after it.
    expect(greek).toMatch(/id="379"/)
    expect(read("anonymous/chronicon-paschale/du-cange/2/index.html")).toMatch(
      /id="508"[^>]*>[\s\S]*?instaurare moenia/,
    )
    expect(
      read("anonymous/chronicon-paschale/ancient-corpus/index.html"),
    ).toMatch(/id="508"[^>]*>[\s\S]*?began to renew the walls of Rome/)
  })

  it("reads Malalas by Bonn page and book, Greek, Latin and our English", () => {
    expect(read("john-malalas/chronographia/XII/index.html")).toMatch(
      /id="300"[^>]*>[\s\S]*?Ζηνοβίας/,
    )
    expect(read("john-malalas/chronographia/chilmead/XII/index.html")).toMatch(
      /id="301"[^>]*>[\s\S]*?Castrum[\s\S]*?Novum/,
    )
    expect(
      read("john-malalas/chronographia/ancient-corpus/index.html"),
    ).toMatch(/id="300"[^>]*>[\s\S]*?seated her on a dromedary camel/)
  })

  it("reads Syncellus by Bonn page, numbered from the running heads", () => {
    const greek = read(
      "george-syncellus/ekloge-chronographias/chronographia/index.html",
    )
    expect(greek).toMatch(/id="721"[^>]*>[\s\S]*?Ζηνοβία/)
    // archive.org numbers this run of leaves 8xx; the heads say 3xx.
    expect(greek).toMatch(/id="320"/)
    expect(
      read("george-syncellus/ekloge-chronographias/ancient-corpus/index.html"),
    ).toMatch(/id="721"[^>]*>[\s\S]*?a place called Immae/)
  })

  it("reads Jordanes's Romana by Mommsen's sections, and our English", () => {
    expect(read("jordanes/romana/index.html")).toMatch(
      /id="291"[^>]*>[\s\S]*?apud Hymmas vicino Antiochiae/,
    )
    expect(read("jordanes/romana/ancient-corpus/index.html")).toMatch(
      /id="291"[^>]*>[\s\S]*?defeated her at Immae/,
    )
  })

  it("reads the Chronicle of 354 by ruler, in Latin and Pearse's English", () => {
    expect(
      read("furius-dionysius-filocalus/chronography-of-354/index.html"),
    ).toMatch(/id="caesares\.aurelianus"[^>]*>[\s\S]*?hic muro urbem cinxit/)
    expect(
      read("furius-dionysius-filocalus/chronography-of-354/pearse/index.html"),
    ).toMatch(
      /id="caesares\.aurelianus"[^>]*>[\s\S]*?surrounded the city with a wall/,
    )
  })

  it("reads John of Antioch on Aurelian's temper, in Greek and our English", () => {
    expect(read("john-of-antioch/historia-chronike/index.html")).toMatch(
      /id="155"[^>]*>[\s\S]*?πρὸς ὠμότητα ῥέπων/,
    )
    expect(
      read("john-of-antioch/historia-chronike/ancient-corpus/index.html"),
    ).toMatch(
      /id="155"[^>]*>[\s\S]*?more a necessary general than a chosen emperor/,
    )
  })

  it("reads Polemius Silvius's list of emperors, typed from Mommsen", () => {
    expect(read("polemius-silvius/laterculus/index.html")).toMatch(
      /id="49"[^>]*>[\s\S]*?Vabalathus et mater eius Zenobia/,
    )
    expect(
      read("polemius-silvius/laterculus/ancient-corpus/index.html"),
    ).toMatch(/id="48"[^>]*>[\s\S]*?Aurelian killed/)
  })

  it("reads the Origo Constantini by section, in Rolfe's Latin and English", () => {
    expect(read("anonymous/origo-constantini/index.html")).toMatch(
      /id="2"[^>]*>[\s\S]*?divi Claudii optimi principis nepos/,
    )
    expect(read("anonymous/origo-constantini/rolfe/index.html")).toMatch(
      /id="2"[^>]*>[\s\S]*?grandson of the brother of that best of emperors Claudius/,
    )
  })

  it("reads Julian's Orations by oration and Spanheim section, in Greek and Wright's English", () => {
    expect(read("julian/orations/1/index.html")).toMatch(
      /id="1\.17c"[^>]*>[\s\S]*?Πέρσαι τῆς Ἀσίας ἁπάσης/,
    )
    expect(read("julian/orations/wright/1/index.html")).toMatch(
      /id="1\.17c"[^>]*>[\s\S]*?The Persians in the past conquered the whole of Asia/,
    )
    // Wright's notes are numbered through each volume: Oration VI's are in vol. 2.
    expect(read("julian/orations/wright/6/index.html")).toMatch(/id="6\.181/)
    expect(read("julian/misopogon/wright/index.html")).toMatch(
      /id="340a"[^>]*>[\s\S]*?worthlessness of my disposition/,
    )
    expect(read("julian/letters/index.html")).toMatch(
      /id="268"[^>]*>[\s\S]*?Πολλῶν εἰργασμένων τοῖς προγόνοις ὑμῶν/,
    )
  })

  it("reads Claudian by Platnauer's paragraphs, the Latin verses beside each", () => {
    expect(read("claudian/de-tertio-consulatu-honorii/index.html")).toMatch(
      /id="39"[^>]*>[\s\S]*?Mox ubi firmasti recto vestigia gressu/,
    )
    expect(
      read("claudian/de-tertio-consulatu-honorii/platnauer/index.html"),
    ).toMatch(/id="39"[^>]*>[\s\S]*?Soon when thou couldst stand upright/)
    // The Gothic War's preface is headed only by its number, XXV.
    expect(read("claudian/de-bello-gothico/index.html")).toMatch(
      /id="praef"[^>]*>[\s\S]*?Post resides annos longo velut excita somno/,
    )
  })

  it("reads Olympiodorus by Photius' sections, in Müller's Greek and our English", () => {
    expect(read("olympiodorus/histories/index.html")).toMatch(
      /id="1\.24"[^>]*>[\s\S]*?ὁ πρὸς Πλακιδίαν συντελεῖται γάμος/,
    )
    expect(read("olympiodorus/histories/ancient-corpus/index.html")).toMatch(
      /id="1\.24"[^>]*>[\s\S]*?Ataulf's marriage to Placidia/,
    )
    expect(read("eunapius/history/index.html")).toMatch(/id="110"/)
    expect(read("priscus/history/index.html")).toMatch(
      /id="8"[^>]*>[\s\S]*?Ἀττήλ/,
    )
  })

  it("reads Rutilius by book and line, the Latin verses beside the Duffs' English", () => {
    expect(read("rutilius-namatianus/de-reditu-suo/index.html")).toMatch(
      /id="1\.47"[^>]*>[\s\S]*?"exaudi, regina tui pulcherrima mundi/,
    )
    // Thayer's map of Populonia, captioned in his Latin, is not Rutilius.
    expect(read("rutilius-namatianus/de-reditu-suo/index.html")).not.toMatch(
      /ruinas Romanas videre/,
    )
  })

  it("reads Herodian by book and chapter, in Bekker's Greek and Echols' English", () => {
    expect(read("herodian/history/1/index.html")).toMatch(
      /id="1\.1"[^>]*>[\s\S]*?Οἱ πλεῖστοι τῶν περὶ συγκομιδὴν ἱστορίας/,
    )
    expect(read("herodian/history/echols/1/index.html")).toMatch(
      /id="1\.1"[^>]*>[\s\S]*?THE majority of writers who have devoted themselves/,
    )
    // Echols' section numbers ("2.") are dropped from the English.
    expect(read("herodian/history/echols/1/index.html")).not.toMatch(
      /<span class="verse">/,
    )
  })

  it("reads the Res Gestae by chapter in Latin, Greek and Shipley's English", () => {
    expect(read("augustus/res-gestae/index.html")).toMatch(
      /id="34"[^>]*>[\s\S]*?Ín consulátú sexto et septimo/,
    )
    expect(read("augustus/res-gestae/shipley-greek/index.html")).toMatch(
      /id="34"[^>]*>[\s\S]*?Σεβαστὸς/,
    )
    expect(read("augustus/res-gestae/shipley/index.html")).toMatch(
      /id="34"[^>]*>[\s\S]*?I was given the title of Augustus/,
    )
  })

  it("reads Velleius by book and chapter, in Shipley's Latin and English", () => {
    expect(read("velleius-paterculus/historiae-romanae/index.html")).toMatch(
      /id="2\.89"[^>]*>[\s\S]*?Caesar autem reversus in Italiam atque urbem/,
    )
    expect(
      read("velleius-paterculus/historiae-romanae/shipley/index.html"),
    ).toMatch(/id="2\.89"[^>]*>[\s\S]*?As for Caesar's return to Italy/)
  })

  it("reads Frontinus story by story, in Bennett's Latin and English", () => {
    expect(read("frontinus/strategemata/index.html")).toMatch(
      /id="1\.1\.1"[^>]*>[\s\S]*?M. Porcius Cato devictas/,
    )
    expect(read("frontinus/strategemata/bennett/index.html")).toMatch(
      /id="1\.pr"[^>]*>[\s\S]*?Since I alone of those interested in military science/,
    )
    // The Latin pages have no notes, so nothing ends the text before the site's footer.
    expect(read("frontinus/strategemata/index.html")).not.toMatch(/asterisks/)
  })

  it("reads Sallust by chapter, in Rolfe's Latin and English", () => {
    expect(read("sallust/bellum-catilinae/index.html")).toMatch(
      /id="1"[^>]*>[\s\S]*?Omnis homines qui sese student praestare ceteris animalibus/,
    )
    expect(read("sallust/bellum-jugurthinum/rolfe/index.html")).toMatch(
      /id="85"[^>]*>[\s\S]*?I know, fellow citizens/,
    )
  })

  it("reads Caesar by book and chapter, the Latin and the English from Perseus", () => {
    expect(read("julius-caesar/de-bello-gallico/1/index.html")).toMatch(
      /id="1\.1"[^>]*>[\s\S]*?Gallia est omnis divisa in partes tres/,
    )
    expect(
      read("julius-caesar/de-bello-gallico/mcdevitte-bohn/1/index.html"),
    ).toMatch(/id="1\.1"[^>]*>[\s\S]*?All Gaul is divided into three parts/)
    expect(read("julius-caesar/de-bello-civili/peskett/1/index.html")).toMatch(
      /id="1\.1"[^>]*>[\s\S]*?When Caesar’s dispatch had been handed to the consuls/,
    )
  })

  it("reads Josephus' Jewish War in Whiston's paragraphs, the Greek grouped to match", () => {
    expect(read("flavius-josephus/jewish-war/1/index.html")).toMatch(
      /id="1\.1"[^>]*>[\s\S]*?Ἐπειδὴ τὸν Ἰουδαίων πρὸς Ῥωμαίους πόλεμον/,
    )
    expect(read("flavius-josephus/jewish-war/whiston/7/index.html")).toMatch(
      /id="7\.337"[^>]*>[\s\S]*?This was Eleazar's speech to them/,
    )
  })

  it("reads Josephus' Antiquities by Whiston's paragraphs, with Niese's book summaries in the Greek", () => {
    expect(read("flavius-josephus/jewish-antiquities/18/index.html")).toMatch(
      /id="18\.arg"/,
    )
    expect(
      read("flavius-josephus/jewish-antiquities/whiston/17/index.html"),
    ).toMatch(
      /id="17\.339"[^>]*>[\s\S]*?WHEN Archelaus was entered on his ethnarchy/,
    )
  })

  it("reads Josephus' Life by section alone, and Against Apion by book and section", () => {
    expect(read("flavius-josephus/life/index.html")).toMatch(
      /id="1"[^>]*>[\s\S]*?Ἐμοὶ δὲ γένος ἐστὶν οὐκ ἄσημον/,
    )
    // Where the Greek is lost, Niese prints the Latin translation.
    expect(read("flavius-josephus/against-apion/index.html")).toMatch(
      /id="2\.109"[^>]*>[\s\S]*?talia namque etiam ad altare/,
    )
  })

  it("reads Festus on Aurelian and Zenobia, in Latin and in Banchich and Meka's English", () => {
    expect(read("festus/breviarium/index.html")).toMatch(
      /id="24"[^>]*>[\s\S]*?Zenobia/,
    )
    const english = read("festus/breviarium/banchich-meka/index.html")
    expect(english).toContain("Copyright (C) 2001, Thomas Banchich")
    expect(english).toMatch(
      /id="24"[^>]*>[\s\S]*?Aurelian defeated her, relying on many thousands of armored horsemen/,
    )
    expect(english).toContain("Index of Names of Individuals")
  })

  it("reads Eutropius on Aurelian in Watson's English, a book at a time, chapter for chapter with the Latin", () => {
    const english = read("eutropius/breviarium/watson/9/index.html")
    expect(english).toMatch(
      /id="9\.14"[^>]*>[\s\S]*?He was indeed cruel and sanguinary/,
    )
    expect(english).toContain("Chalons sur Marne")
    // Nero, whose numeral the transcription lacks, at the Latin's 7.14.
    expect(read("eutropius/breviarium/watson/7/index.html")).toMatch(
      /id="7\.14"[^>]*>[\s\S]*?To him succeeded NERO/,
    )
  })

  it("reads Julian's Caesars on Aurelian, in Wright's Greek and English, by Spanheim section", () => {
    const passage = (page: string, id: string) => {
      const from = page.slice(page.indexOf(`id="${id}"`))
      return from.slice(0, from.indexOf("</section>"))
    }
    expect(passage(read("julian/caesares/index.html"), "313d")).toContain(
      "τούτοις ἐπεισέδραμεν Αὐρηλιανὸς",
    )
    const english = read("julian/caesares/wright/index.html")
    expect(passage(english, "313d")).toContain(
      "many charges of unjustifiable murders were brought against him",
    )
    // Wright's paragraph on Probus starts inside 314a, after the oracle.
    expect(english).toMatch(
      /If his punishment match his crime[\s\S]*?id="314a"[^>]*>[\s\S]*?With Aurelian entered Probus/,
    )
  })

  it("reads Orosius a book at a time, with our English for all seven", () => {
    expect(read("orosius/historiae/7/index.html")).toMatch(
      /id="7\.23"[^>]*>[\s\S]*?Aurelianus uicesimus nonus imperium adeptus/,
    )
    // Orosius bolds the names of places; they stay in the text.
    expect(read("orosius/historiae/1/index.html")).toContain(
      "Asiam Europam et Africam",
    )
    expect(read("orosius/historiae/1/index.html")).toContain('id="1.praef"')
    const english = read("orosius/historiae/ancient-corpus/index.html")
    expect(english).toContain("he routed the Goths in great battles")
    expect(english).toMatch(
      /id="1\.praef"[^>]*>[\s\S]*?most blessed father Augustine/,
    )
    expect(english).toMatch(
      /id="4\.23"[^>]*>[\s\S]*?Carthage was destroyed, with every stone of its walls ground to dust/,
    )
    expect(english).toMatch(
      /id="6\.22"[^>]*>[\s\S]*?entered in the Roman census as soon as He was born/,
    )
    expect(english).toMatch(
      /id="7\.43"[^>]*>[\s\S]*?what had been Romania should be Gothia/,
    )
  })

  it("redirects long slugs, keeping the rest of the path", () => {
    expect(read("_redirects")).toContain(
      "/eutropius/breviarium-historiae-romanae/* /eutropius/breviarium/:splat 301",
    )
  })
})
