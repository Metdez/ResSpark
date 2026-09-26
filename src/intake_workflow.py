"""Document-first chat flow using case_financial_data as its only input.

The client flow is: initial taxpayer questions -> targeted uploads -> document
analysis -> only applicable follow-ups -> deterministic screening.
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

# ai_flags is review output. The OIC term is backend-only and remains optional
# until a future OIC calculation supplies it.
REQUIRED_FINANCIAL_COLUMNS = set(FinancialData.__dataclass_fields__) - {
    "ai_flags",
    "oic_payment_months",
    "tax_only_balance",
}

# The initial subset of taxpayer-facing questions; the remaining applicable
# questions are collected only when needed.
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
    required: bool = True


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
    "irs_transcripts": DocumentRequest("irs_transcripts", "IRS account transcript", "Upload an IRS account transcript or balance notice. Include a wage and income transcript here if you have it."),
    "bank_statements": DocumentRequest("bank_statements", "Recent personal bank statements", "Upload statements for each of the most recent three months."),
    "pay_stubs": DocumentRequest("pay_stubs", "Recent pay stubs and W-2", "Upload your recent pay stubs and latest W-2."),
    "self_employment": DocumentRequest("self_employment", "Self-employment records", "Upload a recent profit-and-loss report, business bank statements, and the applicable Schedule C, E, or F."),
    "real_property": DocumentRequest("real_property", "Real-property records", "Upload a mortgage or HELOC statement if applicable, plus a property valuation or tax assessment."),
    "lease": DocumentRequest("lease", "Lease agreement", "Upload your current residential lease agreement."),
    "housing_utilities": DocumentRequest("housing_utilities", "Recent utility statement", "Optionally upload a recent utility statement for your residence.", required=False),
    "vehicle": DocumentRequest("vehicle", "Vehicle records", "Upload registration and a current valuation for each vehicle. Include a loan or lease statement only when one exists."),
    "retirement": DocumentRequest("retirement", "Retirement-account records", "Upload recent retirement-account and retirement-loan statements."),
    "insurance": DocumentRequest("insurance", "Life-insurance records", "Upload a cash-value statement and any policy-loan statement."),
    "investments": DocumentRequest("investments", "Investment-account records", "Upload recent brokerage or investment-account statements."),
    "bankruptcy": DocumentRequest("bankruptcy", "Bankruptcy records", "Upload the bankruptcy petition and a current case-status document."),
}


def _is_applicable(question_id: str, case_row: Mapping[str, object]) -> bool:
    if question_id in {"filing_joint_offer", "age_spouse"}:
        return case_row.get("filing_status_married") is True
    if question_id == "rents_home":
        return case_row.get("owns_home") is False
    return True


def validate_answer(question_id: str, value: object) -> None:
    """Validate a chat answer against its taxpayer-question declaration."""
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
    """Unanswered taxpayer questions, based only on canonical row values."""
    return sorted(
        question_id
        for question_id in QUESTION_BY_ID
        if question_id != "tax_only_balance" and case_row.get(question_id) is None
    )


def missing_financial_columns(case_row: Mapping[str, object]) -> list[str]:
    """FinancialData inputs still NULL in case_financial_data."""
    return sorted(
        field_name
        for field_name in REQUIRED_FINANCIAL_COLUMNS
        if case_row.get(field_name) is None
    )


def financial_data_from_case_row(case_row: Mapping[str, object]) -> FinancialData:
    """Build FinancialData directly from a canonical SQL row."""
    missing = missing_financial_columns(case_row)
    if missing:
        raise ValueError(f"Cannot build FinancialData; missing: {', '.join(missing)}")

    values: dict[str, object] = {}
    for field_name in FinancialData.__dataclass_fields__:
        if field_name == "ai_flags":
            values[field_name] = case_row.get(field_name) or []
        else:
            values[field_name] = _database_value(case_row.get(field_name))
    return FinancialData(**values)


def initial_questions(case_row: Mapping[str, object] | None = None) -> list[dict]:
    """Return the short initial subset of taxpayer questions."""
    case_row = case_row or {}
    return [
        QUESTION_BY_ID[question_id]
        for question_id in INITIAL_QUESTION_IDS
        if _is_applicable(question_id, case_row)
    ]


def document_requests_for(case_row: Mapping[str, object]) -> list[DocumentRequest]:
    """Create document requests from values stored in case_financial_data."""
    codes = ["irs_transcripts", "bank_statements"]
    if case_row.get("is_wage_earner"):
        codes.append("pay_stubs")
    if case_row.get("is_self_employed"):
        codes.append("self_employment")
    if case_row.get("owns_home") or case_row.get("has_real_property"):
        codes.append("real_property")
    if case_row.get("owns_home") is False and case_row.get("rents_home"):
        codes.append("lease")
    if case_row.get("owns_home") is True or (case_row.get("owns_home") is False and case_row.get("rents_home") is True):
        codes.append("housing_utilities")
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
    }
    return [label for field, label in flag_labels.items() if case_row.get(field) is True]


def evaluate_case(
    case_row: Mapping[str, object], standards_repository: StandardsRepository | None = None
) -> WorkflowResult:
    """Evaluate only canonical database data with the deterministic engine."""
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
