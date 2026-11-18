# The whole Pleiades gazetteer is committed as a slim snapshot

Every Place reference and Geographic claim resolves to a Place, and Pleiades is the authority for Places, their coordinates and their polygons. We commit a slim copy of all of Pleiades (about 40,000 Places: ID, title, names, representative point, bounding box or polygon, location precision, periods attested), not only the Places some Work references, because the corpus aims to be exhaustive: once the gazetteer is complete, adding a Work never changes Place data. ADR 0002 keeps raw intake archives out of Git, but this snapshot is what the reader renders, like normalized Passages, so it is committed. The full dump it is cut from stays out, recorded by date and checksum.

## Considered Options

- **Only the Places some Work references.** Smaller, but every new Work grows and reshapes the shared file, and a Place page or localisation that needs a Place no Work has named yet has nothing to show.
- **Fetch Pleiades at build time.** Builds would depend on Pleiades being up and could not be reproduced.
- **`isawnyu/pleiades.datasets` as a submodule.** Reproducible, but large, and still needs the slim cut.
- **The Pleiades API from the browser.** A runtime dependency and rate limits on every popover.
- **World Historical Gazetteer.** Broader, but Pleiades is the authority we chose; WHG aggregates it.

## Consequences

- Places Pleiades lacks live in our own file, which a refresh never touches, and are marked as ours.
- A scheduled job refreshes the snapshot and opens a PR for review. It reports every referenced ID that Pleiades merged, withdrew or moved; a vanished ID becomes a Flag on each reference to it.
- The build serves one small file or page per Place, so no reader page loads the whole snapshot.
- The site credits Pleiades (CC BY) and names the snapshot date.
- Region polygons come from Pleiades too, coarse as some are (coin-cabinet's ADR 0001 found Syria to be a 5×5 degree rectangle). We accept that for consistency with one source of truth.
