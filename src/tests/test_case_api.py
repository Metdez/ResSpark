from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest


SRC = Path(__file__).resolve().parents[1]
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from case_api import response_for, result_for_row
from document_parse import parse_packet
from test_intake_workflow import STANDARDS, canonical_zero_row


ROOT = SRC.parent
LEASE = ROOT / "examples" / "01_marcus_delgado_CNC" / "05_Lease_Statement.pdf"


def _assert_lump_sum(test, result):
    outcome = result["outcome"]
    lump_sum = round(outcome["netRealizableEquity"] + outcome["netDisposableIncome"] * 12)
    test.assertEqual(outcome["suggestedOfferOrPayment"], float(lump_sum))
    test.assertTrue(any("24" in note for note in outcome["reviewNotes"]))


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

    def test_a_readable_packet_gets_a_suggestion_without_filling_unasked_lines(self):
        row = {
            "filing_status_married": False,
            "county_of_residence": "Franklin County",
            "household_size": 1,
            "dependents_count": 0,
            "age_taxpayer": 42,
            "is_wage_earner": True,
            "is_self_employed": False,
            "has_real_property": False,
            "has_retirement_accounts": False,
            "has_life_insurance_cash_value": False,
            "has_investment_accounts": False,
            "all_returns_filed": True,
            "in_open_bankruptcy": False,
            "filed_bankruptcy_past_7yrs": False,
            "in_litigation": False,
            "prior_ia_or_oic_default": False,
            "filed_and_paid_timely_last_5_years": False,
            "installment_agreement_last_5_years": False,
        }
        whitfield = dict(row)
        whitfield.update(parse_packet(ROOT / "examples" / "02_whitfield_gregory_OIC"))
        result = result_for_row(whitfield, [], [], STANDARDS)

        self.assertNotEqual(result["outcome"]["path"], "Information still needed")
        self.assertIsNotNone(result["outcome"]["monthlyIncome"])
        self.assertEqual(result["neededDocuments"], [])
        self.assertNotIn("social security income", result["outcome"]["requirements"])
        if result["outcome"]["id"] == "oic":
            _assert_lump_sum(self, result)

        renata = dict(row)
        renata["vehicle_count"] = 0
        renata.update(parse_packet(ROOT / "examples" / "03_renata_alves_streamlined_IA"))
        renata_result = result_for_row(renata, [], [], STANDARDS)
        self.assertNotEqual(renata_result["outcome"]["path"], "Information still needed")
        self.assertEqual(renata_result["neededDocuments"], [])
        if renata_result["outcome"]["id"] == "oic":
            _assert_lump_sum(self, renata_result)

        marcus = dict(row)
        marcus.update(parse_packet(ROOT / "examples" / "01_marcus_delgado_CNC"))
        held = result_for_row(marcus, [], [], STANDARDS)
        self.assertEqual(held["outcome"]["path"], "Information still needed")
        self.assertTrue(any("valuation" in item["detail"].lower() for item in held["neededDocuments"]))
        self.assertNotIn("social security income", held["outcome"]["requirements"])

    def test_a_missing_health_premium_names_the_statement_and_does_not_recommend(self):
        row = canonical_zero_row()
        row["actual_health_insurance_premiums"] = None
        result = result_for_row(row, [], [], STANDARDS)
        self.assertEqual(result["outcome"]["path"], "Information still needed")
        self.assertEqual(
            [item["title"] for item in result["neededDocuments"]],
            ["Health insurance premium statement"],
        )

    def test_every_parsed_value_is_in_the_full_case_data(self):
        answers = {
            "county_of_residence": "Franklin County",
            "household_size": 1,
            "dependents_count": 0,
            "age_taxpayer": 42,
            "is_wage_earner": True,
            "is_self_employed": False,
            "has_real_property": False,
            "has_retirement_accounts": False,
            "has_life_insurance_cash_value": False,
            "has_investment_accounts": False,
            "all_returns_filed": True,
            "in_open_bankruptcy": False,
            "filed_bankruptcy_past_7yrs": False,
            "in_litigation": False,
            "prior_ia_or_oic_default": False,
            "filed_and_paid_timely_last_5_years": False,
            "installment_agreement_last_5_years": False,
        }
        for folder in (ROOT / "examples").iterdir():
            if not folder.is_dir():
                continue
            parsed = parse_packet(folder)
            row = dict(answers)
            row.update(parsed)
            fields = {
                field["key"]: field["value"]
                for field in result_for_row(row, [], [], STANDARDS)["financialSections"][0]["fields"]
            }
            for key, value in parsed.items():
                if key.startswith("_") or value in (None, [], ""):
                    continue
                shown = ", ".join(str(item) for item in value) if isinstance(value, list) else value
                self.assertEqual(fields.get(key), shown, folder.name)


if __name__ == "__main__":
    unittest.main()
