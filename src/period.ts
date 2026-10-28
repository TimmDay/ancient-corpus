// The Period covered by a Work and its divisions, for narrowing a search by
// date. A Work or division with no recorded years is never left out.

import type { Work } from "./corpus.ts"

/** The years a Work, or one of its divisions, narrates; an end is undefined where it is unclear. */
export type Period = { earliest?: number; latest?: number }

/** A division's recorded years, else the Work's. */
export function periodOf(work: Work, division?: string): Period {
  const span = work.divisionSpans?.find(([label]) => label === division)?.[1]
  if (span) return { earliest: span[0], latest: span[1] }
  return {
    earliest: work.coversYearEarliest ?? undefined,
    latest: work.coversYearLatest ?? undefined,
  }
}

/**
 * Whether a Work, or one of its divisions, may narrate anything between two
 * years. Only years known to fall outside rule it out.
 */
export function mayCover(
  work: Work,
  from: number,
  to: number,
  division?: string,
): boolean {
  const { earliest, latest } = periodOf(work, division)
  return (
    (latest === undefined || latest >= from) &&
    (earliest === undefined || earliest <= to)
  )
}
