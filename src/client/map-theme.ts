// "Old paper at sunset": warm parchment land, dusty rose water, terracotta
// borders, painted over OpenFreeMap's dark style once it has loaded, so the
// tiles and layer ids stay the vendor's and only the paint changes.
//
// Ported from coin-cabinet (src/components/map/mapTheme.ts and mapColors.ts),
// regional layers only: a Place popover's map never zooms in far enough for
// the streets and landmarks that file also paints. Carry changes across by
// hand. The colours are the `--map-*` tokens in site/site.css.

import type { Map as MapLibreMap } from "maplibre-gl"

export type MapColor =
  | "map-land"
  | "map-woods"
  | "map-town"
  | "map-ice"
  | "map-water"
  | "map-waterway"
  | "map-water-label"
  | "map-water-label-halo"
  | "map-border"
  | "map-ink"
  | "map-label-halo"
  | "map-province-fill"
  | "map-province-line"
  | "pin-rose"
  | "pin-cream-warm"

/** A colour's #rrggbb value from the page's styles, since MapLibre cannot read `var()`. */
export function mapColor(name: MapColor): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim()
  if (!value) throw new Error(`Map colour --${name} is not defined`)
  return value
}

// Airports are clutter on a map of the ancient world; roads, rail and
// buildings are modern detail the mini map has no room for.
const HIDDEN_SOURCE_LAYERS = new Set([
  "aeroway",
  "transportation",
  "transportation_name",
  "building",
])

const FILL_BY_ID: Record<string, MapColor> = {
  background: "map-land",
  water: "map-water",
  landcover_ice_shelf: "map-ice",
  landcover_glacier: "map-ice",
  landuse_residential: "map-town",
  landcover_wood: "map-woods",
  landuse_park: "map-woods",
}

export function applyOldPaperTheme(map: MapLibreMap) {
  for (const layer of map.getStyle().layers) {
    const sourceLayer =
      "source-layer" in layer ? (layer["source-layer"] as string) : ""

    if (
      HIDDEN_SOURCE_LAYERS.has(sourceLayer) ||
      layer.id === "boundary_state"
    ) {
      map.setLayoutProperty(layer.id, "visibility", "none")
      continue
    }

    const fill = FILL_BY_ID[layer.id]
    if (fill) {
      map.setPaintProperty(
        layer.id,
        layer.type === "background" ? "background-color" : "fill-color",
        mapColor(fill),
      )
    } else if (layer.id === "waterway") {
      map.setPaintProperty(layer.id, "line-color", mapColor("map-waterway"))
    } else if (layer.id === "water_name") {
      map.setPaintProperty(layer.id, "text-color", mapColor("map-water-label"))
      map.setPaintProperty(
        layer.id,
        "text-halo-color",
        mapColor("map-water-label-halo"),
      )
    } else if (sourceLayer === "boundary") {
      map.setPaintProperty(layer.id, "line-color", mapColor("map-border"))
      map.setPaintProperty(layer.id, "line-opacity", 0.45)
    } else if (layer.type === "symbol") {
      // Modern place names, in ink on the parchment.
      map.setPaintProperty(layer.id, "text-color", mapColor("map-ink"))
      map.setPaintProperty(
        layer.id,
        "text-halo-color",
        mapColor("map-label-halo"),
      )
    }
  }
}
