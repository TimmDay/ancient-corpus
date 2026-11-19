// Place popovers: a Place reference in the text opens one shared popover with
// the Place's name, a mini map and a link to Pleiades. The Place's data and
// MapLibre load on first use, so a reader who never opens one fetches neither.

import type * as MapLibre from "maplibre-gl"
import type { Polygon } from "../places.ts"
import { applyOldPaperTheme, mapColor } from "./map-theme.ts"

type GeoData = Parameters<MapLibre.GeoJSONSource["setData"]>[0]

/** The Place as the build serves it, at /places/<namespace>/<id>.json. */
type ShownPlace = {
  id: string
  title: string
  types: string[]
  precision: "precise" | "rough" | "unlocated"
  point: [number, number] | null
  bbox: [number, number, number, number] | null
  extent?: Polygon
  uri: string
}

// The same free basemap as coin-cabinet's map, repainted as old paper.
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark"
const MAPLIBRE = "/assets/maplibre/"
const HOVER_DELAY = 250

const popover = document.getElementById("place-popover")
const places = new Map<string, Promise<ShownPlace>>()
let current: HTMLElement | undefined
let mapReady: Promise<MapLibre.Map> | undefined
let hoverTimer: number | undefined
/** Whether a click opened the popover; a click closes only what a click opened. */
let openedByClick = false

function placeData(id: string): Promise<ShownPlace> {
  let data = places.get(id)
  if (!data) {
    data = fetch(`/places/${id.replace(":", "/")}.json`).then((r) => {
      if (!r.ok) throw new Error(`Place ${id}: ${r.status}`)
      return r.json() as Promise<ShownPlace>
    })
    places.set(id, data)
  }
  return data
}

function loadMap(container: HTMLElement): Promise<MapLibre.Map> {
  mapReady ??= (async () => {
    const css = document.createElement("link")
    css.rel = "stylesheet"
    css.href = `${MAPLIBRE}maplibre-gl.css`
    document.head.append(css)
    // A runtime URL, so the bundler leaves MapLibre's own modules alone.
    const url = `${MAPLIBRE}maplibre-gl.mjs`
    const maplibre = (await import(url)) as typeof MapLibre
    maplibre.setWorkerUrl(`${location.origin}${MAPLIBRE}maplibre-gl-worker.mjs`)
    const map = new maplibre.Map({
      container,
      style: STYLE_URL,
      center: [30, 38],
      zoom: 3,
      minZoom: 2,
      maxZoom: 12,
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    })
    await new Promise<void>((resolve) => map.once("load", () => resolve()))
    applyOldPaperTheme(map)
    // The compact attribution opens expanded, covering a map this small;
    // start it folded to its (i) button.
    container
      .querySelector(".maplibregl-ctrl-attrib")
      ?.classList.remove("maplibregl-compact-show")
    map.addSource("place", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
    map.addLayer({
      id: "place-area",
      type: "fill",
      source: "place",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": mapColor("map-province-fill"),
        "fill-opacity": 0.25,
        "fill-outline-color": mapColor("map-province-line"),
      },
    })
    map.addLayer({
      id: "place-point",
      type: "circle",
      source: "place",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 6,
        "circle-color": mapColor("pin-rose"),
        "circle-stroke-color": mapColor("pin-cream-warm"),
        "circle-stroke-width": 2,
      },
    })
    return map
  })()
  return mapReady
}

async function showOnMap(container: HTMLElement, place: ShownPlace) {
  if (!place.point && !place.extent) {
    container.hidden = true
    return
  }
  container.hidden = false
  const map = await loadMap(container)
  map.resize()
  const geometry = place.extent ?? { type: "Point", coordinates: place.point }
  const source = map.getSource("place") as MapLibre.GeoJSONSource | undefined
  source?.setData({
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry, properties: {} }],
  } as GeoData)
  if (place.extent && place.bbox) {
    const [w, s, e, n] = place.bbox
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 24, maxZoom: 8, animate: false },
    )
  } else if (place.point) {
    map.jumpTo({
      center: place.point,
      zoom: place.precision === "precise" ? 5 : 4,
    })
  }
}

/** Places the popover under its reference, or above when there is no room below. */
function position(anchor: HTMLElement) {
  if (!popover) return
  const rect = anchor.getBoundingClientRect()
  const gutter = 16
  const width = Math.min(popover.offsetWidth, window.innerWidth - 2 * gutter)
  const left = Math.min(
    Math.max(rect.left, gutter),
    window.innerWidth - gutter - width,
  )
  const below = rect.bottom + 8
  const top =
    below + popover.offsetHeight > window.innerHeight &&
    rect.top - 8 - popover.offsetHeight > 0
      ? rect.top - 8 - popover.offsetHeight
      : below
  popover.style.left = `${left + window.scrollX}px`
  popover.style.top = `${top + window.scrollY}px`
}

async function open(anchor: HTMLElement) {
  if (!popover) return
  const id = anchor.dataset.place
  if (!id) return
  current = anchor
  const title = popover.querySelector(".place-title")
  const written = popover.querySelector<HTMLElement>(".place-written")
  const link = popover.querySelector<HTMLAnchorElement>(".place-pleiades")
  const mapBox = popover.querySelector<HTMLElement>(".place-map")
  if (title) title.textContent = "…"
  if (written) written.hidden = true
  for (const el of document.querySelectorAll(".place-ref[aria-expanded]"))
    el.removeAttribute("aria-expanded")
  anchor.setAttribute("aria-expanded", "true")
  if (!popover.matches(":popover-open")) popover.showPopover()
  position(anchor)

  const place = await placeData(id).catch(() => undefined)
  if (current !== anchor) return
  if (!place) {
    if (title) title.textContent = "This Place could not be loaded."
    return
  }
  if (title) title.textContent = place.title
  const asWritten = anchor.textContent?.trim() ?? ""
  if (written && asWritten && asWritten !== place.title) {
    written.textContent = `Written here as “${asWritten}”`
    written.hidden = false
  }
  if (link) {
    link.href = place.uri
    link.textContent = `${place.title} on Pleiades`
  }
  position(anchor)
  if (mapBox)
    await showOnMap(mapBox, place).catch(() => {
      mapBox.hidden = true
    })
}

function close() {
  current?.removeAttribute("aria-expanded")
  current = undefined
  if (popover?.matches(":popover-open")) popover.hidePopover()
}

/** What Tab can reach in the popover, skipping the folded map attribution's hidden links. */
const focusables = () =>
  [...(popover?.querySelectorAll<HTMLElement>("a[href], button") ?? [])].filter(
    (el) => el.checkVisibility({ visibilityProperty: true }),
  )

if (popover) {
  for (const ref of document.querySelectorAll<HTMLElement>(".place-ref")) {
    ref.setAttribute("aria-haspopup", "dialog")
    ref.setAttribute("aria-controls", "place-popover")
  }
  document.addEventListener("click", (event) => {
    const ref = (event.target as Element).closest<HTMLElement>(".place-ref")
    if (!ref) return
    window.clearTimeout(hoverTimer)
    // A click on a name its hover already opened keeps the popover open.
    if (current === ref && popover.matches(":popover-open") && openedByClick)
      close()
    else {
      openedByClick = true
      if (current !== ref) void open(ref)
    }
  })
  // A manual popover, so a click on the name it belongs to is not a click
  // outside; dismissing it by clicking elsewhere or Escape is done here.
  document.addEventListener("click", (event) => {
    const target = event.target as Element
    if (!target.closest(".place-ref, #place-popover")) close()
  })
  document.addEventListener("keydown", (event) => {
    if (!current || !popover.matches(":popover-open")) return
    const anchor = current
    if (event.key === "Escape") {
      close()
      anchor.focus()
      return
    }
    if (event.key !== "Tab") return
    // The popover sits at the end of the page; Tab steps from the name into
    // it, and out of it back to what follows the name.
    const inside = focusables()
    const active = document.activeElement
    if (active === anchor && !event.shiftKey && inside[0]) {
      event.preventDefault()
      inside[0].focus()
    } else if (active === inside[0] && event.shiftKey) {
      event.preventDefault()
      anchor.focus()
    } else if (active === inside.at(-1) && !event.shiftKey) {
      // Focus the name, and let Tab carry on from it.
      close()
      anchor.focus()
    }
  })

  // Hover opens it too, where there is a pointer that hovers; leaving both
  // the reference and the popover closes it.
  if (window.matchMedia("(hover: hover)").matches) {
    const later = (fn: () => void) => {
      window.clearTimeout(hoverTimer)
      hoverTimer = window.setTimeout(fn, HOVER_DELAY)
    }
    document.addEventListener("pointerover", (event) => {
      const target = event.target as Element
      const ref = target.closest<HTMLElement>(".place-ref")
      if (ref)
        later(() => {
          if (current === ref) return
          openedByClick = false
          void open(ref)
        })
      else if (target.closest("#place-popover")) window.clearTimeout(hoverTimer)
    })
    document.addEventListener("pointerout", (event) => {
      const from = (event.target as Element).closest(
        ".place-ref, #place-popover",
      )
      const to = (event.relatedTarget as Element | null)?.closest(
        ".place-ref, #place-popover",
      )
      // A popover opened by a click stays until dismissed.
      if (from && !to && !openedByClick) later(close)
    })
  }
}
