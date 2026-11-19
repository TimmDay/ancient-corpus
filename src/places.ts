// Places: the identities Place references resolve to. Pleiades is the
// authority (docs/adr/0005): its whole gazetteer is committed as a slim
// snapshot, places/pleiades.jsonl, one Place per line in ID order, cut from a
// dated Pleiades CSV dump by `pnpm pleiades`. Our own records, for Places
// Pleiades lacks, will live beside it in a file a refresh never touches.
//
// An ID says whose record it is: `pleiades:893976`. Coordinates are always
// [longitude, latitude], as Pleiades and GeoJSON write them.

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { REPO_ROOT } from "./corpus.ts"

export const PLACES_DIR = path.join(REPO_ROOT, "places")
export const PLEIADES_SNAPSHOT = path.join(PLACES_DIR, "pleiades.jsonl")
export const PLEIADES_SOURCE = path.join(PLACES_DIR, "pleiades.source.json")

export type PlaceId = `pleiades:${string}`

/** How exactly Pleiades knows where a Place is; `unlocated` has no position. */
export type Precision = "precise" | "rough" | "unlocated"

export type Polygon = {
  type: "Polygon" | "MultiPolygon"
  coordinates: number[][][] | number[][][][]
}

export type Place = {
  id: PlaceId
  title: string
  /** Every name Pleiades records, as written and romanized, with its language code where known. */
  names: [name: string, language: string][]
  /** Pleiades place types: "urban", "river", "province". */
  types: string[]
  precision: Precision
  /** A representative point, [lng, lat]; null for an Unlocated place. */
  point: [number, number] | null
  /** [west, south, east, north]. */
  bbox: [number, number, number, number] | null
  /** The outline of a Place large enough to draw as an area (a province, a sea); absent for a point. */
  extent?: Polygon
  /** Pleiades time-period keys the Place is attested in: "roman", "late-antique". */
  periods: string[]
  /** Earliest and latest years attested, negative for BC. */
  start: number | null
  end: number | null
}

/** Where a snapshot was cut from, so it can be fetched again and checked. */
export type SnapshotSource = {
  date: string
  files: { url: string; sha256: string }[]
  licence: string
}

/** Place types drawn as an area rather than a pin, when Pleiades has an outline for them. */
const AREAL_TYPES = new Set([
  // Checked against the types the 2026-11-18 dump actually uses.
  "province",
  "province-2",
  "region",
  "district",
  "territory",
  "kingdom",
  "satrapy",
  "diocese-roman",
  "diocese-church",
  "people",
  "island",
  "archipelago",
  "peninsula",
  "lake",
  "lagoon",
  "water-open",
  "water-inland",
  "bay",
  "gulf",
  "estuary",
  "marsh-wetland",
  "salt-marsh",
  "mountain",
  "plain",
  "valley",
  "desert",
  "forest",
  "oasis",
])

export function pleiadesUrl(id: PlaceId): string {
  return `https://pleiades.stoa.org/places/${id.slice("pleiades:".length)}`
}

/** The path a Place is served under, below /places/: `pleiades/893976`. */
export function placePath(id: PlaceId): string {
  return id.replace(":", "/")
}

/** Parses CSV as RFC 4180 writes it: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows
  if (!header) return []
  return body
    .filter((r) => r.length > 1 || r[0])
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])))
}

const round = (n: number, places: number) =>
  Math.round(n * 10 ** places) / 10 ** places

function roundCoords(coords: unknown, places: number): unknown {
  if (typeof coords === "number") return round(coords, places)
  if (!Array.isArray(coords)) return coords
  const rounded = coords.map((c) => roundCoords(c, places))
  // Rounding can make neighbouring vertices equal; keep one of each.
  return rounded.filter(
    (c, i) =>
      !Array.isArray(c) ||
      i === 0 ||
      i === rounded.length - 1 ||
      JSON.stringify(c) !== JSON.stringify(rounded[i - 1]),
  )
}

/**
 * A Place's outline from Pleiades's `extent` GeoJSON, in two dimensions.
 * Some outlines carry a height or a NaN; a vertex without a usable position
 * is dropped, and an outline left with too few vertices is no outline.
 */
export function parseExtent(text: string): Polygon | undefined {
  if (!text.trim()) return undefined
  const geometry = JSON.parse(text.replace(/\bNaN\b/g, "null")) as {
    type: string
    coordinates: unknown
  }
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
    return undefined
  const ring = (vertices: (number | null)[][]) => {
    const kept = vertices
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
      .map(([lng, lat]) => [lng, lat] as number[])
    return kept.length >= 4 ? (roundCoords(kept, 3) as number[][]) : undefined
  }
  const polygon = (rings: (number | null)[][][]) => {
    const kept = rings.map(ring)
    return kept[0] ? kept.filter((r) => r !== undefined) : undefined
  }
  if (geometry.type === "Polygon") {
    const coordinates = polygon(geometry.coordinates as (number | null)[][][])
    return coordinates ? { type: "Polygon", coordinates } : undefined
  }
  const coordinates = (geometry.coordinates as (number | null)[][][][])
    .map(polygon)
    .filter((p) => p !== undefined)
  return coordinates.length ? { type: "MultiPolygon", coordinates } : undefined
}

function numbers(text: string): number[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
}

function year(text: string): number | null {
  return text.trim() ? Number(text) : null
}

function precisionOf(row: Record<string, string>): Precision {
  if (!row.reprLat?.trim() || row.locationPrecision === "unlocated")
    return "unlocated"
  return row.locationPrecision === "precise" ? "precise" : "rough"
}

/**
 * The slim snapshot, one Place per line in ID order, from Pleiades's places
 * and names CSVs. Fixed key order and rounding keep a monthly refresh's diff
 * down to what Pleiades changed.
 */
export function cutSnapshot(placesCsv: string, namesCsv: string): string {
  const names = new Map<string, [string, string][]>()
  for (const row of parseCsv(namesCsv)) {
    const pid = row.pid?.split("/").at(-1) ?? ""
    const list = names.get(pid) ?? []
    const language = row.nameLanguage?.trim() ?? ""
    const forms = [
      row.nameAttested ?? "",
      ...(row.nameTransliterated ?? "").split(","),
    ]
    for (const form of forms.map((f) => f.trim()).filter(Boolean))
      if (!list.some(([n, l]) => n === form && l === language))
        list.push([form, language])
    names.set(pid, list)
  }

  const places = parseCsv(placesCsv).map((row): Place => {
    const types = (row.featureTypes ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .sort()
    const precision = precisionOf(row)
    const bbox = numbers(row.bbox ?? "")
    const place: Place = {
      id: `pleiades:${row.id}`,
      title: row.title ?? "",
      // Sorted, so a refresh that reorders Pleiades's rows changes nothing.
      names: (names.get(row.id ?? "") ?? []).sort(
        ([a, la], [b, lb]) => a.localeCompare(b) || la.localeCompare(lb),
      ),
      types,
      precision,
      point:
        precision === "unlocated"
          ? null
          : [round(Number(row.reprLong), 4), round(Number(row.reprLat), 4)],
      bbox:
        bbox.length === 4
          ? (bbox.map((n) => round(n, 4)) as Place["bbox"])
          : null,
      periods: (row.timePeriodsKeys ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .sort(),
      start: year(row.minDate ?? ""),
      end: year(row.maxDate ?? ""),
    }
    const extent = types.some((t) => AREAL_TYPES.has(t))
      ? parseExtent(row.extent ?? "")
      : undefined
    if (extent) place.extent = extent
    return place
  })
  places.sort((a, b) => Number(a.id.slice(9)) - Number(b.id.slice(9)))
  return places.map((p) => JSON.stringify(p)).join("\n") + "\n"
}

let cache: Map<PlaceId, Place> | undefined

/** Every Place in the committed snapshot, by ID. */
export function readPlaces(file = PLEIADES_SNAPSHOT): Map<PlaceId, Place> {
  if (file === PLEIADES_SNAPSHOT && cache) return cache
  const places = new Map<PlaceId, Place>()
  if (existsSync(file))
    for (const line of readFileSync(file, "utf8").split("\n"))
      if (line.trim()) {
        const place = JSON.parse(line) as Place
        places.set(place.id, place)
      }
  if (file === PLEIADES_SNAPSHOT) cache = places
  return places
}

export function readSnapshotSource(): SnapshotSource | undefined {
  return existsSync(PLEIADES_SOURCE)
    ? (JSON.parse(readFileSync(PLEIADES_SOURCE, "utf8")) as SnapshotSource)
    : undefined
}
