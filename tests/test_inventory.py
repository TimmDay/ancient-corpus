from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from ingestion.inventory import inspect_archive, make_manifest, series_key


SAMPLE_HTML = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="dc.title" content="Sample History">
<meta name="dc.creator" content="Example, Author">
<meta name="dc.language" content="en">
<meta name="dc.rights" content="Public domain test fixture">
<meta name="dcterms.source" content="https://www.gutenberg.org/files/12345/12345-h/12345-h.htm">
</head><body id="pg-header">
<h1>BOOK I</h1><h2>CHAPTER 1</h2>
<p id="p1">I, 1.—A test passage.</p>
<p id="p2">Another test passage.</p>
</body></html>""".encode("utf-8")


class InventoryTests(unittest.TestCase):
    def test_valid_archive_metadata_and_structure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            intake = root / "data" / "intake"
            intake.mkdir(parents=True)
            archive_path = intake / "Sample-History-vol1.zip"
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("pg12345-images.html", SAMPLE_HTML)

            record = inspect_archive(archive_path, intake)

            self.assertTrue(record["archive"]["valid_zip"])
            self.assertEqual(record["metadata"]["gutenberg_id"], "12345")
            self.assertEqual(record["metadata"]["title"], "Sample History")
            self.assertEqual(record["structure"]["paragraph_count"], 2)
            self.assertEqual(record["structure"]["citation_signals"]["book_markers_in_headings"], 1)
            self.assertFalse(
                record["structure"]["text_quality_signals"]["possible_ocr_or_encoding_issue"]
            )
            self.assertEqual(record["structure"]["content_scope_signals"], [])

    def test_unsafe_member_is_flagged_without_extraction(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            intake = root / "data" / "intake"
            intake.mkdir(parents=True)
            archive_path = intake / "unsafe.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("../escape.html", SAMPLE_HTML)

            record = inspect_archive(archive_path, intake)

            self.assertEqual(record["archive"]["unsafe_member_paths"], ["../escape.html"])
            self.assertIn("unsafe_member_paths", record["review"]["issues"])
            self.assertFalse((root / "data" / "escape.html").exists())

    def test_corrupt_archive_is_deferred(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            intake = root / "data" / "intake"
            intake.mkdir(parents=True)
            archive_path = intake / "broken.zip"
            archive_path.write_bytes(b"PK\x03\x04truncated")

            record = inspect_archive(archive_path, intake)

            self.assertFalse(record["archive"]["valid_zip"])
            self.assertEqual(record["review"]["status"], "deferred_corrupt_archive")

    def test_exact_duplicates_are_marked(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            intake = root / "data" / "intake"
            intake.mkdir(parents=True)
            for name in ("one.zip", "two.zip"):
                with zipfile.ZipFile(intake / name, "w", zipfile.ZIP_DEFLATED) as archive:
                    archive.writestr("pg12345-images.html", SAMPLE_HTML)

            records = [inspect_archive(path, intake) for path in sorted(intake.glob("*.zip"))]
            manifest = make_manifest(intake, records)

            self.assertEqual(manifest["summary"]["exact_duplicate_count"], 1)
            self.assertEqual(manifest["archives"][1]["review"]["status"], "duplicate")

    def test_series_key_removes_volume_and_book_ranges(self) -> None:
        self.assertEqual(series_key("Dio-Rome-vol6.zip"), "dio-rome")
        self.assertEqual(series_key("Livy-HistoryRome-books09_26.zip"), "livy-historyrome")


if __name__ == "__main__":
    unittest.main()
