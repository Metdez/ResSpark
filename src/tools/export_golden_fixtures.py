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
from determination import calculate_allowable_expenses, calculate_net_realizable_equity  # noqa: E402
from financial_data import FinancialData  # noqa: E402
from intake_workflow import (  # noqa: E402
    INITIAL_QUESTION_IDS, REQUIRED_FINANCIAL_COLUMNS, evaluate_case, financial_data_from_case_row, validate_answer,
)
from questions import QUESTIONS  # noqa: E402
from test_intake_workflow import FakeStandardsRepository, canonical_zero_row  # noqa: E402


INT_COLUMNS = (
    "household_size", "dependents_count", "age_taxpayer", "age_spouse",
    "vehicle_count", "csed_months_remaining", "oic_payment_months",
)
QUESTION_ONLY_COLUMNS = (
    "pay_frequency", "has_real_property", "has_retirement_accounts",
    "has_life_insurance_cash_value", "has_investment_accounts",
)
VALIDATION_SAMPLES = (True, 1, 2.5, "weekly", None)
CNC = "Currently Not Collectible (CNC / Status 53)"
MANUAL_EQUITY = "MANUAL REVIEW — negative income, meaningful equity present"
SIMPLE = "Simple Payment Plan"
NON_SIMPLE = "Non-Simple Installment Agreement"
MANUAL_PAYMENT = "MANUAL REVIEW — payment resolution needs review"


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


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


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


INCOME_FIELDS = (
    "gross_wages_taxpayer", "gross_wages_spouse", "social_security_income", "pension_income", "other_income",
    "interest_dividends_royalties", "distributions_income", "net_rental_income", "net_business_income",
    "child_support_received", "alimony_received",
)
EXPENSES = {
    "actual_housing_utilities": 3500.0, "actual_vehicle_loan_lease": 900.0, "actual_vehicle_operating": 650.0,
    "actual_public_transportation": 150.0, "actual_health_insurance_premiums": 400.0,
    "actual_court_ordered_payments": 300.0, "actual_child_dependent_care": 500.0,
    "actual_life_insurance_premiums": 80.0, "actual_current_taxes": 1100.0,
    "actual_delinquent_state_local_tax": 200.0, "actual_secured_debts_other": 250.0,
}
ASSETS = {
    "cash": {"cash_and_bank_balances": 2600.5},
    "investments": {"investment_accounts_net": 7300.25},
    "investments_negative": {"investment_accounts_net": -500.0},
    "retirement": {"retirement_accounts_market_value": 40000.0, "retirement_accounts_loan_balance": 12000.0},
    "retirement_underwater": {"retirement_accounts_market_value": 10000.0, "retirement_accounts_loan_balance": 9000.0},
    "life_insurance": {"life_insurance_cash_value": 6000.0, "life_insurance_loan_balance": 1000.0},
    "real_property": {"real_property_market_value": 350000.0, "real_property_loan_balance": 210000.0,
                      "owns_home": True, "has_real_property": True},
    "other_assets_below_deduction": {"other_valuable_assets_value": 14000.0},
    "other_assets_above_deduction": {"other_valuable_assets_value": 30000.0, "other_valuable_assets_loan": 2500.0},
}
PAYING = {**FL, "gross_wages_taxpayer": 5000.0, "is_wage_earner": True, "pay_frequency": "monthly"}


def grid_cases() -> list[tuple[str, dict]]:
    """Deterministic grid over households, vehicles, ages, income, expenses, assets, gates and flags."""
    cases: list[tuple[str, dict]] = []
    for household in range(1, 7):
        for vehicles in range(4):
            married = household >= 2
            row = _row(
                **FL, filing_status_married=married, filing_joint_offer=married and vehicles % 2 == 0,
                household_size=household, dependents_count=max(household - (2 if married else 1), 0),
                age_taxpayer=40 + household, age_spouse=38 + household if married else 0,
                owns_home=household % 2 == 0, rents_home=household % 2 == 1, vehicle_count=vehicles,
                gross_wages_taxpayer=3000.0 + 900.0 * household, gross_wages_spouse=1200.0 if married else 0.0,
                actual_housing_utilities=1500.0 + 300.0 * household, actual_vehicle_loan_lease=500.0 * vehicles,
                actual_vehicle_operating=300.0 * vehicles + (200.0 if household % 2 else 0.0),
                actual_public_transportation=120.0,  # allowed only when vehicle_count == 0
                cash_and_bank_balances=1500.0 + 500.0 * household,
                total_tax_owed=20000.0 + 7000.0 * household + 3000.0 * vehicles, tax_only_balance=15000.0,
                csed_months_remaining=60 + 10 * vehicles,
            )
            if vehicles % 2:  # per-vehicle lists, the loan list one shorter
                row["vehicle_market_values"] = [12000.0 + 1000.0 * index for index in range(vehicles)]
                row["vehicle_loan_balances"] = [5000.0] * (vehicles - 1)
            else:  # legacy totals
                row["vehicle_market_value_total"] = 9000.0 * vehicles
                row["vehicle_loan_balance_total"] = 2000.0 * vehicles
            cases.append((f"grid_household_{household}_vehicles_{vehicles}", row))
    for taxpayer, spouse in ((64, 64), (64, 65), (65, 65), (70, 30)):
        cases.append((f"grid_ages_{taxpayer}_{spouse}", _row(
            **FL, filing_status_married=True, household_size=2, age_taxpayer=taxpayer, age_spouse=spouse,
            gross_wages_taxpayer=2500.0, total_tax_owed=9000.0, csed_months_remaining=36,
        )))
    for field_name in INCOME_FIELDS:
        cases.append((f"grid_income_{field_name}", _row(
            **FL, **{field_name: 2500.0}, total_tax_owed=12000.0, csed_months_remaining=24,
        )))
    for field_name, amount in EXPENSES.items():
        cases.append((f"grid_expense_{field_name}", _row(
            **FL, gross_wages_taxpayer=6000.0, **{field_name: amount}, total_tax_owed=70000.0,
            csed_months_remaining=100,
        )))
    for name, values in ASSETS.items():
        cases.append((f"grid_asset_{name}", _row(**FL, **values)))
    cases += [
        ("grid_compliance_unfiled", _row(**PAYING, all_returns_filed=False, total_tax_owed=8000.0)),
        ("grid_compliance_bankruptcy", _row(**PAYING, in_open_bankruptcy=True, total_tax_owed=8000.0)),
        ("grid_compliance_both", _row(**PAYING, all_returns_filed=False, in_open_bankruptcy=True)),
        ("grid_flag_filed_bankruptcy_past_7yrs", _row(**PAYING, filed_bankruptcy_past_7yrs=True, total_tax_owed=8000.0)),
        ("grid_flag_in_litigation", _row(**PAYING, in_litigation=True, total_tax_owed=8000.0)),
        ("grid_flag_prior_ia_or_oic_default", _row(**PAYING, prior_ia_or_oic_default=True, total_tax_owed=8000.0)),
        ("grid_flags_all", _row(**PAYING, filed_bankruptcy_past_7yrs=True, in_litigation=True,
                                prior_ia_or_oic_default=True, total_tax_owed=8000.0)),
        ("grid_simple_plan", _row(**PAYING, total_tax_owed=30000.0, csed_months_remaining=100)),
        ("grid_non_simple_installment", _row(**PAYING, total_tax_owed=150000.0, csed_months_remaining=110)),
        ("grid_manual_payment", _row(**PAYING, total_tax_owed=150000.0, csed_months_remaining=20)),
    ]
    return cases


def boundary_cases() -> list[tuple[str, dict]]:
    """Pairs on each side of a threshold; build_payload checks they land on different sides."""
    two_cars = {**FL, "filing_status_married": True, "household_size": 2, "vehicle_count": 2}
    return [
        ("boundary_nre_500", _row(**FL, investment_accounts_net=500.0)),
        ("boundary_nre_500_01", _row(**FL, investment_accounts_net=500.01)),
        ("boundary_owed_50000", _row(**PAYING, total_tax_owed=50000.0, csed_months_remaining=120)),
        ("boundary_owed_50000_01", _row(**PAYING, total_tax_owed=50000.01, csed_months_remaining=120)),
        ("boundary_csed_0", _row(**PAYING, total_tax_owed=1000.0, csed_months_remaining=0)),
        ("boundary_csed_1", _row(**PAYING, total_tax_owed=1000.0, csed_months_remaining=1)),
        ("boundary_csed_negative", _row(**PAYING, total_tax_owed=1000.0, csed_months_remaining=-3)),
        ("boundary_age_64", _row(**PAYING, age_taxpayer=64, total_tax_owed=10000.0, csed_months_remaining=50)),
        ("boundary_age_65", _row(**PAYING, age_taxpayer=65, total_tax_owed=10000.0, csed_months_remaining=50)),
        ("boundary_joint_offer_two_vehicles", _row(
            **two_cars, filing_joint_offer=True, vehicle_market_values=[20000.0, 18000.0], vehicle_loan_balances=[4000.0])),
        ("boundary_single_two_vehicles", _row(
            **two_cars, filing_joint_offer=False, vehicle_market_values=[20000.0, 18000.0], vehicle_loan_balances=[4000.0])),
        ("boundary_joint_offer_legacy_totals", _row(
            **two_cars, filing_joint_offer=True, vehicle_market_value_total=38000.0, vehicle_loan_balance_total=4000.0)),
        ("boundary_joint_offer_legacy_one_vehicle", _row(
            **two_cars | {"vehicle_count": 1}, filing_joint_offer=True, vehicle_market_value_total=19000.0)),
        ("boundary_single_legacy_totals", _row(
            **two_cars, filing_joint_offer=False, vehicle_market_value_total=38000.0, vehicle_loan_balance_total=4000.0)),
        ("boundary_household_1_two_seniors", _row(
            **FL, filing_status_married=True, household_size=1, age_taxpayer=70, age_spouse=68,
            gross_wages_taxpayer=1500.0, total_tax_owed=5000.0, csed_months_remaining=40)),
    ]


def other_cases() -> list[tuple[str, dict]]:
    """Open question 2, then one NULL per required and question-only column."""
    cases = [("pay_frequency_not_applicable", _row(
        **FL, is_wage_earner=False, pay_frequency="not_applicable", social_security_income=1800.0,
        total_tax_owed=6000.0, csed_months_remaining=30,
    ))]
    for column in [*sorted(REQUIRED_FINANCIAL_COLUMNS), *QUESTION_ONLY_COLUMNS]:
        cases.append((f"null_{column}", _row(**{column: None})))
    return cases


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


def nre_lines(fd: FinancialData) -> dict:
    """The seven terms of calculate_net_realizable_equity, copied from src/determination.py:92-113."""
    cash = max(fd.cash_and_bank_balances - 1000, 0)
    investments = max(fd.investment_accounts_net, 0)
    retirement = max(fd.retirement_accounts_market_value * 0.8 - fd.retirement_accounts_loan_balance, 0)
    life_insurance = max(fd.life_insurance_cash_value - fd.life_insurance_loan_balance, 0)
    real_property = max(fd.real_property_market_value * 0.8 - fd.real_property_loan_balance, 0)
    if fd.vehicle_market_values:
        vehicles = 0
        for index, market_value in enumerate(fd.vehicle_market_values):
            loan = fd.vehicle_loan_balances[index] if index < len(fd.vehicle_loan_balances) else 0
            equity = max(market_value * 0.8 - loan, 0)
            if index == 0 or (index == 1 and fd.filing_joint_offer):
                equity = max(equity - 3450, 0)
            vehicles += equity
    else:
        vehicles_raw = max(fd.vehicle_market_value_total * 0.8 - fd.vehicle_loan_balance_total, 0)
        exempt_vehicles = min(fd.vehicle_count, 2 if fd.filing_joint_offer else 1)
        vehicles = max(vehicles_raw - 3450 * exempt_vehicles, 0)
    other_assets = max(fd.other_valuable_assets_value * 0.8 - fd.other_valuable_assets_loan - 11980, 0)
    total = cash + investments + retirement + life_insurance + real_property + vehicles + other_assets
    _require(total == calculate_net_realizable_equity(fd), "NRE lines no longer match src/determination.py")
    return {
        "cash": cash, "investments": investments, "retirement": retirement, "life_insurance": life_insurance,
        "real_property": real_property, "vehicles": vehicles, "other_assets": other_assets,
    }


def build_case(name: str, row: dict) -> dict:
    _check_row(name, row)
    recorder = Recorder(FakeStandardsRepository())
    result = evaluate_case(row, recorder)
    breakdown = lines = None
    if result.status != "information_needed":
        fd = financial_data_from_case_row(row)
        breakdown_recorder = Recorder(FakeStandardsRepository())
        breakdown = calculate_allowable_expenses(fd, breakdown_recorder)
        # The TS test replays the main sequence for the breakdown too.
        _require(breakdown_recorder.calls == recorder.calls, f"{name}: breakdown lookups differ")
        lines = nre_lines(fd)
    return {
        "name": name,
        "row": row,
        "expected": {
            "status": result.status,
            "missing_question_ids": result.missing_question_ids,
            "missing_financial_fields": result.missing_financial_fields,
            "review_flags": result.review_flags,
            "document_requests": [asdict(request) for request in result.document_requests],
            "allowable_breakdown": breakdown,
            "nre_lines": lines,
            "determination": asdict(result.determination) if result.determination else None,
        },
        "standards_calls": recorder.calls,
    }


def _check_coverage(cases: list[dict]) -> None:
    """The grid must keep landing on both sides of every threshold it names."""
    by_name = {case["name"]: case["expected"] for case in cases}
    path = {name: (expected["determination"] or {}).get("path") for name, expected in by_name.items()}
    for name, wanted in {
        "boundary_nre_500": CNC, "boundary_nre_500_01": MANUAL_EQUITY,
        "boundary_owed_50000": SIMPLE, "boundary_owed_50000_01": NON_SIMPLE,
        "boundary_csed_0": MANUAL_PAYMENT, "boundary_csed_1": SIMPLE,
    }.items():
        _require(path[name] == wanted, f"{name}: expected {wanted}, got {path[name]}")
    health = {name: by_name[name]["allowable_breakdown"]["out_of_pocket_health_care"]
              for name in ("boundary_age_64", "boundary_age_65")}
    _require(health == {"boundary_age_64": 90.0, "boundary_age_65": 163.0}, f"age boundary: {health}")
    for joint, single in (("boundary_joint_offer_two_vehicles", "boundary_single_two_vehicles"),
                          ("boundary_joint_offer_legacy_totals", "boundary_single_legacy_totals")):
        _require(by_name[joint]["nre_lines"]["vehicles"] < by_name[single]["nre_lines"]["vehicles"],
                 f"{joint}: the second vehicle is not exempt")
    _require(by_name["pay_frequency_not_applicable"]["status"] != "information_needed",
             "pay_frequency 'not_applicable' must not block evaluation (open question 2)")
    for name, expected in by_name.items():
        if name.startswith("null_"):
            column = name[len("null_"):]
            _require(expected["status"] == "information_needed"
                     and column in expected["missing_question_ids"] + expected["missing_financial_fields"],
                     f"{name}: a NULL must block evaluation")


def validations() -> list[dict]:
    """Every question against each sample value, with Python's accept/reject and message."""
    out = []
    for question in QUESTIONS:
        for value in VALIDATION_SAMPLES:
            try:
                validate_answer(question["id"], value)
                error = None
            except TypeError as exception:
                error = str(exception)
            out.append({"question_id": question["id"], "value": value, "ok": error is None, "error": error})
    return out


def standards_samples() -> dict:
    """Descriptive only: what the fake returns. The tests replay recorded calls, not this table."""
    fake = FakeStandardsRepository()
    return {"source": "FakeStandardsRepository", "samples": {
        "national": {str(size): fake.national_amount(size) for size in range(1, 9)},
        "health": {str(age): fake.health_care_amount(age) for age in (30, 64, 65)},
        "ownership": {str(count): fake.transportation_ownership_amount(count) for count in range(4)},
        "operating": {str(count): fake.transportation_operating_amount("Miami", count) for count in range(4)},
        "housing": fake.housing_amount("FL", "Miami-Dade County", 1),
    }}


def build_payload() -> dict:
    cases = [build_case(name, row) for name, row in
             existing_test_cases() + grid_cases() + boundary_cases() + other_cases()]
    _check_coverage(cases)
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
        "validations": validations(),
        "standards": standards_samples(),
        "cases": cases,
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
