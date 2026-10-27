#!/usr/bin/env python3
"""Importer for Suetonius' *The Lives of the Twelve Caesars* (Project Gutenberg #6400).

Parses ``data/intake/Suetonius-TwelveCaesars-complete.zip`` (a single
Gutenberg HTML file, ``pg6400-images.html``, Thomson/Forester translation)
into one normalized passage record per numbered chapter of each of the
twelve Lives, and writes them as JSON Lines to
``data/normalized/suetonius-twelve-caesars.jsonl``.

This is a pilot importer for one manually-verified text, not a generic
Gutenberg-HTML importer -- see the "hardcoded list of the twelve Lives"
note below. Chapters are not separate HTML elements in this edition: each
Life is an ``<h2>NAME</h2>`` heading, and chapters within it are marked by
a leading Roman numeral (``I.``, ``II.``, ...) at the start of a ``<p>``.

Known limitation, left for the planned manual spot-check rather than solved
here: mid-paragraph print-page markers like ``(72)`` are stripped by a
best-effort regex (see ``_strip_page_markers``), which assumes this
translation never uses a bare parenthesized number for anything else.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
INTAKE_ZIP = REPO_ROOT / "data" / "intake" / "Suetonius-TwelveCaesars-complete.zip"
HTML_MEMBER = "pg6400-images.html"
OUTPUT_PATH = REPO_ROOT / "data" / "normalized" / "suetonius-twelve-caesars.jsonl"

WORK_KEY = "suetonius-twelve-caesars"
AUTHOR = "Suetonius"
WORK_TITLE = "The Lives of the Twelve Caesars"
SOURCE_URL = "https://www.gutenberg.org/ebooks/6400"

# Ordered short names for the twelve Lives, in the order they appear in the
# text (verified by inspecting the document's <h2> headings directly --
# the two Vespasianus-Augustus-titled headings are otherwise ambiguous by
# text alone, since Titus shares his father's "Vespasianus Augustus" name).
LIFE_NAMES = [
    "Julius",
    "Augustus",
    "Tiberius",
    "Caligula",
    "Claudius",
    "Nero",
    "Galba",
    "Otho",
    "Vitellius",
    "Vespasian",
    "Titus",
    "Domitian",
]

ROMAN_VALUES = [
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
    (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
    (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
]

CHAPTER_MARKER_RE = re.compile(r"^([IVXLCDM]+)\.\s+(.*)$", re.DOTALL)
PAGE_MARKER_RE = re.compile(r"\s\(\d{1,4}\)(?=\s|$)")


def roman_to_int(roman: str) -> int:
    total = 0
    i = 0
    while i < len(roman):
        for value, symbol in ROMAN_VALUES:
            if roman.startswith(symbol, i):
                total += value
                i += len(symbol)
                break
        else:
            raise ValueError(f"Not a valid Roman numeral: {roman!r}")
    return total


def normalized_space(value: str) -> str:
    return " ".join(html.unescape(value).split())


def strip_page_markers(text: str) -> str:
    return PAGE_MARKER_RE.sub("", text)


class ParagraphExtractor(HTMLParser):
    """Extract normalized paragraph texts from one HTML slice, dropping
    footnote-reference anchors (``<a class="pginternal" href="#linknote-*">``)
    so footnote numbers never leak into passage text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paragraphs: list[str] = []
        self._in_paragraph = False
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attributes = {key.lower(): value or "" for key, value in attrs}
        if tag == "p":
            self._in_paragraph = True
            self._parts = []
        if tag == "a" and (
            attributes.get("href", "").startswith("#linknote-")
            or attributes.get("id", "").startswith("linknoteref-")
        ):
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "a" and self._skip_depth:
            self._skip_depth -= 1
        if tag == "p" and self._in_paragraph:
            text = normalized_space("".join(self._parts))
            if text:
                self.paragraphs.append(text)
            self._in_paragraph = False
            self._parts = []

    def handle_data(self, data: str) -> None:
        if self._in_paragraph and not self._skip_depth:
            self._parts.append(data)


def extract_life_heading(slice_html: str) -> str:
    """Pull the <h2> text out of a life's HTML slice, dropping any trailing
    footnote-reference anchor the same way ParagraphExtractor does."""
    extractor = ParagraphExtractor()
    match = re.search(r"<h2>(.*?)</h2>", slice_html, re.DOTALL)
    if not match:
        raise ValueError("No <h2> heading found in life slice")
    extractor.feed(f"<p>{match.group(1)}</p>")
    extractor.close()
    return extractor.paragraphs[0] if extractor.paragraphs else ""


def split_into_chapters(slice_html: str) -> list[tuple[int, str]]:
    """Split one life's HTML slice into (chapter_number, chapter_text) pairs.

    Paragraphs before the first Roman-numeral marker (front matter within
    the life, if any) are dropped rather than guessed into a chapter.

    A leading single-letter marker ("I.", "M.", "C.", "L.", "D.", "V.",
    "X.") is ambiguous -- Suetonius's prose is full of names abbreviated
    the same single-letter-plus-period way a Roman numeral is written
    (e.g. "M. Vipsanius Agrippa" = Marcus Agrippa), and that's exactly
    where the two collide. Multi-letter numerals (II, III, ..., XXIII,
    ...) have no such collision -- no Latin praenomen abbreviates to a
    multi-letter valid Roman numeral -- so they're always trusted. A
    single-letter marker is only accepted when its value is exactly the
    next expected chapter number (chapters are contiguous in this
    edition); a rejected one is folded into the current chapter's text
    instead of starting a bogus new one. Accepting any marker resyncs the
    expected-next counter, so an isolated missed chapter doesn't cascade.
    """
    extractor = ParagraphExtractor()
    extractor.feed(slice_html)
    extractor.close()

    chapters: list[tuple[int, list[str]]] = []
    expected_next = 1
    for paragraph in extractor.paragraphs:
        marker = CHAPTER_MARKER_RE.match(paragraph)
        value = roman_to_int(marker.group(1)) if marker else None
        is_ambiguous = marker is not None and len(marker.group(1)) == 1
        accept = marker is not None and (not is_ambiguous or value == expected_next)
        if accept:
            chapters.append((value, [marker.group(2)]))
            expected_next = value + 1
        elif chapters:
            chapters[-1][1].append(paragraph)
        # else: front-matter paragraph before chapter I -- dropped.

    return [
        (number, strip_page_markers(" ".join(parts)))
        for number, parts in chapters
    ]


def parse_lives(raw_html: str) -> list[dict[str, Any]]:
    heading_positions = [m.start() for m in re.finditer(r"<h2>", raw_html)]

    # Anchor on the real first Life <h2> heading rather than assuming no
    # other unattributed <h2> tags precede it -- this edition has three
    # (byline, subtitle, preface) before it. Must match the *heading*, not
    # the table-of-contents <a> entry with the same text that appears
    # earlier in the document.
    julius_heading_match = re.search(r"<h2>\s*CAIUS JULIUS", raw_html)
    if not julius_heading_match:
        raise ValueError("Could not locate the <h2> heading for the Julius life")
    first_life_index = heading_positions.index(julius_heading_match.start())

    heading_positions = heading_positions[first_life_index:]
    if len(heading_positions) < len(LIFE_NAMES) + 1:
        raise ValueError(
            f"Expected at least {len(LIFE_NAMES) + 1} <h2> headings from the first life, "
            f"found {len(heading_positions)}"
        )

    records: list[dict[str, Any]] = []
    ordinal = 0
    for index, life_name in enumerate(LIFE_NAMES):
        start = heading_positions[index]
        end = heading_positions[index + 1]
        slice_html = raw_html[start:end]

        actual_heading = extract_life_heading(slice_html)
        for chapter_number, text in split_into_chapters(slice_html):
            ordinal += 1
            citation = f"Suetonius, {life_name} {chapter_number}"
            records.append(
                {
                    "work_key": WORK_KEY,
                    "author": AUTHOR,
                    "work_title": WORK_TITLE,
                    "life": life_name,
                    "life_heading": actual_heading,
                    "chapter": chapter_number,
                    "citation": citation,
                    "text": text,
                    "ordinal": ordinal,
                    "source_url": SOURCE_URL,
                }
            )
    flag_length_outliers(records)
    return records


def flag_length_outliers(records: list[dict[str, Any]]) -> None:
    """Mark chapters whose length is a wild outlier for their life.

    Chapter/paragraph boundary detection can fail silently by *merging*
    text into the wrong chapter -- e.g. a life's true final chapter
    absorbing trailing non-numbered material (an appended translator's
    essay with no distinguishing markup, seen in this edition after
    Augustus 101) once no further chapter marker is found. That produces
    a chapter many times longer than its neighbors, which is both a
    citation-accuracy risk and bad for retrieval (one oversized, mixed
    passage embeds and quotes poorly). Flag rather than silently trust or
    guess at a cut point -- surfaced for the manual spot-check pass.
    """
    import statistics

    by_life: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        by_life.setdefault(record["life"], []).append(record)

    for life_records in by_life.values():
        word_counts = [len(r["text"].split()) for r in life_records]
        median = statistics.median(word_counts)
        for record, count in zip(life_records, word_counts):
            record["flagged_long"] = count > max(1200, 4 * median)

        # A missed chapter marker is a *silent* mis-citation, not just an
        # oversized one: chapter N quietly absorbs chapter N+1's text (and
        # N+1's own marker paragraph is folded in as plain continuation
        # text, per split_into_chapters), so it can easily stay under the
        # length-outlier threshold above while still being cited under the
        # wrong chapter number for its tail. Chapters are contiguous
        # (1..max) in this edition, so any gap is mechanically detectable:
        # flag the chapter immediately before one, since that's the one
        # that actually absorbed the missing chapter's content.
        life_records.sort(key=lambda r: r["chapter"])
        for current, nxt in zip(life_records, life_records[1:]):
            current["flagged_gap"] = nxt["chapter"] != current["chapter"] + 1
        if life_records:
            life_records[-1]["flagged_gap"] = False


def load_source_html() -> str:
    with zipfile.ZipFile(INTAKE_ZIP) as archive:
        raw = archive.read(HTML_MEMBER)
    return raw.decode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help="Where to write the normalized JSONL (default: %(default)s)",
    )
    args = parser.parse_args()

    raw_html = load_source_html()
    records = parse_lives(raw_html)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    lives_seen = {r["life"] for r in records}
    print(f"Wrote {len(records)} chapters across {len(lives_seen)} lives to {args.output}")
    long_flagged = [r for r in records if r["flagged_long"]]
    if long_flagged:
        print(f"FLAGGED {len(long_flagged)} length-outlier chapter(s) for manual review:")
        for r in long_flagged:
            print(f"  - {r['citation']} ({len(r['text'].split())} words)")
    gap_flagged = [r for r in records if r["flagged_gap"]]
    if gap_flagged:
        print(
            f"FLAGGED {len(gap_flagged)} chapter(s) that absorbed a missed "
            "chapter marker (next chapter number isn't +1):"
        )
        for r in gap_flagged:
            print(f"  - {r['citation']}")
    if len(lives_seen) != len(LIFE_NAMES):
        missing = set(LIFE_NAMES) - lives_seen
        print(f"WARNING: no chapters found for: {sorted(missing)}")


if __name__ == "__main__":
    main()
