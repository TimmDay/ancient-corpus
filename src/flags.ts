// What an unresolved Flag means, in words for someone reading the site.

import type { Flag } from "./corpus.ts"

/** Why a flagged Passage may not match the printed source. */
export function flagExplanation(locator: string, flag: Flag): string {
  switch (flag.code) {
    case "gap": {
      if (/starts at/.test(flag.detail))
        return `This book starts at ${locator}, not at chapter 1. The chapters before it may be missing, or numbered differently in the print.`
      const [, next, missing] = /numbered (\S+), not (\S+)$/.exec(
        flag.detail,
      ) ?? [undefined, "?", "?"]
      return `The numbering jumps from ${locator} to ${next}. Chapter ${missing} may be inside this Passage without its number, or missing.`
    }
    case "duplicate":
      return `An earlier Passage is also numbered ${locator}. One of the two may carry the wrong number.`
    case "long": {
      const [, words, median] = /^(\d+) words; .* median is (\d+)$/.exec(
        flag.detail,
      ) ?? [undefined, undefined, undefined]
      const size =
        words && median
          ? ` (${Number(words).toLocaleString("en")} words, where most in its book are about ${median})`
          : ""
      return `This Passage is far longer than the others${size}. It may run on into the chapters after it, or into the translator’s notes.`
    }
  }
}
