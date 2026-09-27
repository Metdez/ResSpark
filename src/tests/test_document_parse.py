from __future__ import annotations

from datetime import date
from io import BytesIO
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch
import unittest


SRC = Path(__file__).resolve().parents[1]
ROOT = SRC.parent
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from document_parse import (
    _CHAT_URL, _page_text, _parse_classified, classify_upload, merge_documents, parse_texts,
    parse_packet, parse_uploads, parse_uploads_with_evidence,
)


_UNMATCHED = ["Case file"] + ["spacer"] * 11
_ENV = {"SCIFORIUM_API_KEY": "test-key", "SCIFORIUM_API_ENDPOINT": "test-model"}


class _Response(BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _with_model(content, document_type, texts=None, env=None, payload=None):
    captured = {}

    def fake_urlopen(request, timeout=60):
        captured["request"] = request
        captured["body"] = json.loads(request.data.decode())
        if isinstance(content, BaseException):
            raise content
        if payload is None:
            message = content if isinstance(content, str) else json.dumps(content)
            body = {"choices": [{"message": {"content": message}}]}
        else:
            body = payload
        return _Response(json.dumps(body).encode())

    with patch.dict(os.environ, _ENV if env is None else env), patch("document_parse.urllib.request.urlopen", fake_urlopen):
        parsed = parse_texts(_UNMATCHED if texts is None else texts, document_type=document_type)
    return parsed, captured


class DocumentParseTests(unittest.TestCase):
    def test_example_packets_fill_case_columns(self):
        marcus = parse_packet(ROOT / "examples/01_marcus_delgado_CNC")
        self.assertEqual(marcus["total_tax_owed"], 60000.0)
        self.assertEqual(marcus["tax_only_balance"], 44500.0)
        self.assertEqual(marcus["csed_months_remaining"], 79)
        self.assertFalse(marcus["filing_status_married"])
        self.assertEqual(marcus["state_of_residence"], "TX")
        self.assertEqual(marcus["pay_frequency"], "biweekly")
        self.assertEqual(marcus["gross_wages_taxpayer"], 2600.0)
        self.assertEqual(marcus["actual_current_taxes"], 380.9)
        self.assertEqual(marcus["actual_housing_utilities"], 1150.0)
        self.assertTrue(marcus["rents_home"])
        self.assertEqual(marcus["actual_vehicle_loan_lease"], 348.0)
        self.assertEqual(marcus["vehicle_loan_balances"], [9200.0])
        self.assertEqual(marcus["vehicle_count"], 1)
        self.assertNotIn("vehicle_market_values", marcus)
        self.assertEqual(marcus["actual_health_insurance_premiums"], 178.0)
        self.assertEqual(marcus["cash_and_bank_balances"], 578.81)
        self.assertFalse(marcus["has_unexplained_deposits"])
        self.assertEqual(marcus["unexplained_deposits_monthly"], 0.0)

        whitfield = parse_packet(ROOT / "examples/02_whitfield_gregory_OIC")
        self.assertEqual(whitfield["total_tax_owed"], 82600.0)
        self.assertEqual(whitfield["tax_only_balance"], 60000.0)
        self.assertEqual(whitfield["csed_months_remaining"], 55)
        self.assertEqual(whitfield["state_of_residence"], "OH")
        self.assertEqual(whitfield["pay_frequency"], "semimonthly")
        self.assertEqual(whitfield["gross_wages_taxpayer"], 4200.0)
        self.assertEqual(whitfield["actual_current_taxes"], 1098.3)
        self.assertEqual(whitfield["actual_housing_utilities"], 1200.0)
        self.assertEqual(whitfield["vehicle_market_values"], [12000.0])
        self.assertEqual(whitfield["vehicle_loan_balance_total"], 9000.0)
        self.assertEqual(whitfield["cash_and_bank_balances"], 2305.9)
        self.assertFalse(whitfield["has_unexplained_deposits"])

        renata = parse_packet(ROOT / "examples/03_renata_alves_streamlined_IA")
        self.assertEqual(renata["total_tax_owed"], 28000.0)
        self.assertEqual(renata["tax_only_balance"], 24000.0)
        self.assertEqual(renata["csed_months_remaining"], 91)
        self.assertEqual(renata["state_of_residence"], "FL")
        self.assertEqual(renata["gross_wages_taxpayer"], 6800.0)
        self.assertEqual(renata["actual_current_taxes"], 1472.2)
        self.assertEqual(renata["actual_housing_utilities"], 1850.0)
        self.assertEqual(renata["real_property_market_value"], 340000.0)
        self.assertEqual(renata["real_property_loan_balance"], 261000.0)
        self.assertTrue(renata["owns_home"])
        self.assertNotIn("vehicle_count", renata)
        self.assertEqual(renata["actual_health_insurance_premiums"], 260.0)
        self.assertEqual(renata["cash_and_bank_balances"], 6394.3)
        self.assertFalse(renata["has_unexplained_deposits"])

    def test_general_forms_and_document_type_hints(self):
        account = parse_texts([
            "IRS Account Transcript",
            "Filing Status:", "Single",
            "Address:", "4417 Bellaire Blvd, Houston, TX 77036",
            "(CSED):", "05/12/2033",
            "Request Date:", "09-26-2026",
            "ACCOUNT BALANCE: $60,000.00",
            "150", "$44,500.00",
        ], document_type="irs_transcripts")
        self.assertEqual(account["_kind"], "account")
        self.assertEqual(account["total_tax_owed"], 60000.0)
        self.assertFalse(account["filing_status_married"])

        wage = parse_texts([
            "Wage and Income Transcript",
            "Form W-2 filed by: Acme Payroll LLC",
            "Box 1", "$31,200.00",
        ], document_type="irs_transcripts")
        self.assertEqual(wage["_kind"], "wage")
        self.assertEqual(wage["gross_wages_taxpayer"], 2600.0)

        bank_rows = {
            400.0: [
                (72.0, "Date"), (180.0, "Description"), (360.0, "Withdrawals"),
                (450.0, "Deposits"), (540.0, "Balance"),
            ],
        }
        bank = parse_texts([
            "Bank Statement",
            "Account Number:", "****7742",
            "Ending Balance: $100.00",
            "01/01/2026 - 01/31/2026",
        ], bank_rows)
        self.assertEqual(bank["_kind"], "bank")
        self.assertEqual(bank["ending_balance"], 100.0)

        stub = parse_texts([
            "Acme Payroll LLC",
            "Pay Stub",
            "Pay Frequency:", "Every two weeks",
            "Gross Pay", "$1,200.00",
        ])
        self.assertEqual(stub["pay_frequency"], "biweekly")
        self.assertEqual(stub["gross_wages_taxpayer"], 2600.0)
        self.assertEqual(stub["actual_current_taxes"], 0.0)
        twice = parse_texts([
            "Acme Payroll LLC",
            "Pay Stub",
            "Pay Frequency:", "Twice a month",
            "Gross Pay", "$2,000.00",
        ])
        self.assertEqual(twice["pay_frequency"], "semimonthly")
        self.assertEqual(twice["gross_wages_taxpayer"], 4000.0)

        lease = parse_texts([
            "Lease Statement",
            "Rent:", "$1,150.00",
            "Property Address:", "4417 Bellaire Blvd, Houston, TX 77036",
        ])
        self.assertEqual(lease["actual_housing_utilities"], 1150.0)
        self.assertTrue(lease["rents_home"])
        self.assertEqual(lease["state_of_residence"], "TX")

        mortgage = parse_texts([
            "Mortgage Statement",
            "PITI:", "$1,850.00",
            "Principal Balance:", "$261,000.00",
            "Estimated Market Value:", "$340,000.00",
            "Property Address:", "8820 SW 112th St, Miami, FL 33176",
        ])
        self.assertEqual(mortgage["_kind"], "mortgage")
        self.assertEqual(mortgage["actual_housing_utilities"], 1850.0)
        self.assertEqual(mortgage["real_property_loan_balance"], 261000.0)
        self.assertTrue(mortgage["owns_home"])

        health = parse_texts(["Health Insurance Statement", "Premium:", "$178.00"])
        self.assertEqual(health["actual_health_insurance_premiums"], 178.0)

        hidden = ["Case file"] + ["spacer"] * 11
        hinted_lease = parse_texts(hidden + [
            "Rent:", "$900.00",
            "Property Address:", "1 Main St, Columbus, OH 43215",
        ], document_type="lease_statement")
        self.assertEqual(hinted_lease["_kind"], "lease")
        self.assertEqual(hinted_lease["actual_housing_utilities"], 900.0)
        hinted_auto = parse_texts(hidden + [
            "Monthly Payment:", "$100.00",
            "Loan Balance:", "$500.00",
        ], document_type="vehicle")
        self.assertEqual(hinted_auto["_kind"], "auto")
        self.assertEqual(hinted_auto["vehicle_loan_balances"], [500.0])

        with self.assertRaises(ValueError):
            parse_texts(hidden)

        first = parse_texts([
            "Auto Loan Statement",
            "Monthly Payment:", "$348.00",
            "Payoff Balance:", "$9,200.00",
        ])
        second = parse_texts([
            "Vehicle Loan Statement",
            "Monthly Payment:", "$200.00",
            "Loan Balance:", "$4,000.00",
            "Est. Market Value:", "$8,000.00",
        ])
        combined = merge_documents([first, second])
        self.assertEqual(combined["actual_vehicle_loan_lease"], 548.0)
        self.assertEqual(combined["vehicle_loan_balances"], [9200.0, 4000.0])
        self.assertEqual(combined["vehicle_loan_balance_total"], 13200.0)
        self.assertEqual(combined["vehicle_market_values"], [8000.0])
        self.assertEqual(combined["vehicle_market_value_total"], 8000.0)
        self.assertEqual(combined["vehicle_count"], 2)

    def test_failed_parse_asks_only_for_that_documents_columns(self):
        texts = ["Case file"] + ["spacer"] * 11
        captured = {}

        class Response(BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        replies = [
            {
                "actual_housing_utilities": 900,
                "state_of_residence": "TX",
                "rents_home": True,
                "owns_home": False,
                "household_size": 4,
                "bogus": 1,
            },
            {"actual_housing_utilities": 900, "owns_home": False},
        ]

        def fake_urlopen(request, timeout=60):
            captured["body"] = json.loads(request.data.decode())
            content = json.dumps(replies.pop(0))
            payload = {"choices": [{"message": {"content": content}}]}
            return Response(json.dumps(payload).encode())

        env = {"SCIFORIUM_API_KEY": "test-key", "SCIFORIUM_API_ENDPOINT": "test-model"}
        with patch.dict(os.environ, env), patch("document_parse.urllib.request.urlopen", fake_urlopen):
            parsed = parse_texts(texts, document_type="lease_statement")
            with self.assertRaises(ValueError):
                parse_texts(texts, document_type="lease_statement")

        prompt = captured["body"]["messages"][0]["content"]
        self.assertEqual(captured["body"]["model"], "test-model")
        self.assertIn("actual_housing_utilities", prompt)
        self.assertNotIn("household_size", prompt)
        self.assertEqual(parsed["_kind"], "lease")
        self.assertEqual(parsed["actual_housing_utilities"], 900.0)
        self.assertEqual(parsed["state_of_residence"], "TX")
        self.assertIs(parsed["rents_home"], True)
        self.assertIs(parsed["owns_home"], False)
        self.assertNotIn("household_size", parsed)
        self.assertNotIn("bogus", parsed)

        banks = merge_documents([
            {"_kind": "bank", "cash_and_bank_balances": 100.0},
            {"_kind": "bank", "cash_and_bank_balances": 50.5},
        ])
        self.assertEqual(banks["cash_and_bank_balances"], 150.5)

    def test_successful_parse_does_not_call_the_model(self):
        def fail_if_called(*args, **kwargs):
            raise AssertionError("model was called")

        with patch("document_parse.urllib.request.urlopen", fail_if_called):
            parsed = parse_texts([
                "Lease Statement",
                "Rent:", "$1,150.00",
                "Property Address:", "4417 Bellaire Blvd, Houston, TX 77036",
            ])

        self.assertEqual(parsed["actual_housing_utilities"], 1150.0)
        self.assertEqual(parsed["state_of_residence"], "TX")

    def test_model_fallback_rejects_bad_replies_and_missing_credentials(self):
        parsed, captured = _with_model(
            'Sure.\n```json\n{"cash_and_bank_balances": 40.5}\n```',
            "bank_statements",
        )
        self.assertEqual(parsed["cash_and_bank_balances"], 40.5)
        self.assertEqual(captured["request"].full_url, _CHAT_URL)
        self.assertEqual(captured["request"].get_header("Authorization"), "Bearer test-key")

        for content, payload, cause in (
            ("[]", None, ValueError),
            ("nope", None, ValueError),
            (None, {"choices": []}, IndexError),
            (None, {}, KeyError),
            (OSError("down"), None, OSError),
        ):
            with self.assertRaises(ValueError) as caught:
                _with_model(content, "bank_statements", payload=payload)
            self.assertIsInstance(caught.exception.__cause__, cause)

        with self.assertRaises(ValueError) as caught:
            _with_model({}, "lease_statement")
        self.assertIsNone(caught.exception.__cause__)

        def fail_if_called(*args, **kwargs):
            raise AssertionError("model was called")

        with patch.dict(os.environ, {"SCIFORIUM_API_KEY": "", "SCIFORIUM_API_ENDPOINT": ""}), \
                patch("document_parse.urllib.request.urlopen", fail_if_called):
            with self.assertRaises(ValueError) as caught:
                parse_texts(_UNMATCHED, document_type="lease_statement")
        self.assertIsInstance(caught.exception.__cause__, RuntimeError)

        with patch("document_parse.urllib.request.urlopen", fail_if_called):
            with self.assertRaises(ValueError):
                parse_texts(["   "], document_type="lease_statement")

    def test_model_fallback_coerces_pay_stub_and_vehicle_values(self):
        stub, _ = _with_model({
            "pay_frequency": "Semi-Monthly",
            "gross_wages_taxpayer": 4200,
            "actual_current_taxes": 1098.3,
            "is_wage_earner": True,
        }, "pay_stubs")
        self.assertEqual(stub["pay_frequency"], "semimonthly")
        self.assertEqual(stub["gross_wages_taxpayer"], 4200.0)
        self.assertIs(stub["is_wage_earner"], True)

        with self.assertRaises(ValueError):
            _with_model({
                "pay_frequency": "whenever",
                "gross_wages_taxpayer": 4200,
                "actual_current_taxes": 100,
                "is_wage_earner": "yes",
            }, "pay_stubs")

        loan = {
            "actual_vehicle_loan_lease": 348,
            "vehicle_loan_balances": [9200],
            "vehicle_loan_balance_total": 9200,
            "vehicle_count": 1.0,
        }
        bare, _ = _with_model(loan, "vehicle")
        self.assertEqual(bare["vehicle_count"], 1)
        self.assertNotIn("vehicle_market_values", bare)

        valued, _ = _with_model({
            **loan,
            "vehicle_market_values": [8000, 1000],
            "vehicle_market_value_total": 9000,
        }, "vehicle")
        self.assertEqual(valued["vehicle_market_values"], [8000.0, 1000.0])
        self.assertEqual(valued["vehicle_market_value_total"], 9000.0)

        with self.assertRaises(ValueError):
            _with_model({**loan, "vehicle_market_values": [8000]}, "vehicle")
        with self.assertRaises(ValueError):
            _with_model({**loan, "vehicle_loan_balances": ["9200"]}, "vehicle")

    def test_model_fallback_splits_irs_transcripts(self):
        account = {
            "filing_status_married": False,
            "state_of_residence": "TX",
            "total_tax_owed": 60000,
            "tax_only_balance": 44500.0,
            "csed_months_remaining": 79.0,
        }
        both, _ = _with_model({**account, "gross_wages_taxpayer": 2600}, "irs_transcripts")
        self.assertEqual(both["_kind"], "account")
        self.assertEqual(both["csed_months_remaining"], 79)
        self.assertEqual(both["gross_wages_taxpayer"], 2600.0)
        self.assertIs(both["filing_status_married"], False)

        wage, _ = _with_model({"gross_wages_taxpayer": 2600}, "irs_transcripts")
        self.assertEqual(wage, {"_kind": "wage", "gross_wages_taxpayer": 2600.0})

        with self.assertRaises(ValueError):
            _with_model({**account, "csed_months_remaining": 79.5}, "irs_transcripts")
        with self.assertRaises(ValueError):
            _with_model({"total_tax_owed": 60000}, "irs_transcripts")

    def test_model_fallback_truncates_the_document_text(self):
        _, captured = _with_model({"cash_and_bank_balances": 1}, "bank_statements", texts=["x" * 13_000])
        self.assertEqual(len(captured["body"]["messages"][1]["content"]), 12_000)

    def test_repeating_income_and_health_documents_add_up(self):
        combined = merge_documents([
            {"_kind": "pay_stub", "_employer": "Acme Co", "pay_frequency": "biweekly",
             "gross_wages_taxpayer": 2000.0, "actual_current_taxes": 400.0},
            {"_kind": "pay_stub", "_employer": "Other Co", "pay_frequency": "biweekly",
             "gross_wages_taxpayer": 1000.0, "actual_current_taxes": 100.0},
            {"_kind": "wage", "_employer": "Acme Co", "gross_wages_taxpayer": 5000.0},
            {"_kind": "health", "actual_health_insurance_premiums": 100.0},
            {"_kind": "health", "actual_health_insurance_premiums": 50.0},
            {"_kind": "bank", "_account": "1", "_period_end": date(2026, 1, 31),
             "_deposits": [("Payroll - Other Co", 100.0)], "ending_balance": 100.0},
        ])

        self.assertEqual(combined["gross_wages_taxpayer"], 3000.0)
        self.assertEqual(combined["actual_current_taxes"], 500.0)
        self.assertEqual(combined["pay_frequency"], "biweekly")
        self.assertEqual(combined["actual_health_insurance_premiums"], 150.0)
        self.assertFalse(combined["has_unexplained_deposits"])

        mismatched = merge_documents([
            {"_kind": "pay_stub", "_employer": "Acme Co", "pay_frequency": "weekly",
             "gross_wages_taxpayer": 100.0, "actual_current_taxes": 10.0},
            {"_kind": "pay_stub", "_employer": "Other Co", "pay_frequency": "monthly",
             "gross_wages_taxpayer": 200.0, "actual_current_taxes": 20.0},
        ])
        self.assertEqual(mismatched["gross_wages_taxpayer"], 300.0)
        self.assertNotIn("pay_frequency", mismatched)

    def test_upload_categories_fill_case_columns(self):
        hidden = ["Case file"] + ["spacer"] * 11
        wage = parse_texts([
            "Wage and Income Transcript",
            "Form W-2 filed by: Acme Payroll LLC",
            "Box 1", "$31,200.00",
        ], document_type="pay_stubs")
        self.assertEqual(wage["_kind"], "wage")

        lease = parse_texts(hidden + [
            "Rent:", "$1,000.00",
            "Property Address:", "1 Main St, Columbus, OH 43215",
        ], document_type="lease")
        utility = parse_texts(hidden + ["Amount Due:", "$150.00"], document_type="housing_utilities")
        housing = merge_documents([lease, utility])
        self.assertEqual(housing["actual_housing_utilities"], 1150.0)

        business = parse_texts(["Profit and Loss", "Net Income:", "$2,400.00"], document_type="self_employment")
        self.assertEqual(business["net_business_income"], 2400.0)

        retirement = parse_texts(["Retirement Account Statement", "Account Value:", "$10,000.00", "Loan Balance:", "$1,000.00"])
        self.assertEqual(retirement["retirement_accounts_market_value"], 10000.0)
        self.assertEqual(retirement["retirement_accounts_loan_balance"], 1000.0)

        life = parse_texts(["Life Insurance Statement", "Cash Value:", "$5,000.00", "Premium:", "$40.00"])
        self.assertEqual(life["_kind"], "life")
        self.assertEqual(life["life_insurance_cash_value"], 5000.0)

        investment = parse_texts(["Brokerage Statement", "Net Value:", "$3,200.00"])
        self.assertEqual(investment["investment_accounts_net"], 3200.0)

        valuation = parse_texts(hidden + ["Assessed Value:", "$200,000.00"], document_type="real_property")
        self.assertEqual(valuation["real_property_market_value"], 200000.0)
        self.assertTrue(valuation["has_real_property"])

        value_only = parse_texts(hidden + ["Market Value:", "$8,000.00"], document_type="vehicle")
        loan = parse_texts([
            "Auto Loan Statement",
            "Monthly Payment:", "$348.00",
            "Payoff Balance:", "$9,200.00",
        ])
        vehicles = merge_documents([loan, value_only])
        self.assertEqual(vehicles["vehicle_count"], 1)
        self.assertEqual(vehicles["vehicle_market_values"], [8000.0])
        self.assertEqual(vehicles["actual_vehicle_loan_lease"], 348.0)

        bankruptcy = parse_texts(["Bankruptcy Petition", "Case status: open"], document_type="bankruptcy")
        merged = merge_documents([bankruptcy])
        self.assertIn("professional review", merged["ai_flags"][0])
        self.assertNotIn("in_open_bankruptcy", merged)

    def test_example_files_classify_before_parsing(self):
        for path in (ROOT / "examples").rglob("*.pdf"):
            texts, _rows = _page_text(path.read_bytes())
            self.assertEqual(classify_upload(texts), _example_code(path.name), path.name)

        health = next((ROOT / "examples").rglob("07_Health_Insurance_Statement.pdf"))
        row, errors = parse_uploads([("health.pdf", health)])
        self.assertEqual(errors, [])
        self.assertEqual(row["actual_health_insurance_premiums"], 178.0)

        part, error = _parse_classified("life.pdf", [
            "Life Insurance Statement", "Cash Value:", "$5,000.00",
        ], {})
        self.assertIsNone(error)
        self.assertEqual(merge_documents([part])["life_insurance_cash_value"], 5000.0)

    def test_upload_evidence_keeps_only_short_matching_excerpts(self):
        health = next((ROOT / "examples").rglob("07_Health_Insurance_Statement.pdf"))

        row, errors, evidence = parse_uploads_with_evidence([("health.pdf", health)])

        self.assertEqual(errors, [])
        self.assertEqual(row["actual_health_insurance_premiums"], 178.0)
        field = evidence[0]["fields"][0]
        self.assertEqual(field["key"], "actual_health_insurance_premiums")
        self.assertIn("Premium", field["snippet"])
        self.assertLessEqual(len(field["snippet"]), 240)
        self.assertTrue(field["usedInCanonical"])

    def test_unreadable_file_is_named_and_the_rest_are_parsed(self):
        lease = ROOT / "examples/01_marcus_delgado_CNC/05_Lease_Statement.pdf"

        def fail_if_called(*args, **kwargs):
            raise AssertionError("model was called")

        with tempfile.TemporaryDirectory() as folder:
            blank = Path(folder) / "scan.pdf"
            blank.write_bytes(b"")
            with patch("document_parse.urllib.request.urlopen", fail_if_called):
                row, errors = parse_uploads([
                    ("scan.pdf", blank),
                    ("lease.pdf", lease),
                ])

        self.assertEqual(errors, [{"file": "scan.pdf", "error": "No readable text."}])
        self.assertEqual(row["actual_housing_utilities"], 1150.0)
        self.assertEqual(row["state_of_residence"], "TX")

    def test_unrecognized_text_returns_a_structured_classification_error(self):
        texts = ["Grocery list", "apples", "bread"]
        part, error = _with_classification(texts, {"error": "This is a grocery list."})
        self.assertIsNone(part)
        self.assertEqual(error, {"file": "notes.pdf", "error": "This is a grocery list."})

        part, error = _with_classification(texts, "not json")
        self.assertEqual(error, {"file": "notes.pdf", "error": "Could not classify this file."})

        def fail_if_called(*args, **kwargs):
            raise AssertionError("model was called")

        with patch.dict(os.environ, {"SCIFORIUM_API_KEY": "", "SCIFORIUM_API_ENDPOINT": ""}), \
                patch("document_parse.urllib.request.urlopen", fail_if_called):
            part, error = _parse_classified("notes.pdf", texts, {})
        self.assertIsNone(part)
        self.assertEqual(error, {"file": "notes.pdf", "error": "Could not classify this file."})


def _example_code(name: str) -> str:
    lower = name.lower()
    if "transcript" in lower:
        return "irs_transcripts"
    if "bank" in lower:
        return "bank_statements"
    if "pay" in lower:
        return "pay_stubs"
    if "lease" in lower:
        return "lease"
    if "mortgage" in lower:
        return "real_property"
    if "auto" in lower:
        return "vehicle"
    if "health" in lower:
        return "insurance"
    raise AssertionError(name)


def _with_classification(texts, content):
    def fake_urlopen(request, timeout=60):
        message = content if isinstance(content, str) else json.dumps(content)
        payload = {"choices": [{"message": {"content": message}}]}
        return _Response(json.dumps(payload).encode())

    with patch.dict(os.environ, _ENV), patch("document_parse.urllib.request.urlopen", fake_urlopen):
        return _parse_classified("notes.pdf", texts, {})


if __name__ == "__main__":
    unittest.main()
