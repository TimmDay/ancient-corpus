#!/usr/bin/env python3
"""Read-only inventory of candidate corpus ZIP archives.

The tool never extracts archive members to disk and never writes beneath the
intake directory. It emits a machine-readable JSON manifest and a Markdown
review report.
"""

from __future__ import annotations

import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable
import zipfile


INVENTORY_VERSION = "1.0"
MAX_HTML_BYTES = 25 * 1024 * 1024
SUSPICIOUS_COMPRESSION_RATIO = 200
SUSPICIOUS_UNCOMPRESSED_BYTES = 500 * 1024 * 1024
SUSPICIOUS_MEMBER_COUNT = 10_000


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iso_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()


def decode_html(raw: bytes) -> tuple[str, str]:
    head = raw[:4096]
    charset_match = re.search(
        br"charset\s*=\s*[\"']?\s*([A-Za-z0-9._-]+)", head, flags=re.IGNORECASE
    )
    candidates = []
    if charset_match:
        candidates.append(charset_match.group(1).decode("ascii", "ignore"))
    candidates.extend(["utf-8-sig", "windows-1252", "latin-1"])

    for encoding in dict.fromkeys(candidates):
        try:
            return raw.decode(encoding), encoding
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", "replace"), "utf-8-replacement"


def normalized_space(value: str) -> str:
    return " ".join(html.unescape(value).split())


class DocumentParser(HTMLParser):
    """Collect metadata and coarse structural signals without rendering HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, list[str]] = defaultdict(list)
        self.links: dict[str, list[str]] = defaultdict(list)
        self.tag_counts: Counter[str] = Counter()
        self.class_counts: Counter[str] = Counter()
        self.ids: list[str] = []
        self.headings: list[dict[str, str]] = []
        self.title_parts: list[str] = []
        self.visible_text_parts: list[str] = []
        self._heading_tag: str | None = None
        self._heading_parts: list[str] = []
        self._in_title = False
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attributes = {key.lower(): value or "" for key, value in attrs}
        self.tag_counts[tag] += 1

        if tag in {"script", "style"}:
            self._skip_depth += 1

        element_id = attributes.get("id")
        if element_id:
            self.ids.append(element_id)

        for class_name in attributes.get("class", "").split():
            self.class_counts[class_name.lower()] += 1

        if tag == "meta":
            key = (attributes.get("name") or attributes.get("property") or "").lower()
            content = normalized_space(attributes.get("content", ""))
            if key and content:
                self.meta[key].append(content)

        if tag == "link":
            rels = attributes.get("rel", "").lower().split()
            href = attributes.get("href", "")
            for rel in rels:
                if href:
                    self.links[rel].append(href)

        if tag == "title":
            self._in_title = True
        if re.fullmatch(r"h[1-6]", tag):
            self._heading_tag = tag
            self._heading_parts = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self._in_title = False
        if self._heading_tag == tag:
            value = normalized_space("".join(self._heading_parts))
            if value:
                self.headings.append({"level": tag, "text": value})
            self._heading_tag = None
            self._heading_parts = []
        if tag in {"script", "style"} and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._in_title:
            self.title_parts.append(data)
        if self._heading_tag:
            self._heading_parts.append(data)
        if data.strip():
            self.visible_text_parts.append(data)


def first(values: Iterable[str] | None) -> str | None:
    if not values:
        return None
    for value in values:
        if value:
            return value
    return None


def all_values(parser: DocumentParser, *keys: str) -> list[str]:
    values: list[str] = []
    for key in keys:
        values.extend(parser.meta.get(key.lower(), []))
    return list(dict.fromkeys(values))


def gutenberg_id(parser: DocumentParser, member_name: str) -> str | None:
    candidates = []
    candidates.extend(parser.links.get("dcterms.isformatof", []))
    candidates.extend(parser.meta.get("dcterms.source", []))
    for value in candidates:
        match = re.search(r"(?:ebooks|files)/(\d+)", value)
        if match:
            return match.group(1)
    match = re.search(r"(?:^|/)pg(\d+)(?:-images)?\.html?$", member_name, re.IGNORECASE)
    return match.group(1) if match else None


def analyze_html(raw: bytes, member_name: str) -> dict[str, Any]:
    text, encoding = decode_html(raw)
    parser = DocumentParser()
    parse_error = None
    try:
        parser.feed(text)
        parser.close()
    except Exception as exc:  # HTMLParser is tolerant, but inventory must continue.
        parse_error = f"{type(exc).__name__}: {exc}"

    visible_text = normalized_space(" ".join(parser.visible_text_parts))
    headings_text = "\n".join(item["text"] for item in parser.headings)
    duplicate_ids = sorted(key for key, count in Counter(parser.ids).items() if count > 1)

    citation_signals = {
        "book_markers_in_headings": len(
            re.findall(r"\bBOOK\s+(?:[IVXLCDM]+|\d+)\b", headings_text, re.IGNORECASE)
        ),
        "chapter_markers_in_headings": len(
            re.findall(r"\bCHAPTER\s+(?:[IVXLCDM]+|\d+)\b", headings_text, re.IGNORECASE)
        ),
        "letter_markers_in_headings": len(
            re.findall(r"\bLETTER\s+(?:[IVXLCDM]+|\d+)\b", headings_text, re.IGNORECASE)
        ),
        "fragment_markers": len(
            re.findall(r"\bFRAG(?:MENT)?\.?\s*\d+", visible_text, re.IGNORECASE)
        ),
        "numbered_section_markers": len(
            re.findall(r"\b(?:[IVXLCDM]+|\d+)\s*,\s*\d+\s*[.—-]", visible_text)
        ),
    }

    source_links = list(parser.links.get("dcterms.isformatof", []))
    source_links.extend(parser.meta.get("dcterms.source", []))
    metadata = {
        "title": first(all_values(parser, "dc.title", "dcterms.title"))
        or normalized_space("".join(parser.title_parts))
        or None,
        "creators": all_values(parser, "dc.creator", "dcterms.creator"),
        "translators": all_values(parser, "marcrel.trl"),
        "editors": all_values(parser, "marcrel.edt"),
        "languages": all_values(parser, "dc.language", "dcterms.language"),
        "subjects": all_values(parser, "dc.subject", "dcterms.subject"),
        "rights": all_values(parser, "dc.rights", "dcterms.rights"),
        "created": first(all_values(parser, "dcterms.created")),
        "modified": first(all_values(parser, "dcterms.modified")),
        "source_urls": list(dict.fromkeys(source_links)),
        "gutenberg_id": gutenberg_id(parser, member_name),
        "generator": first(all_values(parser, "generator")),
    }

    title_text = (metadata["title"] or "").lower()
    scope_patterns = {
        "volume_or_part": r"\b(?:vol(?:ume)?\.?|part)\s*(?:[ivxlcdm]+|\d+)",
        "book_range": r"\bbooks?\s+(?:[ivxlcdm]+|\d+)\s+(?:to|and|[-–])\s+(?:[ivxlcdm]+|\d+|the end)",
        "selected_or_extract": r"\b(?:selected|selections|extract)\b",
        "abridgment": r"\babridg(?:e)?ment\b",
        "epitome_or_fragments": r"\b(?:epitome|fragments?|remains)\b",
        "claims_complete": r"\bcomplete\b",
    }
    scope_signals = [
        label for label, pattern in scope_patterns.items() if re.search(pattern, title_text, re.IGNORECASE)
    ]
    editorial_heading_count = sum(
        bool(
            re.search(
                r"\b(?:introduction|preface|foreword|bibliography|notes?|appendix|index)\b",
                heading["text"],
                re.IGNORECASE,
            )
        )
        for heading in parser.headings
    )
    mixed_alphanumeric_tokens = len(
        re.findall(r"\b(?=\w*[A-Za-z])(?=\w*\d)[A-Za-z0-9]{4,}\b", visible_text)
    )
    unicode_replacement_count = text.count("\ufffd")
    ocr_suspected = unicode_replacement_count > 10 or (
        parser.tag_counts["p"] < 5 and parser.tag_counts["img"] > 20
    )

    structure = {
        "encoding": encoding,
        "parse_error": parse_error,
        "paragraph_count": parser.tag_counts["p"],
        "heading_count": sum(parser.tag_counts[f"h{level}"] for level in range(1, 7)),
        "headings_sample": parser.headings[:20],
        "id_count": len(parser.ids),
        "duplicate_id_count": len(duplicate_ids),
        "duplicate_ids_sample": duplicate_ids[:20],
        "image_count": parser.tag_counts["img"],
        "table_count": parser.tag_counts["table"],
        "footnote_element_count": parser.class_counts["footnote"],
        "page_number_element_count": parser.class_counts["pagenum"],
        "sidenote_element_count": parser.class_counts["sidenote"],
        "has_gutenberg_header": "pg-header" in parser.ids,
        "has_gutenberg_footer": "pg-footer" in parser.ids,
        "citation_signals": citation_signals,
        "content_scope_signals": scope_signals,
        "editorial_heading_count": editorial_heading_count,
        "text_quality_signals": {
            "unicode_replacement_character_count": unicode_replacement_count,
            "mixed_letter_digit_token_count": mixed_alphanumeric_tokens,
            "possible_ocr_or_encoding_issue": ocr_suspected,
            "method": "low-confidence heuristic; requires human confirmation",
        },
        "primary_document_sha256": hashlib.sha256(raw).hexdigest(),
    }
    return {"metadata": metadata, "structure": structure, "visible_text": visible_text}


def unsafe_member_name(name: str) -> bool:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    return path.is_absolute() or ".." in path.parts


def series_key(filename: str) -> str:
    stem = Path(filename).stem.lower().replace("_", "-")
    stem = re.sub(r"-(?:vol(?:ume)?-?\d+|books?-?\d+(?:-\d+|-end)?)(?:-.*)?$", "", stem)
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return stem


def category_suggestion(filename: str, metadata: dict[str, Any]) -> dict[str, Any]:
    combined = " ".join(
        [filename, metadata.get("title") or "", *metadata.get("creators", [])]
    ).lower()
    if any(
        term in combined
        for term in ("historic tales", "heathenism and christianity", "boys' and girls'", "abridgment")
    ):
        category = "modern_secondary_or_derivative"
    elif any(term in combined for term in ("bible", "deuterocanonical")):
        category = "scripture_collection"
    elif any(
        term in combined
        for term in ("ambrose", "augustine", "hippolytus", "pistis sophia")
    ):
        category = "late_antique_christian_source"
    elif "justinian" in combined and any(term in combined for term in ("institute", "law")):
        category = "ancient_legal_source"
    else:
        category = "ancient_text_translation_or_edition"
    return {
        "suggested_category": category,
        "confidence": "low",
        "requires_human_confirmation": True,
    }


def readiness(record: dict[str, Any]) -> tuple[str, int, list[str]]:
    archive = record["archive"]
    metadata = record.get("metadata", {})
    structure = record.get("structure", {})
    issues: list[str] = []
    score = 0

    if not archive["valid_zip"]:
        return "deferred_corrupt_archive", 0, ["archive_not_readable"]

    score += 10
    if archive["unsafe_member_paths"]:
        issues.append("unsafe_member_paths")
    if archive["encrypted_member_count"]:
        issues.append("encrypted_members")
    if archive["suspicious_size_or_ratio"]:
        issues.append("suspicious_archive_size_or_compression_ratio")

    if record.get("primary_document"):
        score += 20
    else:
        issues.append("no_html_document")
        return "needs_structural_review", score, issues

    for field in ("title", "creators", "languages", "rights", "source_urls"):
        if metadata.get(field):
            score += 6
        else:
            issues.append(f"missing_{field}")

    paragraphs = structure.get("paragraph_count", 0)
    headings = structure.get("heading_count", 0)
    ids = structure.get("id_count", 0)
    if paragraphs >= 50:
        score += 10
    elif paragraphs:
        score += 5
        issues.append("low_paragraph_count")
    else:
        issues.append("no_paragraph_markup")
    if headings >= 5:
        score += 8
    elif headings:
        score += 4
        issues.append("weak_heading_structure")
    else:
        issues.append("no_heading_structure")
    if ids >= 10:
        score += 7
    elif ids:
        score += 3
        issues.append("few_addressable_elements")
    else:
        issues.append("no_addressable_elements")

    citation_total = sum(structure.get("citation_signals", {}).values())
    if citation_total >= 5:
        score += 15
    elif citation_total:
        score += 8
        issues.append("limited_citation_signals")
    else:
        issues.append("no_detected_citation_signals")

    if structure.get("parse_error"):
        issues.append("html_parse_error")
    if structure.get("text_quality_signals", {}).get("possible_ocr_or_encoding_issue"):
        issues.append("possible_ocr_or_encoding_issue")
    if structure.get("has_gutenberg_header"):
        issues.append("gutenberg_boilerplate_requires_removal")
    if structure.get("footnote_element_count"):
        issues.append("footnotes_require_structuring")
    if structure.get("page_number_element_count"):
        issues.append("print_page_markers_require_separation")

    score = min(score, 100)
    blocking_safety = {"unsafe_member_paths", "encrypted_members", "suspicious_archive_size_or_compression_ratio"}
    if blocking_safety.intersection(issues):
        status = "needs_structural_review"
    elif any(issue.startswith("missing_") for issue in issues):
        status = "needs_metadata_review"
    elif "no_detected_citation_signals" in issues or "possible_ocr_or_encoding_issue" in issues:
        status = "needs_structural_review"
    else:
        status = "ready_with_custom_importer"
    return status, score, issues


def inspect_archive(path: Path, intake_root: Path) -> dict[str, Any]:
    relative_path = path.relative_to(intake_root.parent.parent).as_posix()
    stat = path.stat()
    record: dict[str, Any] = {
        "archive_path": relative_path,
        "filename": path.name,
        "size_bytes": stat.st_size,
        "modified_at": iso_mtime(path),
        "sha256": sha256_file(path),
        "series_key": series_key(path.name),
    }

    archive_info: dict[str, Any] = {
        "valid_zip": False,
        "error": None,
        "member_count": 0,
        "compressed_bytes": 0,
        "uncompressed_bytes": 0,
        "max_compression_ratio": 0.0,
        "unsafe_member_paths": [],
        "encrypted_member_count": 0,
        "nested_archive_members": [],
        "html_members": [],
        "image_member_count": 0,
        "suspicious_size_or_ratio": False,
    }
    record["archive"] = archive_info

    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            archive_info["valid_zip"] = True
            archive_info["member_count"] = len(members)
            archive_info["compressed_bytes"] = sum(member.compress_size for member in members)
            archive_info["uncompressed_bytes"] = sum(member.file_size for member in members)
            archive_info["unsafe_member_paths"] = [
                member.filename for member in members if unsafe_member_name(member.filename)
            ]
            archive_info["encrypted_member_count"] = sum(
                1 for member in members if member.flag_bits & 0x1
            )
            archive_info["nested_archive_members"] = [
                member.filename
                for member in members
                if Path(member.filename).suffix.lower() in {".zip", ".tar", ".gz", ".7z", ".rar"}
            ]
            html_members = [
                member
                for member in members
                if not member.is_dir() and Path(member.filename).suffix.lower() in {".html", ".htm", ".xhtml"}
            ]
            archive_info["html_members"] = [member.filename for member in html_members]
            archive_info["image_member_count"] = sum(
                1
                for member in members
                if Path(member.filename).suffix.lower()
                in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
            )
            ratios = [
                member.file_size / max(member.compress_size, 1)
                for member in members
                if member.file_size
            ]
            archive_info["max_compression_ratio"] = round(max(ratios, default=0.0), 2)
            archive_info["suspicious_size_or_ratio"] = bool(
                len(members) > SUSPICIOUS_MEMBER_COUNT
                or archive_info["uncompressed_bytes"] > SUSPICIOUS_UNCOMPRESSED_BYTES
                or archive_info["max_compression_ratio"] > SUSPICIOUS_COMPRESSION_RATIO
            )

            if html_members:
                primary = max(html_members, key=lambda member: member.file_size)
                record["primary_document"] = {
                    "member_name": primary.filename,
                    "size_bytes": primary.file_size,
                }
                if primary.file_size > MAX_HTML_BYTES:
                    record["primary_document"]["error"] = "html_exceeds_inventory_read_limit"
                elif unsafe_member_name(primary.filename) or primary.flag_bits & 0x1:
                    record["primary_document"]["error"] = "html_member_not_safe_to_read"
                else:
                    with archive.open(primary, "r") as stream:
                        raw = stream.read(MAX_HTML_BYTES + 1)
                    if len(raw) > MAX_HTML_BYTES:
                        record["primary_document"]["error"] = "html_exceeds_inventory_read_limit"
                    else:
                        analysis = analyze_html(raw, primary.filename)
                        record["metadata"] = analysis["metadata"]
                        record["structure"] = analysis["structure"]
                        record["classification"] = category_suggestion(
                            path.name, analysis["metadata"]
                        )
    except (zipfile.BadZipFile, OSError, RuntimeError) as exc:
        archive_info["error"] = f"{type(exc).__name__}: {exc}"

    status, score, issues = readiness(record)
    record["review"] = {
        "status": status,
        "ingestion_readiness_score": score,
        "issues": issues,
        "human_review_required": status != "ready",
    }
    record["duplicate_of"] = None
    record["probable_duplicate_of"] = None
    return record


def assign_duplicates(records: list[dict[str, Any]]) -> None:
    by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_source_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_hash[record["sha256"]].append(record)
        source_id = record.get("metadata", {}).get("gutenberg_id")
        if source_id:
            by_source_id[source_id].append(record)

    for group in by_hash.values():
        if len(group) > 1:
            canonical = group[0]["archive_path"]
            for record in group[1:]:
                record["duplicate_of"] = canonical
                record["review"]["status"] = "duplicate"
                record["review"]["issues"].append("exact_duplicate")

    for group in by_source_id.values():
        unique_hashes = {record["sha256"] for record in group}
        if len(group) > 1 and len(unique_hashes) > 1:
            canonical = group[0]["archive_path"]
            for record in group[1:]:
                if not record["duplicate_of"]:
                    record["probable_duplicate_of"] = canonical
                    record["review"]["issues"].append("same_digital_source_id")


def choose_validation_batch(records: list[dict[str, Any]]) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    used: set[str] = set()

    def pick(predicate: Any, rationale: str, order_key: Any | None = None) -> None:
        candidates = [record for record in records if record["archive_path"] not in used and predicate(record)]
        if not candidates:
            return
        if order_key:
            candidates.sort(key=order_key, reverse=True)
        else:
            candidates.sort(key=lambda record: record["filename"])
        choice = candidates[0]
        used.add(choice["archive_path"])
        selected.append({"archive_path": choice["archive_path"], "rationale": rationale})

    pick(
        lambda record: not record["archive"]["valid_zip"],
        "Negative fixture for corrupt-archive handling.",
    )
    pick(
        lambda record: record["filename"].startswith("Dio-Rome-vol1"),
        "Composite epitome/fragments case with overlapping citation systems.",
    )
    pick(
        lambda record: "Letters" in record["filename"],
        "Epistolary structure and letter-level citation case.",
        lambda record: record.get("structure", {}).get("heading_count", 0),
    )
    pick(
        lambda record: record["archive"].get("image_member_count", 0) > 10,
        "Image-heavy Gutenberg package and mixed ancillary assets.",
        lambda record: record["archive"].get("image_member_count", 0),
    )
    pick(
        lambda record: "Bible" in record["filename"],
        "Large hierarchical work with book/chapter addressing.",
    )
    pick(
        lambda record: record.get("classification", {}).get("suggested_category")
        == "modern_secondary_or_derivative",
        "Boundary case for separating ancient sources from modern derivative material.",
    )
    pick(
        lambda record: record["review"]["status"] == "needs_structural_review",
        "Low or ambiguous citation structure requiring manual mapping.",
        lambda record: -record["review"]["ingestion_readiness_score"],
    )
    return selected


def make_manifest(intake_root: Path, records: list[dict[str, Any]]) -> dict[str, Any]:
    assign_duplicates(records)
    statuses = Counter(record["review"]["status"] for record in records)
    issues = Counter(issue for record in records for issue in record["review"]["issues"])
    categories = Counter(
        record.get("classification", {}).get("suggested_category", "unclassified")
        for record in records
    )
    series = defaultdict(list)
    for record in records:
        series[record["series_key"]].append(record["archive_path"])
    series_groups = {
        key: paths for key, paths in sorted(series.items()) if len(paths) > 1
    }
    return {
        "inventory_version": INVENTORY_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "intake_root": intake_root.relative_to(intake_root.parent.parent).as_posix(),
        "summary": {
            "archive_count": len(records),
            "total_archive_bytes": sum(record["size_bytes"] for record in records),
            "valid_zip_count": sum(record["archive"]["valid_zip"] for record in records),
            "invalid_zip_count": sum(not record["archive"]["valid_zip"] for record in records),
            "status_counts": dict(sorted(statuses.items())),
            "issue_counts": dict(sorted(issues.items())),
            "suggested_category_counts": dict(sorted(categories.items())),
            "series_group_count": len(series_groups),
            "exact_duplicate_count": sum(bool(record["duplicate_of"]) for record in records),
            "probable_duplicate_count": sum(
                bool(record["probable_duplicate_of"]) for record in records
            ),
        },
        "series_groups": series_groups,
        "recommended_validation_batch": choose_validation_batch(records),
        "archives": records,
    }


def markdown_table(rows: list[list[Any]], headers: list[str]) -> str:
    def cell(value: Any) -> str:
        return str(value).replace("|", "\\|").replace("\n", " ")

    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(cell(value) for value in row) + " |" for row in rows)
    return "\n".join(lines)


def render_report(manifest: dict[str, Any]) -> str:
    summary = manifest["summary"]
    records = manifest["archives"]
    lines = [
        "# Candidate Corpus Intake Report",
        "",
        f"Generated: `{manifest['generated_at']}`",
        "",
        "This report is generated by `python3 ingestion/inventory.py`. The inventory is read-only: it does not extract, modify, normalize, embed, or publish candidate texts.",
        "",
        "## Summary",
        "",
        f"- Candidate archives: **{summary['archive_count']}**",
        f"- Total compressed size: **{summary['total_archive_bytes'] / (1024 * 1024):.1f} MiB**",
        f"- Valid ZIP archives: **{summary['valid_zip_count']}**",
        f"- Invalid/corrupt ZIP archives: **{summary['invalid_zip_count']}**",
        f"- Exact duplicates: **{summary['exact_duplicate_count']}**",
        f"- Probable duplicates by digital source ID: **{summary['probable_duplicate_count']}**",
        f"- Multi-file series groups: **{summary['series_group_count']}**",
        "",
        "## Review status",
        "",
        markdown_table(
            [[status, count] for status, count in summary["status_counts"].items()],
            ["Status", "Count"],
        ),
        "",
        "Statuses are automated triage labels, not publication approval. Every candidate still requires human confirmation of attribution, edition metadata, rights, and citation mapping.",
        "",
        "## Integrity and safety findings",
        "",
    ]

    invalid = [record for record in records if not record["archive"]["valid_zip"]]
    if invalid:
        lines.append(
            markdown_table(
                [
                    [record["archive_path"], record["archive"].get("error") or "Unreadable ZIP"]
                    for record in invalid
                ],
                ["Archive", "Finding"],
            )
        )
    else:
        lines.append("No corrupt or unreadable archives detected.")

    lines.extend(["", "### Common issues", ""])
    lines.append(
        markdown_table(
            [[issue, count] for issue, count in summary["issue_counts"].items()],
            ["Issue", "Archives"],
        )
    )

    lines.extend(["", "## Automated content-category suggestions", ""])
    lines.append(
        markdown_table(
            [
                [category, count]
                for category, count in summary["suggested_category_counts"].items()
            ],
            ["Suggested category", "Archives"],
        )
    )
    lines.append("")
    lines.append(
        "These filename/metadata-based suggestions are deliberately low-confidence and require human confirmation."
    )

    lines.extend(["", "## Candidates requiring attention", ""])
    attention = [
        record
        for record in records
        if record["review"]["status"] != "ready_with_custom_importer"
    ]
    if attention:
        lines.append(
            markdown_table(
                [
                    [
                        record["archive_path"],
                        record["review"]["status"],
                        ", ".join(record["review"]["issues"]) or "—",
                    ]
                    for record in attention
                ],
                ["Archive", "Status", "Issues"],
            )
        )
    else:
        lines.append("No candidates were automatically flagged for attention.")

    lines.extend(["", "## Multi-file series", ""])
    if manifest["series_groups"]:
        lines.append(
            markdown_table(
                [
                    [key, len(paths), ", ".join(Path(path).name for path in paths)]
                    for key, paths in manifest["series_groups"].items()
                ],
                ["Series key", "Files", "Members"],
            )
        )
    else:
        lines.append("No multi-file series detected.")

    lines.extend(["", "## Recommended importer-validation batch", ""])
    lines.append(
        markdown_table(
            [
                [item["archive_path"], item["rationale"]]
                for item in manifest["recommended_validation_batch"]
            ],
            ["Archive", "Reason selected"],
        )
    )

    lines.extend(["", "## Candidate details", ""])
    detail_rows = []
    for record in records:
        metadata = record.get("metadata", {})
        structure = record.get("structure", {})
        detail_rows.append(
            [
                record["filename"],
                record["review"]["status"],
                record["review"]["ingestion_readiness_score"],
                metadata.get("gutenberg_id") or "—",
                metadata.get("title") or "—",
                ", ".join(metadata.get("creators", [])) or "—",
                ", ".join(metadata.get("languages", [])) or "—",
                structure.get("paragraph_count", "—"),
                structure.get("heading_count", "—"),
            ]
        )
    lines.append(
        markdown_table(
            detail_rows,
            ["Archive", "Status", "Score", "PG ID", "Title", "Creator", "Language", "¶", "Headings"],
        )
    )

    lines.extend(
        [
            "",
            "## Interpretation and next actions",
            "",
            "1. Replace or re-download corrupt archives before importer development.",
            "2. Confirm automated series grouping and content-category suggestions.",
            "3. Review rights and bibliographic metadata for every intended publication jurisdiction.",
            "4. Use the recommended validation batch to build Gutenberg HTML boundary detection and citation mapping.",
            "5. Manually verify sample passage boundaries and citations before accepting a source.",
            "6. Re-run this inventory whenever candidate files change; compare checksums and manifest diffs.",
            "",
            "The full archive-level evidence, flags, checksums, metadata, structure counts, and classification suggestions are in `ingestion/manifests/intake-inventory.json`.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--intake", type=Path, default=Path("data/intake"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("ingestion/manifests/intake-inventory.json"),
    )
    parser.add_argument("--report", type=Path, default=Path("docs/intake-report.md"))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    intake_root = args.intake.resolve()
    if not intake_root.is_dir():
        print(f"Intake directory does not exist: {intake_root}", file=sys.stderr)
        return 2

    archive_paths = sorted(intake_root.rglob("*.zip"))
    records = [inspect_archive(path, intake_root) for path in archive_paths]
    manifest = make_manifest(intake_root, records)

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.report.write_text(render_report(manifest), encoding="utf-8")

    print(
        f"Inventoried {manifest['summary']['archive_count']} archives: "
        f"{manifest['summary']['valid_zip_count']} valid, "
        f"{manifest['summary']['invalid_zip_count']} invalid."
    )
    print(f"Manifest: {args.manifest}")
    print(f"Report: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
