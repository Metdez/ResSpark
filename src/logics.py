"""Send a screened case to the IRS Logics CRM (Logics Public API V4).

Uses Basic authentication: IRS_LOGICS_KEY is the username and
IRS_LOGICS_SECRET the password. The demo writes to IRS_LOGICS_CASEID_DEMO.
A failure here never changes the screening result; it only adds a note.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
import uuid

BASE_URL = "https://valortax.logiqsapi.com/publicapi/V4/"
MAX_FILE = 6 * 1024 * 1024
_TIMEOUT = 15


def push_case(result: dict, uploads: list[tuple[str, bytes, str]]) -> str | None:
    """Write the result, the case data, and the files to the Logics case. Returns one note."""
    key = os.environ.get("IRS_LOGICS_KEY")
    secret = os.environ.get("IRS_LOGICS_SECRET")
    case_id = os.environ.get("IRS_LOGICS_CASEID_DEMO")
    if not key or not secret or not case_id:
        return None
    if not case_id.isdigit():
        return "IRS Logics: IRS_LOGICS_CASEID_DEMO is not a case number."
    case_id = int(case_id)
    auth = "Basic " + base64.b64encode(f"{key}:{secret}".encode()).decode()
    outcome = result["outcome"]
    failures = []

    def send(step: str, path: str, body: bytes, content_type: str) -> None:
        request = urllib.request.Request(
            BASE_URL + path, data=body, method="POST",
            headers={"Authorization": auth, "Content-Type": content_type},
        )
        try:
            with urllib.request.urlopen(request, timeout=_TIMEOUT) as response:
                reply = json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            failures.append(f"{step} failed (HTTP {error.code})")
            error.close()
            return
        except (OSError, ValueError) as error:
            failures.append(f"{step} failed ({type(error).__name__})")
            return
        if not reply.get("Success"):
            failures.append(f"{step} failed ({reply.get('message') or 'no success flag'})")

    def post_json(step: str, path: str, payload: dict) -> None:
        send(step, path, json.dumps(payload).encode(), "application/json")

    fields = {f["key"]: f["value"] for s in result["sourceOfTruth"]["fieldSections"] for f in s["fields"]}
    update = {"CaseID": case_id}
    if isinstance(fields.get("total_tax_owed"), (int, float)):
        update["TaxAmount"] = round(fields["total_tax_owed"])
    state = fields.get("state_of_residence")
    if isinstance(state, str) and len(state) == 2:
        update["State"] = state.upper()
    post_json("case update", "UpdateCase/UpdateCase", update)

    post_json("screening note", "CaseActivity/Activity", {
        "CaseID": case_id, "ActivityType": "General", "Pin": True,
        "Subject": f"ResSpark screening: {outcome['path']}",
        "Comment": _summary(result),
    })
    post_json("case data note", "CaseActivity/Activity", {
        "CaseID": case_id, "ActivityType": "General",
        "Subject": "ResSpark case data (Form 433-A)",
        "Comment": _case_data(result),
    })

    documents = result.get("documents", [])
    for index, (name, payload, mime) in enumerate(uploads):
        if len(payload) > MAX_FILE:
            # ponytail: no compression; add it if real packets exceed 6 MB
            failures.append(f"{name} is over 6 MB and was not uploaded")
            continue
        label = documents[index].get("categoryLabel", "") if index < len(documents) else ""
        body, content_type = _multipart(
            {"CaseID": str(case_id), "Comment": f"{label}: {name}" if label else name},
            name, payload, mime,
        )
        # The live API returns 404 unless CaseID is also in the query string.
        send(f"upload of {name}", f"Documents/CaseDocument?CaseID={case_id}", body, content_type)

    if failures:
        return "IRS Logics: " + "; ".join(failures) + "."
    return f"Sent to IRS Logics case {case_id}."


def _summary(result: dict) -> str:
    outcome = result["outcome"]
    lines = [
        f"Path: {outcome['path']}",
        f"Status: {outcome['status']}",
        f"Reason: {outcome['reason']}",
    ]
    for label, key in (
        ("Monthly income", "monthlyIncome"), ("Monthly expenses", "monthlyExpenses"),
        ("Net disposable income", "netDisposableIncome"), ("Net realizable equity", "netRealizableEquity"),
        ("Suggested offer or payment", "suggestedOfferOrPayment"),
    ):
        if outcome.get(key) is not None:
            lines.append(f"{label}: ${outcome[key]:,.2f}")
    for item in result.get("neededDocuments", []):
        lines.append(f"Still needed: {item['title']} - {item['detail']}")
    for note in outcome.get("reviewNotes", []):
        lines.append(f"Review note: {note}")
    lines.append("Suggested path for professional review, not a filing decision.")
    return "\n".join(lines)


def _case_data(result: dict) -> str:
    lines = []
    for section in result["sourceOfTruth"]["fieldSections"]:
        lines.append(f"== {section['title']} ==")
        for field in section["fields"]:
            source = ", ".join(item["label"] for item in field.get("sources", []))
            lines.append(f"{field['label']}: {_shown(field)} ({source})")
    return "\n".join(lines)


def _shown(field: dict) -> str:
    value = field["value"]
    if value is None or value == "":
        return "Not provided"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if field.get("format") == "currency" and isinstance(value, (int, float)):
        return f"${value:,.2f}"
    return str(value)


def _multipart(fields: dict, filename: str, payload: bytes, mime: str) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    safe_name = filename.replace('"', "")
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        for name, value in fields.items()
    ]
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="File"; filename="{safe_name}"\r\n'
        f"Content-Type: {mime or 'application/octet-stream'}\r\n\r\n".encode() + payload + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"
