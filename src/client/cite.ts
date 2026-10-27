// /cite?author=…&title=…&loc=…[&edition=…]: finds the Work by any of its names
// and sends the reader to the Locator, or to the catalogue when nothing matches.

import { matchWork, type WorkListing } from "../works-index.ts"

async function resolve(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const author = params.get("author") ?? ""
  const title = params.get("title") ?? ""
  const loc = params.get("loc") ?? params.get("locator") ?? ""
  const edition = params.get("edition") ?? ""

  const works = (await (await fetch("/works.json")).json()) as WorkListing[]
  const work = matchWork(works, author, title)
  if (!work) {
    location.replace(
      `/?q=${encodeURIComponent([author, title].filter(Boolean).join(" "))}&missing=1`,
    )
    return
  }
  const editionPath =
    work.editions.includes(edition) && edition !== work.preferredEdition
      ? `${edition}/`
      : ""
  location.replace(
    `/${work.slug}/${editionPath}${loc ? `#${encodeURIComponent(loc)}` : ""}`,
  )
}

void resolve()
