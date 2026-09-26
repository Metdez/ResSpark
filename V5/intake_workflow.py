"""V5 document-first chat flow using case_financial_data as its only input.

The client flow remains: initial V2 questions -> targeted uploads -> document
analysis -> only missing V2 follow-ups -> unchanged V2 determination.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal

from determination import determine_resolution_path
from financial_data import FinancialData
from questions import QUESTIONS
from standards_repository import StandardsRepository


QUESTION_BY_ID = {question["id"]: question for question in QUESTIONS}

# ai_flags is review output. The OIC term remains NULL until V2 first identifies
# an OIC candidate, preserving the existing chat flow.
REQUIRED_FINANCIAL_COLUMNS = set(FinancialData.__dataclass_fields__) - {
    "ai_flags",
    "oic_payment_months",
}

# Same original V2 questions; only their timing is different.
INITIAL_QUESTION_IDS = (
    "filing_status_married", "filing_joint_offer", "state_of_residence",
    "county_of_residence", "household_size", "age_taxpayer", "age_spouse",
    "owns_home", "rents_home", "is_wage_earner", "is_self_employed",
    "vehicle_count", "has_real_property", "has_retirement_accounts",
    "has_life_insurance_cash_value", "has_investment_accounts",
    "all_returns_filed", "in_open_bankruptcy",
)


@dataclass(frozen=True)
class DocumentRequest:
    code: str
    title: str
    reason: str


@dataclass
class WorkflowResult:
    status: str
    initial_questions: list[dict] = field(default_factory=list)
    document_requests: list[DocumentRequest] = field(default_factory=list)
    missing_question_ids: list[str] = field(default_factory=list)
    missing_financial_fields: list[str] = field(default_factory=list)
    review_flags: list[str] = field(default_factory=list)
    determination: object | None = None


_REQUESTS = {
    "irs_transcripts": DocumentRequest("irs_transcripts", "IRS account transcripts or balance notices", "Verifies balance, tax type, collection statute, and prior agreement history."),
    "personal_bank_statements": DocumentRequest("personal_bank_statements", "Recent personal bank statements", "Verifies cash balances and recurring deposits."),
    "pay_stubs": DocumentRequest("pay_stubs", "Recent pay stubs and latest W-2", "Verifies gross wages, withholding, and pay frequency."),
    "self_employment": DocumentRequest("self_employment", "Recent profit-and-loss report, business statements, and tax return/Schedule C", "Verifies net business income."),
    "rent": DocumentRequest("rent", "Lease and recent utility bill", "Verifies rent and utilities."),
    "real_property": DocumentRequest("real_property", "Mortgage/HELOC statements and property valuation or tax assessment", "Verifies real-property value and debt."),
    "vehicle": DocumentRequest("vehicle", "Vehicle loan/lease statements, registration, and valuation evidence", "Verifies vehicle costs and equity."),
    "retirement": DocumentRequest("retirement", "Recent retirement-account and loan statements", "Verifies retirement value and loans."),
    "insurance": DocumentRequest("insurance", "Life-insurance cash-value and policy-loan statement", "Verifies life-insurance equity."),
    "investments": DocumentRequest("investments", "Recent brokerage or investment-account statement", "Verifies investment value."),
    "bankruptcy": DocumentRequest("bankruptcy", "Bankruptcy petition and current case-status document", "An open bankruptcy blocks V2's resolution recommendation."),
}


def _is_applicable(question_id: str, case_row: Mapping[str, object]) -> bool:
    if question_id in {"filing_joint_offer", "age_spouse"}:
        return case_row.get("filing_status_married") is True
    if question_id == "rents_home":
        return case_row.get("owns_home") is False
    return True


def validate_answer(question_id: str, value: object) -> None:
    """Validate a chat answer against the unchanged V2 declaration."""
    expected = QUESTION_BY_ID[question_id]["type"]
    valid = type(value) in {int, float} if expected is float else type(value) is expected
    if not valid:
        raise TypeError(f"{question_id} requires {expected.__name__}; got {type(value).__name__}")


def _database_value(value: object) -> object:
    """Convert PostgreSQL numeric values while leaving all other values alone."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [_database_value(item) for item in value]
    return value


def missing_question_ids(case_row: Mapping[str, object]) -> list[str]:
    """Unanswered original V2 questions, based only on canonical row values."""
    return sorted(
        question_id
        for question_id in QUESTION_BY_ID
        if question_id != "oic_payment_months" and case_row.get(question_id) is None
    )


def missing_financial_columns(case_row: Mapping[str, object]) -> list[str]:
    """FinancialData inputs still NULL in case_financial_data."""
    return sorted(
        field_name
        for field_name in REQUIRED_FINANCIAL_COLUMNS
        if case_row.get(field_name) is None
    )


def financial_data_from_case_row(case_row: Mapping[str, object]) -> FinancialData:
    """Build unchanged V2 FinancialData directly from a canonical SQL row."""
    missing = missing_financial_columns(case_row)
    if missing:
        raise ValueError(f"Cannot build FinancialData; missing: {', '.join(missing)}")

    values: dict[str, object] = {}
    for field_name in FinancialData.__dataclass_fields__:
        if field_name == "ai_flags":
            values[field_name] = case_row.get(field_name) or []
        elif field_name == "oic_payment_months" and case_row.get(field_name) is None:
            continue
        else:
            values[field_name] = _database_value(case_row.get(field_name))
    return FinancialData(**values)


def initial_questions(case_row: Mapping[str, object] | None = None) -> list[dict]:
    """Return the short initial subset of V2 questions."""
    case_row = case_row or {}
    return [
        QUESTION_BY_ID[question_id]
        for question_id in INITIAL_QUESTION_IDS
        if _is_applicable(question_id, case_row)
    ]


def document_requests_for(case_row: Mapping[str, object]) -> list[DocumentRequest]:
    """Create document requests from values stored in case_financial_data."""
    codes = ["irs_transcripts", "personal_bank_statements"]
    if case_row.get("is_wage_earner"):
        codes.append("pay_stubs")
    if case_row.get("is_self_employed"):
        codes.append("self_employment")
    if case_row.get("owns_home") or case_row.get("has_real_property"):
        codes.append("real_property")
    elif case_row.get("rents_home"):
        codes.append("rent")
    if (case_row.get("vehicle_count") or 0) > 0:
        codes.append("vehicle")
    if case_row.get("has_retirement_accounts"):
        codes.append("retirement")
    if case_row.get("has_life_insurance_cash_value"):
        codes.append("insurance")
    if case_row.get("has_investment_accounts"):
        codes.append("investments")
    if case_row.get("in_open_bankruptcy"):
        codes.append("bankruptcy")
    return [_REQUESTS[code] for code in dict.fromkeys(codes)]


def _review_flags(case_row: Mapping[str, object]) -> list[str]:
    flag_labels = {
        "filed_bankruptcy_past_7yrs": "Prior bankruptcy in the past seven years",
        "in_litigation": "Current litigation",
        "prior_ia_or_oic_default": "Prior IRS agreement or offer default",
        "transferred_asset_10k_10yrs": "Asset transfer over $10,000 for less than value",
    }
    return [label for field, label in flag_labels.items() if case_row.get(field) is True]


def evaluate_case(
    case_row: Mapping[str, object], standards_repository: StandardsRepository | None = None
) -> WorkflowResult:
    """Evaluate only canonical database data with the unchanged V2 engine."""
    missing_questions = [
        question_id for question_id in missing_question_ids(case_row)
        if _is_applicable(question_id, case_row)
    ]
    missing_fields = missing_financial_columns(case_row)
    requests = document_requests_for(case_row)
    flags = _review_flags(case_row)

    if missing_questions or missing_fields:
        return WorkflowResult(
            status="information_needed",
            initial_questions=initial_questions(case_row),
            document_requests=requests,
            missing_question_ids=missing_questions,
            missing_financial_fields=missing_fields,
            review_flags=flags,
        )

    if standards_repository is None:
        raise ValueError("A database-backed standards repository is required for a complete case.")

    determination = determine_resolution_path(
        financial_data_from_case_row(case_row), standards_repository
    )
    if determination.path.startswith("Offer in Compromise") and case_row.get("oic_payment_months") is None:
        return WorkflowResult(
            status="information_needed",
            initial_questions=initial_questions(case_row),
            document_requests=requests,
            missing_question_ids=["oic_payment_months"],
            review_flags=flags,
        )

    status = "blocked" if determination.path.startswith("BLOCKED") else (
        "ready_for_review" if flags or determination.needs_manual_review else "ready"
    )
    return WorkflowResult(
        status=status,
        initial_questions=initial_questions(case_row),
        document_requests=requests,
        review_flags=flags + list(determination.review_notes),
        determination=determination,
    )
