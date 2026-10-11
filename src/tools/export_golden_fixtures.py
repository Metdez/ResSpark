"""Golden-fixture exporter: the Python engine is the oracle for the TypeScript port.

Imports the unchanged src/*.py modules and the test fake, runs every case through
evaluate_case with a recording standards repository, and writes
app/worker/test/fixtures/engine/golden.json. It never edits anything under src/.
"""

from __future__ import annotations

from dataclasses import asdict
import json
from pathlib import Path
import sys


SRC = Path(__file__).resolve().parents[1]
ROOT = SRC.parent
OUT = ROOT / "app" / "worker" / "test" / "fixtures" / "engine" / "golden.json"
sys.path[:0] = [str(SRC), str(SRC / "tests")]

from case_api import _NEXT, _PATHS  # noqa: E402
from intake_workflow import INITIAL_QUESTION_IDS, REQUIRED_FINANCIAL_COLUMNS, evaluate_case  # noqa: E402
from questions import QUESTIONS  # noqa: E402
from test_intake_workflow import FakeStandardsRepository, canonical_zero_row  # noqa: E402


INT_COLUMNS = (
    "household_size", "dependents_count", "age_taxpayer", "age_spouse",
    "vehicle_count", "csed_months_remaining", "oic_payment_months",
)


class Recorder:
    """Wraps a standards repository and records every call, in order."""

    def __init__(self, inner: object) -> None:
        self.inner = inner
        self.calls: list[dict] = []

    def __getattr__(self, name: str):
        method = getattr(self.inner, name)

        def call(*args: object) -> object:
            value = method(*args)
            self.calls.append({"method": name, "args": list(args), "value": value})
            return value

        return call


def _row(**updates: object) -> dict:
    row = canonical_zero_row()
    row.update(updates)
    return row


FL = {"state_of_residence": "FL", "county_of_residence": "Miami-Dade County"}


def existing_test_cases() -> list[tuple[str, dict]]:
    """Rows built exactly as the scenarios in src/tests/test_intake_workflow.py and test_case_api.py."""
    blocked = canonical_zero_row()
    blocked["all_returns_filed"] = False
    unused_tax_only = canonical_zero_row()
    unused_tax_only["tax_only_balance"] = None
    null_owed = canonical_zero_row()
    null_owed["total_tax_owed"] = None
    return [
        ("test_document_requests_are_selected_from_canonical_case_data", {
            "is_wage_earner": True, "owns_home": True, "vehicle_count": 1, "has_retirement_accounts": True,
        }),
        ("test_document_requests_are_selected_from_canonical_case_data_renter", {"owns_home": False, "rents_home": True}),
        ("test_null_database_column_blocks_v2", null_owed),
        ("test_explicit_zero_is_accepted_as_known_data", canonical_zero_row()),
        ("test_unused_tax_only_balance_does_not_block_screening", unused_tax_only),
        ("test_complete_database_row_reaches_v2_determination", _row(
            filing_status_married=False, **FL, household_size=2, age_taxpayer=52, owns_home=True,
            is_wage_earner=True, vehicle_count=1, has_real_property=True, all_returns_filed=True,
            gross_wages_taxpayer=6800.0, actual_housing_utilities=2200.0, actual_vehicle_operating=350.0,
            actual_health_insurance_premiums=260.0, actual_current_taxes=980.0, cash_and_bank_balances=4000.0,
            real_property_market_value=200000.0, real_property_loan_balance=198000.0,
            vehicle_market_values=[15000.0], vehicle_loan_balances=[12000.0],
            total_tax_owed=28000.0, tax_only_balance=28000.0, csed_months_remaining=90,
        )),
        ("test_compliance_block_is_preserved", _row(
            **FL, all_returns_filed=False, total_tax_owed=60000.0, tax_only_balance=60000.0, csed_months_remaining=96,
        )),
        ("test_cnc_path_is_preserved", _row(
            **FL, total_tax_owed=60000.0, tax_only_balance=60000.0, csed_months_remaining=96,
        )),
        ("test_full_payment_failure_requires_manual_review_until_oic_calculator_exists", _row(
            **FL, household_size=1, rents_home=True, is_wage_earner=True, pay_frequency="monthly",
            gross_wages_taxpayer=5000.0, actual_housing_utilities=1000.0, all_returns_filed=True,
            total_tax_owed=100000.0, tax_only_balance=100000.0, csed_months_remaining=12,
        )),
        ("test_partial_payment_case_requires_manual_review_until_oic_calculator_exists", _row(
            **FL, household_size=1, rents_home=True, is_wage_earner=True, pay_frequency="monthly",
            gross_wages_taxpayer=4000.0, actual_housing_utilities=1000.0, all_returns_filed=True,
            cash_and_bank_balances=5000.0, total_tax_owed=15000.0, tax_only_balance=15000.0,
            csed_months_remaining=6,
        )),
        ("test_a_complete_row_uses_the_determination", canonical_zero_row()),
        ("test_a_complete_row_without_standards_does_not_invent_a_path", blocked),
    ]


def _check_row(name: str, row: dict) -> None:
    """Inputs JSON cannot carry faithfully would make the TS replay differ from Python."""
    def walk(value: object) -> None:
        if isinstance(value, float) and value == 0 and str(value).startswith("-"):
            raise ValueError(f"{name}: -0.0 in a fixture row")
        if isinstance(value, list):
            for item in value:
                walk(item)

    for column, value in row.items():
        walk(value)
        if column in INT_COLUMNS and value is not None and type(value) is not int:
            raise ValueError(f"{name}: {column} must be int, got {type(value).__name__}")


def build_case(name: str, row: dict) -> dict:
    _check_row(name, row)
    recorder = Recorder(FakeStandardsRepository())
    result = evaluate_case(row, recorder)
    return {
        "name": name,
        "row": row,
        "expected": {
            "status": result.status,
            "missing_question_ids": result.missing_question_ids,
            "missing_financial_fields": result.missing_financial_fields,
            "review_flags": result.review_flags,
            "document_requests": [asdict(request) for request in result.document_requests],
            "allowable_breakdown": None,
            "nre_lines": None,
            "determination": asdict(result.determination) if result.determination else None,
        },
        "standards_calls": recorder.calls,
    }


def build_payload() -> dict:
    return {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "generated_by": "src/tools/export_golden_fixtures.py",
        "questions": [
            {"id": question["id"], "prompt": question["prompt"], "type": question["type"].__name__}
            for question in QUESTIONS
        ],
        "initial_question_ids": list(INITIAL_QUESTION_IDS),
        "required_financial_columns": sorted(REQUIRED_FINANCIAL_COLUMNS),
        "paths": {path: list(outcome) for path, outcome in _PATHS.items()},
        "next": _NEXT,
        "validations": [],
        "standards": {},
        "cases": [build_case(name, row) for name, row in existing_test_cases()],
    }


def render(payload: dict) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    if sum([0.1] * 10) == 1.0:
        print("Golden fixtures need left-to-right float sum (Python <= 3.11); the TS engine mirrors that.",
              file=sys.stderr)
        return 1
    text = render(build_payload())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"Wrote {OUT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
