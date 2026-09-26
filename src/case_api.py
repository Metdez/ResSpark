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

from document_parse import parse_uploads
from financial_data import FinancialData
from intake_workflow import QUESTION_BY_ID, evaluate_case, validate_answer
from questions import QUESTIONS
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
}


def case_result(answers: dict, uploads: list[tuple[str, bytes, str]], metadata: list | None = None,
                standards_repository=_DATABASE) -> dict:
    """Build the JSON result for one submitted case."""
    row = _answers(answers)
    parsed, errors = _parsed(uploads)
    row.update(parsed)
    return result_for_row(row, _documents(uploads, metadata or []), errors, standards_repository)


def result_for_row(row: dict, documents: list, errors: list, standards_repository=_DATABASE) -> dict:
    """Screen a merged case row. A missing fact stays missing."""
    repository = None if standards_repository is _DATABASE else standards_repository
    try:
        workflow = evaluate_case(row, repository)
    except ValueError as error:
        if standards_repository is not _DATABASE:
            return _unresolved(row, documents, errors, str(error))
        try:
            workflow = _from_database(row)
        except LookupError as db_error:
            return _unresolved(row, documents, errors, str(db_error))
        except Exception:
            return _unresolved(row, documents, errors, "Could not read IRS standards from DATABASE_URL.")
    except LookupError as error:
        return _unresolved(row, documents, errors, str(error))

    if workflow.status == "information_needed":
        missing = list(dict.fromkeys([*workflow.missing_question_ids, *workflow.missing_financial_fields]))
        notes = _file_notes(errors) + list(workflow.review_flags) + _compliance(row)
        outcome = _outcome(
            "manual_payment", "Information still needed", "More information needed", "manual_review",
            "Some required facts are still missing, so no collection path was selected.",
            "Add the missing facts and submit the case again. " + _NEXT,
            [_label(key) for key in missing], None, notes,
        )
        return _payload(row, documents, outcome)

    determination = workflow.determination
    outcome_id, short = _PATHS.get(determination.path, ("manual_payment", "Manual review"))
    status = "blocked" if workflow.status == "blocked" else (
        "manual_review" if workflow.status == "ready_for_review" or errors else "potential_match"
    )
    notes = _file_notes(errors) + list(workflow.review_flags)
    outcome = _outcome(
        outcome_id, determination.path, short, status, determination.reason, _NEXT,
        list(determination.review_notes) or [determination.reason], determination, notes,
    )
    return _payload(row, documents, outcome)


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


def _unresolved(row: dict, documents: list, errors: list, reason: str) -> dict:
    outcome = _outcome(
        "manual_payment", "Standards unavailable", "Standards unavailable", "manual_review",
        reason, _NEXT, [], None, _file_notes(errors),
    )
    return _payload(row, documents, outcome)


def _payload(row: dict, documents: list, outcome: dict) -> dict:
    return {
        "caseLabel": "Tax resolution screening",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "outcome": outcome,
        "documents": documents,
        "financialSections": _sections(row),
    }


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


def _parsed(uploads: list[tuple[str, bytes, str]]) -> tuple[dict, list]:
    if not uploads:
        return {}, []
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        files = []
        for index, (name, payload, _mime) in enumerate(uploads):
            path = folder / f"{index}.pdf"
            path.write_bytes(payload)
            files.append((name, path))
        return parse_uploads(files)


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


def _sections(row: dict) -> list:
    keys = []
    for question in QUESTIONS:
        if row.get(question["id"]) is not None:
            keys.append(question["id"])
    for name in FinancialData.__dataclass_fields__:
        if name not in keys and row.get(name) not in (None, [], ""):
            keys.append(name)
    fields = []
    for key in keys:
        value = row[key]
        if isinstance(value, list):
            value = ", ".join(str(item) for item in value)
        fields.append({"key": key, "label": _label(key), "value": value, "format": _format(key, value)})
    if not fields:
        return []
    return [{
        "id": "case",
        "title": "Case record",
        "description": "Answers and values read from uploaded PDFs.",
        "fields": fields,
    }]


def _label(key: str) -> str:
    question = QUESTION_BY_ID.get(key)
    return question["prompt"] if question else key.replace("_", " ")


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
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(("127.0.0.1", 8000), _Handler)
    print("ResSpark case API at http://127.0.0.1:8000/api/cases", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
