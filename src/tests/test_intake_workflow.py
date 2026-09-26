from __future__ import annotations

from dataclasses import MISSING
from pathlib import Path
import sys
import unittest


V5_DIRECTORY = Path(__file__).resolve().parents[1]
if str(V5_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(V5_DIRECTORY))

from financial_data import FinancialData
from intake_workflow import (
    document_requests_for,
    evaluate_case,
    financial_data_from_case_row,
    initial_questions,
    missing_financial_columns,
    validate_answer,
)
from questions import QUESTIONS


class FakeStandardsRepository:
    """Keeps workflow tests independent from a running PostgreSQL server."""

    def national_amount(self, household_size: int) -> float:
        return {1: 867.0, 2: 1558.0, 3: 1857.0, 4: 2176.0}.get(
            household_size, 2176.0 + max(household_size - 4, 0) * 397.0
        )

    def health_care_amount(self, age: int) -> float:
        return 163.0 if age >= 65 else 90.0

    def transportation_area(self, state: str, county: str) -> str:
        return "Miami"

    def transportation_ownership_amount(self, vehicle_count: int) -> float:
        return 0.0 if vehicle_count <= 0 else (703.0 if vehicle_count == 1 else 1406.0)

    def transportation_operating_amount(self, area: str, vehicle_count: int) -> float:
        return 0.0 if vehicle_count <= 0 else (423.0 if vehicle_count == 1 else 846.0)

    def housing_amount(self, state: str, county: str, household_size: int) -> float:
        return 3000.0


STANDARDS = FakeStandardsRepository()


def canonical_zero_row() -> dict:
    """A complete database row with explicit, known zero values."""
    row = {}
    for name, definition in FinancialData.__dataclass_fields__.items():
        if definition.default_factory is not MISSING:
            row[name] = definition.default_factory()
        else:
            row[name] = definition.default
    row["tax_only_balance"] = 0.0
    row.update({
        "pay_frequency": "biweekly",
        "has_real_property": False,
        "has_retirement_accounts": False,
        "has_life_insurance_cash_value": False,
        "has_investment_accounts": False,
    })
    return row


class V5IntakeWorkflowTests(unittest.TestCase):
    def test_initial_questions_are_a_subset_of_the_unchanged_v2_questions(self):
        source_ids = {question["id"] for question in QUESTIONS}
        asked_ids = {question["id"] for question in initial_questions({"filing_status_married": False})}
        self.assertEqual(len(QUESTIONS), 28)
        self.assertTrue(asked_ids.issubset(source_ids))
        self.assertIn("all_returns_filed", asked_ids)
        self.assertNotIn("total_tax_owed", asked_ids)
        self.assertNotIn("oic_payment_months", source_ids)
        self.assertNotIn("income_tax_only", source_ids)
        self.assertNotIn("transferred_asset_10k_10yrs", source_ids)
        self.assertNotIn("has_unexplained_deposits", source_ids)

    def test_document_requests_are_selected_from_canonical_case_data(self):
        requests = document_requests_for({
            "is_wage_earner": True,
            "owns_home": True,
            "vehicle_count": 1,
            "has_retirement_accounts": True,
        })
        codes = {request.code for request in requests}
        self.assertTrue({
            "irs_transcripts", "bank_statements", "pay_stubs",
            "real_property", "housing_utilities", "vehicle", "retirement",
        }.issubset(codes))
        utility = next(request for request in requests if request.code == "housing_utilities")
        self.assertFalse(utility.required)

        renter = document_requests_for({"owns_home": False, "rents_home": True})
        renter_codes = {request.code for request in renter}
        self.assertIn("lease", renter_codes)
        self.assertNotIn("real_property", renter_codes)
        self.assertNotIn("rent", renter_codes)

    def test_null_database_column_blocks_v2(self):
        row = canonical_zero_row()
        row["total_tax_owed"] = None
        result = evaluate_case(row, STANDARDS)
        self.assertEqual(result.status, "information_needed")
        self.assertIn("total_tax_owed", result.missing_question_ids)
        self.assertIn("total_tax_owed", result.missing_financial_fields)

    def test_explicit_zero_is_accepted_as_known_data(self):
        row = canonical_zero_row()
        self.assertNotIn("gross_wages_taxpayer", missing_financial_columns(row))
        financial_data = financial_data_from_case_row(row)
        self.assertEqual(financial_data.gross_wages_taxpayer, 0.0)

    def test_unused_tax_only_balance_does_not_block_screening(self):
        row = canonical_zero_row()
        row["tax_only_balance"] = None

        result = evaluate_case(row, STANDARDS)

        self.assertEqual(result.status, "ready")

    def test_complete_database_row_reaches_v2_determination(self):
        row = canonical_zero_row()
        row.update({
            "filing_status_married": False,
            "state_of_residence": "FL",
            "county_of_residence": "Miami-Dade County",
            "household_size": 2,
            "age_taxpayer": 52,
            "owns_home": True,
            "is_wage_earner": True,
            "vehicle_count": 1,
            "has_real_property": True,
            "all_returns_filed": True,
            "gross_wages_taxpayer": 6800.0,
            "actual_housing_utilities": 2200.0,
            "actual_vehicle_operating": 350.0,
            "actual_health_insurance_premiums": 260.0,
            "actual_current_taxes": 980.0,
            "cash_and_bank_balances": 4000.0,
            "real_property_market_value": 200000.0,
            "real_property_loan_balance": 198000.0,
            "vehicle_market_values": [15000.0],
            "vehicle_loan_balances": [12000.0],
            "total_tax_owed": 28000.0,
            "tax_only_balance": 28000.0,
            "csed_months_remaining": 90,
        })
        result = evaluate_case(row, STANDARDS)
        self.assertEqual(result.status, "ready")
        self.assertEqual(result.determination.path, "Simple Payment Plan")

    def test_compliance_block_is_preserved(self):
        row = canonical_zero_row()
        row.update({
            "state_of_residence": "FL",
            "county_of_residence": "Miami-Dade County",
            "all_returns_filed": False,
            "total_tax_owed": 60000.0,
            "tax_only_balance": 60000.0,
            "csed_months_remaining": 96,
        })
        result = evaluate_case(row, STANDARDS)
        self.assertEqual(result.status, "blocked")
        self.assertTrue(result.determination.path.startswith("BLOCKED"))

    def test_cnc_path_is_preserved(self):
        row = canonical_zero_row()
        row.update({
            "state_of_residence": "FL",
            "county_of_residence": "Miami-Dade County",
            "total_tax_owed": 60000.0,
            "tax_only_balance": 60000.0,
            "csed_months_remaining": 96,
        })
        result = evaluate_case(row, STANDARDS)
        self.assertEqual(result.status, "ready")
        self.assertEqual(result.determination.path, "Currently Not Collectible (CNC / Status 53)")

    def test_a_balance_that_cannot_be_full_paid_uses_the_lump_sum_offer_minimum(self):
        row = canonical_zero_row()
        row.update({
            "state_of_residence": "FL",
            "county_of_residence": "Miami-Dade County",
            "household_size": 1,
            "rents_home": True,
            "is_wage_earner": True,
            "pay_frequency": "monthly",
            "gross_wages_taxpayer": 5000.0,
            "actual_housing_utilities": 1000.0,
            "all_returns_filed": True,
            "total_tax_owed": 100000.0,
            "tax_only_balance": 100000.0,
            "csed_months_remaining": 12,
        })
        result = evaluate_case(row, STANDARDS)
        determination = result.determination
        lump_sum = round(determination.net_realizable_equity + determination.net_disposable_income * 12)
        self.assertEqual(result.status, "ready")
        self.assertEqual(determination.path, "Offer in Compromise")
        self.assertEqual(determination.suggested_offer_or_payment, float(lump_sum))
        self.assertLess(lump_sum, row["total_tax_owed"])
        self.assertIn("24", determination.review_notes[0])

    def test_no_reduced_offer_when_the_lump_sum_minimum_meets_the_balance(self):
        row = canonical_zero_row()
        row.update({
            "state_of_residence": "FL",
            "county_of_residence": "Miami-Dade County",
            "household_size": 1,
            "rents_home": True,
            "is_wage_earner": True,
            "pay_frequency": "monthly",
            "gross_wages_taxpayer": 4000.0,
            "actual_housing_utilities": 1000.0,
            "all_returns_filed": True,
            "cash_and_bank_balances": 5000.0,
            "total_tax_owed": 15000.0,
            "tax_only_balance": 15000.0,
            "csed_months_remaining": 6,
        })
        result = evaluate_case(row, STANDARDS)
        self.assertEqual(result.status, "ready_for_review")
        self.assertEqual(result.determination.path, "MANUAL REVIEW — payment resolution needs review")

    def test_validation_matches_the_v2_declared_type(self):
        validate_answer("household_size", 3)
        with self.assertRaises(TypeError):
            validate_answer("household_size", "3")


if __name__ == "__main__":
    unittest.main()
