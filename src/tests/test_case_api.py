from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest


SRC = Path(__file__).resolve().parents[1]
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from case_api import response_for, result_for_row
from test_intake_workflow import STANDARDS, canonical_zero_row


ROOT = SRC.parent
LEASE = ROOT / "examples" / "01_marcus_delgado_CNC" / "05_Lease_Statement.pdf"


def _body(fields, files):
    boundary = "----ResSparkTest"
    chunks = []
    for name, value in fields:
        chunks.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        )
    for filename, mime, payload in files:
        chunks.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="documents"; filename="{filename}"\r\n'
            f"Content-Type: {mime}\r\n\r\n".encode() + payload + b"\r\n"
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


class CaseApiTests(unittest.TestCase):
    def test_upload_is_read_and_a_blank_file_is_named(self):
        lease = LEASE.read_bytes()
        body, content_type = _body(
            [
                ("answers", json.dumps({"owns_home": False, "rents_home": True, "all_returns_filed": False})),
                ("document_metadata", json.dumps([
                    {"category": "lease", "categoryLabel": "Lease agreement", "name": LEASE.name},
                    {"category": "vehicle", "categoryLabel": "Vehicle records", "name": "notes.png"},
                ])),
            ],
            [(LEASE.name, "application/pdf", lease), ("notes.png", "image/png", b"")],
        )

        status, payload = response_for(content_type, body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["outcome"]["status"], "manual_review")
        self.assertIn("notes.png: No readable text.", payload["outcome"]["reviewNotes"])
        self.assertIn("Not all required tax returns are filed.", payload["outcome"]["reviewNotes"])
        housing = next(field for field in payload["financialSections"][0]["fields"] if field["key"] == "actual_housing_utilities")
        self.assertEqual(housing["value"], 1150)
        self.assertEqual(payload["documents"][1]["name"], "notes.png")
        self.assertEqual(payload["documents"][1]["size"], 0)

    def test_a_complete_row_uses_the_determination(self):
        result = result_for_row(canonical_zero_row(), [], [], STANDARDS)

        self.assertEqual(result["outcome"]["id"], "cnc")
        self.assertEqual(result["outcome"]["status"], "potential_match")
        self.assertEqual(result["outcome"]["shortLabel"], "Currently not collectible")

    def test_a_complete_row_without_standards_does_not_invent_a_path(self):
        blocked = canonical_zero_row()
        blocked["all_returns_filed"] = False

        unresolved = result_for_row(canonical_zero_row(), [], [], None)
        compliance = result_for_row(blocked, [], [], STANDARDS)

        self.assertEqual(unresolved["outcome"]["path"], "Standards unavailable")
        self.assertNotEqual(unresolved["outcome"]["id"], "cnc")
        self.assertEqual(compliance["outcome"]["id"], "blocked")
        self.assertEqual(compliance["outcome"]["status"], "blocked")


if __name__ == "__main__":
    unittest.main()
