"""Local POST /api/cases handler for the intake screen.

The browser sends questionnaire answers and the selected files. This reads the
PDFs, merges them onto those answers, and returns the screening result the
page renders. IRS standards still come from PostgreSQL when a path can be
calculated.
"""

from __future__ import annotations

from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import tempfile

from document_parse import parse_uploads_with_evidence
from financial_data import FinancialData
from intake_workflow import QUESTION_BY_ID, evaluate_case, validate_answer
from standards_repository import PostgresStandardsRepository


_DATABASE = object()
_MAX_BODY = 32 * 1024 * 1024  # ponytail: whole body is read into memory; raise this if packets grow
_NEXT = "A tax professional must review this result before anything is filed."
_COUNTS = {
    "household_size", "dependents_count", "age_taxpayer", "age_spouse",
    "vehicle_count", "csed_months_remaining", "oic_payment_months",
}
_PATHS = {
    "BLOCKED — Compliance gate failed": ("blocked", "Compliance block"),
    "Currently Not Collectible (CNC / Status 53)": ("cnc", "Currently not collectible"),
    "MANUAL REVIEW — negative income, meaningful equity present": ("manual_equity", "Manual review"),
    "Simple Payment Plan": ("simple_plan", "Simple payment plan"),
    "Non-Simple Installment Agreement": ("non_simple_installment", "Non-simple installment agreement"),
    "MANUAL REVIEW — payment resolution needs review": ("manual_payment", "Manual review"),
    "Offer in Compromise": ("oic", "Offer in compromise"),
}


def _load_local_environment(path: Path | None = None) -> None:
    """Load ignored local settings without overriding deployed environment variables."""
    target = path or Path(__file__).resolve().parents[1] / ".env"
    if not target.exists():
        return
    for raw_line in target.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def case_result(answers: dict, uploads: list[tuple[str, bytes, str]], metadata: list | None = None,
                standards_repository=_DATABASE) -> dict:
    """Build the JSON result for one submitted case."""
    answer_row = _answers(answers)
    parsed, errors, evidence = _parsed(uploads)
    row = dict(answer_row)
    row.update(parsed)
    documents = _documents(uploads, metadata or [])
    for index, item in enumerate(evidence):
        document = documents[index] if index < len(documents) else {}
        item["category"] = document.get("category", "")
        item["categoryLabel"] = document.get("categoryLabel", "")
    return result_for_row(
        row, documents, errors, standards_repository,
        _field_sources(answer_row, parsed, evidence), evidence,
    )


# These lines have no template. A missing value is screened as zero so a path
# can still be suggested. ponytail: a household that does have one of these
# lines is screened too low until a question or a document supplies it.
# Health premiums and withholding are not here; a missing statement blocks.
_ASSUMED_ZERO = (
    "social_security_income", "pension_income", "other_income",
    "interest_dividends_royalties", "distributions_income", "net_rental_income",
    "child_support_received", "alimony_received", "actual_court_ordered_payments",
    "actual_child_dependent_care", "actual_life_insurance_premiums",
    "actual_delinquent_state_local_tax", "actual_secured_debts_other",
    "actual_vehicle_operating", "actual_public_transportation",
    "other_valuable_assets_value", "other_valuable_assets_loan",
)

# Titles match the document requests in intake_workflow.
_FILES = {
    "irs_transcripts": ("IRS account transcript", "Upload an IRS account transcript or balance notice. Include a wage and income transcript here if you have it."),
    "bank_statements": ("Recent personal bank statements", "Upload statements for each of the most recent three months."),
    "pay_stubs": ("Recent pay stubs and W-2", "Upload your recent pay stubs and latest W-2."),
    "self_employment": ("Self-employment records", "Upload a recent profit-and-loss report, business bank statements, and the applicable Schedule C, E, or F."),
    "real_property": ("Real-property records", "Upload a mortgage or HELOC statement if applicable, plus a property valuation or tax assessment."),
    "lease": ("Lease agreement", "Upload your current residential lease agreement."),
    "vehicle": ("Vehicle records", "Upload registration and a current valuation for each vehicle. Include a loan or lease statement only when one exists."),
    "retirement": ("Retirement-account records", "Upload recent retirement-account and retirement-loan statements."),
    "insurance": ("Life-insurance records", "Upload a cash-value statement and any policy-loan statement."),
    "investments": ("Investment-account records", "Upload recent brokerage or investment-account statements."),
    "health": ("Health insurance premium statement", "Upload a statement that shows the monthly premium."),
}

_SECTION_SPECS = (
    ("profile", "Household and filing profile", "Taxpayer, household, location, and filing facts.", (
        "filing_status_married", "filing_joint_offer", "state_of_residence", "county_of_residence",
        "household_size", "dependents_count", "age_taxpayer", "age_spouse", "owns_home",
        "rents_home", "is_wage_earner", "pay_frequency", "is_self_employed", "vehicle_count",
        "has_real_property", "has_retirement_accounts", "has_life_insurance_cash_value",
        "has_investment_accounts",
    )),
    ("income", "Monthly household income", "Form 433-A (OIC), Section 7, Box D.", (
        "gross_wages_taxpayer", "gross_wages_spouse", "social_security_income", "pension_income",
        "other_income", "interest_dividends_royalties", "distributions_income", "net_rental_income",
        "net_business_income", "child_support_received", "alimony_received",
    )),
    ("expenses", "Monthly household expenses", "Form 433-A (OIC), Section 7, Box E.", (
        "actual_housing_utilities", "actual_vehicle_loan_lease", "actual_vehicle_operating",
        "actual_public_transportation", "actual_health_insurance_premiums",
        "actual_court_ordered_payments", "actual_child_dependent_care",
        "actual_life_insurance_premiums", "actual_current_taxes",
        "actual_delinquent_state_local_tax", "actual_secured_debts_other",
    )),
    ("assets", "Personal assets", "Form 433-A (OIC), Section 3.", (
        "cash_and_bank_balances", "investment_accounts_net", "retirement_accounts_market_value",
        "retirement_accounts_loan_balance", "life_insurance_cash_value",
        "life_insurance_loan_balance", "real_property_market_value", "real_property_loan_balance",
        "vehicle_market_value_total", "vehicle_loan_balance_total", "vehicle_market_values",
        "vehicle_loan_balances", "other_valuable_assets_value", "other_valuable_assets_loan",
    )),
    ("compliance", "Compliance and IRS liability", "Filing, eligibility, balance, and collection facts.", (
        "all_returns_filed", "in_open_bankruptcy", "filed_bankruptcy_past_7yrs", "in_litigation",
        "prior_ia_or_oic_default", "filed_and_paid_timely_last_5_years",
        "installment_agreement_last_5_years", "total_tax_owed", "tax_only_balance",
        "csed_months_remaining", "oic_payment_months",
    )),
    ("review", "Review indicators", "Additional facts for professional review.", ("ai_flags",)),
)


def _screenable(row: dict) -> tuple[dict, list[str], dict[str, str]]:
    """Copy a case and fill only the lines that can be screened without inventing a fact that was asked for."""
    screened = dict(row)
    notes = []
    origins = {}

    def known(key: str, value: object) -> None:
        if screened.get(key) is None:
            screened[key] = value
            origins[key] = "derived"

    if screened.get("filing_status_married") is False:
        known("filing_joint_offer", False)
        known("age_spouse", 0)
        known("gross_wages_spouse", 0.0)
    elif screened.get("filing_status_married") is True and screened.get("gross_wages_spouse") is None:
        known("gross_wages_spouse", 0.0)
        notes.append("Spouse wages were not listed separately and were screened as zero.")
    if screened.get("is_wage_earner") is False:
        known("gross_wages_taxpayer", 0.0)
        known("actual_current_taxes", 0.0)
        known("pay_frequency", "")
    if screened.get("is_self_employed") is False:
        known("net_business_income", 0.0)
    if screened.get("owns_home") is False and screened.get("rents_home") is False:
        known("actual_housing_utilities", 0.0)
    if screened.get("vehicle_count") == 0:
        for key in (
            "actual_vehicle_loan_lease", "actual_vehicle_operating",
            "vehicle_market_value_total", "vehicle_loan_balance_total",
        ):
            known(key, 0.0)
        known("vehicle_market_values", [])
        known("vehicle_loan_balances", [])
    elif screened.get("vehicle_count"):
        known("actual_public_transportation", 0.0)
        known("actual_vehicle_loan_lease", 0.0)
        if screened.get("vehicle_loan_balances") is None and screened.get("vehicle_loan_balance_total") is None:
            screened["vehicle_loan_balances"] = []
            screened["vehicle_loan_balance_total"] = 0.0
        elif screened.get("vehicle_loan_balances") is None:
            screened["vehicle_loan_balances"] = []
        elif screened.get("vehicle_loan_balance_total") is None:
            screened["vehicle_loan_balance_total"] = sum(screened["vehicle_loan_balances"])
        if screened.get("vehicle_market_values") is None and screened.get("vehicle_market_value_total") is not None:
            screened["vehicle_market_values"] = []
        if screened.get("vehicle_market_value_total") is None and screened.get("vehicle_market_values"):
            screened["vehicle_market_value_total"] = sum(screened["vehicle_market_values"])
    if screened.get("has_retirement_accounts") is False:
        known("retirement_accounts_market_value", 0.0)
        known("retirement_accounts_loan_balance", 0.0)
    if screened.get("has_life_insurance_cash_value") is False:
        known("life_insurance_cash_value", 0.0)
        known("life_insurance_loan_balance", 0.0)
    if screened.get("has_investment_accounts") is False:
        known("investment_accounts_net", 0.0)
    if screened.get("owns_home") is False and screened.get("has_real_property") is False:
        known("real_property_market_value", 0.0)
        known("real_property_loan_balance", 0.0)
    assumed = [key for key in _ASSUMED_ZERO if screened.get(key) is None]
    for key in assumed:
        screened[key] = 0.0
        origins[key] = "assumption"
    if assumed:
        notes.append("Income and expense lines that were not asked and not on a document were screened as zero.")
    return screened, notes, origins


def result_for_row(row: dict, documents: list, errors: list, standards_repository=_DATABASE,
                   field_sources: dict | None = None, document_evidence: list | None = None) -> dict:
    """Screen a merged case row. A missing requested fact stays missing."""
    screened, assumptions, added_origins = _screenable(row)
    sources = _complete_sources(row, field_sources or {}, added_origins)
    evidence = document_evidence or []
    repository = None if standards_repository is _DATABASE else standards_repository
    try:
        workflow = evaluate_case(screened, repository)
    except ValueError as error:
        if standards_repository is not _DATABASE:
            return _unresolved(row, screened, documents, errors, str(error), sources, evidence)
        try:
            workflow = _from_database(screened)
        except LookupError as db_error:
            return _unresolved(row, screened, documents, errors, str(db_error), sources, evidence)
        except Exception:
            return _unresolved(
                row, screened, documents, errors,
                "Could not read IRS standards from DATABASE_URL.", sources, evidence,
            )
    except LookupError as error:
        return _unresolved(row, screened, documents, errors, str(error), sources, evidence)

    if workflow.status == "information_needed":
        missing = list(dict.fromkeys([*workflow.missing_question_ids, *workflow.missing_financial_fields]))
        labels = [_label(key) for key in missing]
        notes = _file_notes(errors) + list(workflow.review_flags) + _compliance(row)
        outcome = _outcome(
            "manual_payment", "Information still needed", "More information needed", "manual_review",
            "No collection path was selected. Still needed: " + "; ".join(labels) + ".",
            "Add the missing facts and submit the case again. " + _NEXT,
            labels, None, notes,
        )
        return _payload(
            row, screened, documents, outcome, _needed_documents(missing, row),
            sources, evidence, [],
        )

    determination = workflow.determination
    outcome_id, short = _PATHS.get(determination.path, ("manual_payment", "Manual review"))
    status = "blocked" if workflow.status == "blocked" else (
        "manual_review" if workflow.status == "ready_for_review" or errors else "potential_match"
    )
    notes = _file_notes(errors) + list(workflow.review_flags) + assumptions
    outcome = _outcome(
        outcome_id, determination.path, short, status, determination.reason, _NEXT,
        list(determination.review_notes) or [determination.reason], determination, notes,
    )
    return _payload(
        row, screened, documents, outcome, None, sources, evidence,
        determination.calculation_trace,
    )


def response_for(content_type: str, body: bytes) -> tuple[int, dict]:
    """Turn one multipart submission into a status and JSON body."""
    try:
        answers, uploads, metadata = _read_form(content_type, body)
        return 200, case_result(answers, uploads, metadata)
    except ValueError as error:
        return 400, {"error": str(error)}


def _from_database(row: dict):
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise LookupError("Set DATABASE_URL and seed the IRS standards tables.")
    try:
        import psycopg
    except ImportError as error:
        raise LookupError("Install psycopg to look up IRS standards.") from error
    with psycopg.connect(url) as connection:
        return evaluate_case(row, PostgresStandardsRepository(connection))


def _unresolved(row: dict, screened: dict, documents: list, errors: list, reason: str,
                sources: dict, evidence: list) -> dict:
    outcome = _outcome(
        "manual_payment", "Standards unavailable", "Standards unavailable", "manual_review",
        reason, _NEXT, [], None, _file_notes(errors),
    )
    return _payload(row, screened, documents, outcome, None, sources, evidence, [])


def _payload(row: dict, screened: dict, documents: list, outcome: dict,
             needed: list | None = None, sources: dict | None = None,
             evidence: list | None = None, calculations: list | None = None) -> dict:
    return {
        "caseLabel": "Tax resolution screening",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "outcome": outcome,
        "documents": documents,
        "neededDocuments": needed or [],
        "financialSections": _sections(row),
        "sourceOfTruth": {
            "fieldSections": _sections(screened, sources or {}, include_unknown=True),
            "calculationSections": calculations or [],
            "documentEvidence": _display_evidence(evidence or []),
        },
    }


def _needed_documents(missing: list[str], row: dict) -> list[dict]:
    found = []
    seen = set()
    for key in missing:
        code = _file_code(key, row)
        if code is None or code in seen:
            continue
        seen.add(code)
        title, detail = _FILES[code]
        found.append({"title": title, "detail": detail})
    return found


def _file_code(key: str, row: dict) -> str | None:
    if key in {"total_tax_owed", "csed_months_remaining", "tax_only_balance"}:
        return "irs_transcripts"
    if key == "cash_and_bank_balances":
        return "bank_statements"
    if key in {"gross_wages_taxpayer", "actual_current_taxes"} and row.get("is_wage_earner") is not False:
        return "pay_stubs"
    if key == "net_business_income" and row.get("is_self_employed") is not False:
        return "self_employment"
    if key == "actual_housing_utilities":
        if row.get("owns_home") is True or row.get("has_real_property") is True:
            return "real_property"
        if row.get("rents_home") is True:
            return "lease"
    if key in {"real_property_market_value", "real_property_loan_balance"}:
        return "real_property"
    if key in {"vehicle_market_value_total", "vehicle_market_values"}:
        return "vehicle"
    if key in {"retirement_accounts_market_value", "retirement_accounts_loan_balance"}:
        return "retirement"
    if key in {"life_insurance_cash_value", "life_insurance_loan_balance"}:
        return "insurance"
    if key == "investment_accounts_net":
        return "investments"
    if key == "actual_health_insurance_premiums":
        return "health"
    return None


def _outcome(outcome_id, path, short, status, reason, next_step, requirements, determination, notes) -> dict:
    return {
        "id": outcome_id,
        "path": path,
        "shortLabel": short,
        "status": status,
        "reason": reason,
        "nextStep": next_step,
        "requirements": requirements,
        "monthlyIncome": None if determination is None else determination.monthly_income,
        "monthlyExpenses": None if determination is None else determination.monthly_expenses,
        "netDisposableIncome": None if determination is None else determination.net_disposable_income,
        "netRealizableEquity": None if determination is None else determination.net_realizable_equity,
        "suggestedOfferOrPayment": None if determination is None else determination.suggested_offer_or_payment,
        "reviewNotes": notes,
    }


def _answers(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("answers must be a JSON object.")
    row = {}
    for key, value in payload.items():
        if key not in QUESTION_BY_ID or value is None:
            continue
        try:
            validate_answer(key, value)
        except TypeError as error:
            raise ValueError(str(error)) from error
        row[key] = value
    return row


def _parsed(uploads: list[tuple[str, bytes, str]]) -> tuple[dict, list, list]:
    if not uploads:
        return {}, [], []
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        files = []
        for index, (name, payload, _mime) in enumerate(uploads):
            path = folder / f"{index}.pdf"
            path.write_bytes(payload)
            files.append((name, path))
        return parse_uploads_with_evidence(files)


def _documents(uploads: list[tuple[str, bytes, str]], metadata: list) -> list:
    listed = []
    for index, (name, payload, mime) in enumerate(uploads):
        meta = metadata[index] if index < len(metadata) and isinstance(metadata[index], dict) else {}
        listed.append({
            "category": str(meta.get("category") or ""),
            "categoryLabel": str(meta.get("categoryLabel") or ""),
            "name": name,
            "type": mime or "application/octet-stream",
            "size": len(payload),
        })
    return listed


def _field_sources(answers: dict, parsed: dict, evidence: list) -> dict:
    sources = {
        key: [{"kind": "questionnaire", "label": "Questionnaire response"}]
        for key in answers if key not in parsed
    }
    for document in evidence:
        for field in document.get("fields", []):
            key = field.get("key")
            if key not in parsed or not field.get("usedInCanonical"):
                continue
            sources.setdefault(key, []).append({
                "kind": "document",
                "label": document["name"],
                "documentName": document["name"],
                "snippet": field.get("snippet"),
            })
    for key in parsed:
        if key.startswith("_") or key in sources:
            continue
        sources[key] = [{"kind": "document", "label": "Uploaded document packet"}]
    return sources


def _complete_sources(row: dict, provided: dict, added_origins: dict[str, str]) -> dict:
    sources = {key: list(items) for key, items in provided.items()}
    for key, value in row.items():
        if key.startswith("_") or key in sources or value is None:
            continue
        sources[key] = [{"kind": "questionnaire", "label": "Case record"}]
    labels = {
        "derived": "Derived from an applicable screening rule",
        "assumption": "Screened as zero because no question or document supplies this line",
    }
    for key, kind in added_origins.items():
        sources[key] = [{"kind": kind, "label": labels[kind]}]
    return sources


def _sections(row: dict, sources: dict | None = None, include_unknown: bool = False) -> list:
    sections = []
    included = set()
    for section_id, title, description, keys in _SECTION_SPECS:
        fields = []
        for key in keys:
            included.add(key)
            value = row.get(key)
            if not include_unknown and value in (None, [], ""):
                continue
            fields.append(_display_field(key, value, (sources or {}).get(key)))
        if fields:
            sections.append({"id": section_id, "title": title, "description": description, "fields": fields})
    extras = [
        key for key, value in row.items()
        if not key.startswith("_") and key not in included
        and (include_unknown or value not in (None, [], ""))
    ]
    if extras:
        sections.append({
            "id": "additional",
            "title": "Additional review data",
            "description": "Supporting values outside the Form 433-A calculation fields.",
            "fields": [_display_field(key, row.get(key), (sources or {}).get(key)) for key in extras],
        })
    return sections


def _display_field(key: str, value: object, sources: list | None = None) -> dict:
    shown = (", ".join(str(item) for item in value) if value else "None") if isinstance(value, list) else value
    return {
        "key": key,
        "label": _label(key),
        "value": shown,
        "format": _format(key, shown),
        "sources": sources or [{"kind": "unknown", "label": "Not provided"}],
    }


def _display_evidence(evidence: list) -> list:
    displayed = []
    for document in evidence:
        item = {key: value for key, value in document.items() if key != "fields"}
        item["fields"] = []
        for field in document.get("fields", []):
            value = field.get("value")
            shown = (", ".join(str(part) for part in value) if value else "None") if isinstance(value, list) else value
            item["fields"].append({
                **field,
                "label": _label(field["key"]),
                "value": shown,
                "format": _format(field["key"], shown),
            })
        displayed.append(item)
    return displayed


def _label(key: str) -> str:
    question = QUESTION_BY_ID.get(key)
    if question:
        return question["prompt"]
    label = key.replace("_", " ").capitalize()
    return label.replace("Irs", "IRS").replace("Oic", "OIC").replace("Csed", "CSED")


def _format(key: str, value: object) -> str:
    if isinstance(value, bool):
        return "boolean"
    if key in _COUNTS:
        return "number"
    if isinstance(value, (int, float)):
        return "currency"
    return "text"


def _file_notes(errors: list) -> list[str]:
    return [f"{item['file']}: {item['error']}" for item in errors]


def _compliance(row: dict) -> list[str]:
    notes = []
    if row.get("all_returns_filed") is False:
        notes.append("Not all required tax returns are filed.")
    if row.get("in_open_bankruptcy") is True:
        notes.append("Currently in an open bankruptcy proceeding.")
    return notes


def _read_form(content_type: str, body: bytes) -> tuple[dict, list, list]:
    # ponytail: quoted filenames only; RFC 5987 filename* is ignored
    match = re.search(r'boundary="?([^";]+)"?', content_type)
    if not match:
        raise ValueError("Expected multipart form data.")
    boundary = b"--" + match.group(1).encode()
    answers = None
    metadata = []
    uploads = []
    for chunk in body.split(boundary)[1:]:
        if chunk.startswith(b"--"):
            break
        chunk = chunk.removeprefix(b"\r\n").removesuffix(b"\r\n")
        header_blob, separator, payload = chunk.partition(b"\r\n\r\n")
        if not separator:
            continue
        headers = header_blob.decode("utf-8", "replace")
        name = _disposition(headers, "name")
        if name == "answers":
            answers = json.loads(payload.decode())
        elif name == "document_metadata":
            metadata = json.loads(payload.decode())
        elif name == "documents":
            filename = _disposition(headers, "filename") or "upload"
            mime = ""
            for line in headers.split("\r\n"):
                if line.lower().startswith("content-type:"):
                    mime = line.split(":", 1)[1].strip()
            uploads.append((filename, payload, mime))
    if not isinstance(answers, dict):
        raise ValueError("answers must be a JSON object.")
    if not isinstance(metadata, list):
        raise ValueError("document_metadata must be a JSON list.")
    return answers, uploads, metadata


def _disposition(headers: str, key: str) -> str | None:
    found = re.search(rf'{key}="([^"]*)"', headers, re.I)
    return found.group(1) if found else None


class _Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/cases":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > _MAX_BODY:
            self.send_error(413)
            return
        status, payload = response_for(self.headers.get("Content-Type", ""), self.rfile.read(length))
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main() -> None:
    _load_local_environment()
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(("127.0.0.1", 8000), _Handler)
    print("ResSpark case API at http://127.0.0.1:8000/api/cases", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
