from __future__ import annotations

import base64
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error


SRC = Path(__file__).resolve().parents[1]
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from case_api import _load_local_environment, case_result, response_for
from logics import BASE_URL, push_case
from test_case_api import LEASE, _body
from test_intake_workflow import STANDARDS


UPLOAD = "Documents/CaseDocument?CaseID=52103"
WHITFIELD = SRC.parent / "examples" / "02_whitfield_gregory_OIC"
ENV = {"IRS_LOGICS_KEY": "k" * 32, "IRS_LOGICS_SECRET": "shh", "IRS_LOGICS_CASEID_DEMO": "52103"}
ANSWERS = {
    "filing_status_married": False, "state_of_residence": "OH", "county_of_residence": "Franklin County",
    "household_size": 1, "dependents_count": 0, "age_taxpayer": 42, "is_wage_earner": True,
    "is_self_employed": False, "owns_home": False, "rents_home": True, "vehicle_count": 1,
    "has_real_property": False, "has_retirement_accounts": False, "has_life_insurance_cash_value": False,
    "has_investment_accounts": False, "all_returns_filed": True, "in_open_bankruptcy": False,
    "filed_bankruptcy_past_7yrs": False, "in_litigation": False, "prior_ia_or_oic_default": False,
    "filed_and_paid_timely_last_5_years": False, "installment_agreement_last_5_years": False,
}


class Recorder:
    """Stands in for urllib.request.urlopen. `fail` maps a URL suffix to an HTTP status or a reply body."""

    def __init__(self, fail: dict | None = None):
        self.requests = []
        self.fail = fail or {}

    def __call__(self, request, timeout=None):
        self.requests.append(request)
        for suffix, outcome in self.fail.items():
            if request.full_url.endswith(suffix):
                if isinstance(outcome, int):
                    raise urllib.error.HTTPError(request.full_url, outcome, "error", {}, io.BytesIO())
                return io.BytesIO(json.dumps(outcome).encode())
        return io.BytesIO(b'{"Success": true, "data": {}}')

    def to(self, path: str) -> list:
        return [request for request in self.requests if request.full_url == BASE_URL + path]


def _whitfield():
    uploads = [(path.name, path.read_bytes(), "application/pdf") for path in sorted(WHITFIELD.glob("*.pdf"))]
    metadata = [{"category": "", "categoryLabel": "Supporting documents", "name": name} for name, _, _ in uploads]
    return case_result(ANSWERS, uploads, metadata, STANDARDS), uploads


class LogicsTests(unittest.TestCase):
    def test_a_packet_sends_the_case_update_two_notes_and_every_file(self):
        result, uploads = _whitfield()
        recorder = Recorder()
        with patch.dict(os.environ, ENV), patch("urllib.request.urlopen", recorder):
            note = push_case(result, uploads)

        self.assertEqual(note, "Sent to IRS Logics case 52103.")
        expected = "Basic " + base64.b64encode(("k" * 32 + ":shh").encode()).decode()
        self.assertTrue(all(r.get_header("Authorization") == expected for r in recorder.requests))

        [update] = recorder.to("UpdateCase/UpdateCase")
        self.assertEqual(json.loads(update.data), {"CaseID": 52103, "TaxAmount": 82600, "State": "OH"})

        summary, data = [json.loads(r.data) for r in recorder.to("CaseActivity/Activity")]
        self.assertEqual(summary["CaseID"], 52103)
        self.assertEqual(summary["ActivityType"], "General")
        self.assertTrue(summary["Pin"])
        self.assertIn(result["outcome"]["path"], summary["Subject"])
        self.assertIn("professional review", summary["Comment"])
        for section in result["sourceOfTruth"]["fieldSections"]:
            self.assertIn(f"== {section['title']} ==", data["Comment"])
        self.assertIn("$2,305.90", data["Comment"])
        self.assertIn("Not provided", data["Comment"])

        documents = recorder.to(UPLOAD)
        self.assertEqual(len(documents), len(uploads))
        for request, (name, payload, _mime) in zip(documents, uploads):
            self.assertTrue(request.get_header("Content-type").startswith("multipart/form-data; boundary="))
            self.assertIn(b'name="CaseID"\r\n\r\n52103\r\n', request.data)
            self.assertIn(f'filename="{name}"'.encode(), request.data)
            self.assertIn(payload, request.data)

    def test_nothing_is_sent_without_all_three_settings(self):
        result, uploads = _whitfield()
        for missing in ENV:
            recorder = Recorder()
            with patch.dict(os.environ, {**ENV, missing: ""}), patch("urllib.request.urlopen", recorder):
                self.assertIsNone(push_case(result, uploads))
            self.assertEqual(recorder.requests, [])

    def test_a_failed_note_does_not_stop_the_uploads(self):
        result, uploads = _whitfield()
        recorder = Recorder({"CaseActivity/Activity": 403})
        with patch.dict(os.environ, ENV), patch("urllib.request.urlopen", recorder):
            note = push_case(result, uploads)

        self.assertEqual(len(recorder.to(UPLOAD)), len(uploads))
        self.assertIn("screening note failed (HTTP 403)", note)
        self.assertIn("case data note failed (HTTP 403)", note)
        self.assertNotIn("Sent to", note)

    def test_a_reply_without_success_counts_as_a_failure(self):
        result, uploads = _whitfield()
        recorder = Recorder({"UpdateCase/UpdateCase": {"Success": False, "message": "Case not found"}})
        with patch.dict(os.environ, ENV), patch("urllib.request.urlopen", recorder):
            note = push_case(result, uploads)
        self.assertEqual(note, "IRS Logics: case update failed (Case not found).")

    def test_a_file_over_6_mb_is_skipped_and_named(self):
        result, _ = _whitfield()
        uploads = [("big.pdf", b"x" * (7 * 1024 * 1024), "application/pdf"), ("small.pdf", b"%PDF", "application/pdf")]
        recorder = Recorder()
        with patch.dict(os.environ, ENV), patch("urllib.request.urlopen", recorder):
            note = push_case(result, uploads)
        [sent] = recorder.to(UPLOAD)
        self.assertIn(b'filename="small.pdf"', sent.data)
        self.assertEqual(note, "IRS Logics: big.pdf is over 6 MB and was not uploaded.")

    def test_env_file_allows_spaces_and_inline_comments(self):
        with tempfile.TemporaryDirectory() as folder:
            env_file = Path(folder) / ".env"
            env_file.write_text('IRS_LOGICS_CASEID_DEMO = "52103" # just for demo\nIRS_LOGICS_SECRET = "a#b"\n')
            with patch.dict(os.environ, {}, clear=True):
                _load_local_environment(env_file)
                self.assertEqual(os.environ["IRS_LOGICS_CASEID_DEMO"], "52103")
                self.assertEqual(os.environ["IRS_LOGICS_SECRET"], "a#b")

    def test_submit_adds_the_logics_note_only_when_configured(self):
        body, content_type = _body(
            [("answers", json.dumps({"rents_home": True})), ("document_metadata", "[]")],
            [(LEASE.name, "application/pdf", LEASE.read_bytes())],
        )
        recorder = Recorder()
        with patch.dict(os.environ, {**ENV, "IRS_LOGICS_KEY": ""}), patch("urllib.request.urlopen", recorder):
            _, plain = response_for(content_type, body)
        with patch.dict(os.environ, ENV), patch("urllib.request.urlopen", recorder):
            _, sent = response_for(content_type, body)

        self.assertFalse(any("Logics" in note for note in plain["outcome"]["reviewNotes"]))
        self.assertEqual(sent["outcome"]["reviewNotes"][-1], "Sent to IRS Logics case 52103.")
        self.assertEqual(sent["outcome"]["reviewNotes"][:-1], plain["outcome"]["reviewNotes"])
        self.assertEqual(len(recorder.to(UPLOAD)), 1)


if __name__ == "__main__":
    unittest.main()
