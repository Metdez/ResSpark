"""Turn the example-packet PDFs into case_financial_data columns.

ponytail: reads ReportLab text-show operators. Bank columns use the x y on `Tm`;
every other field is read in draw order. A scanned PDF or another generator
needs poppler (`pdftotext -layout`) instead.
One earnings statement maps to the taxpayer. Auto statements sum.
Housing is the labeled rent or PITI; bank utility lines are not added.
Gross pay is Regular Gross Pay, or Gross Pay when that is the line on the stub.
"""

from __future__ import annotations

import base64
import re
import zlib
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


_PAY_PERIODS = {"weekly": 52, "biweekly": 26, "semimonthly": 24, "monthly": 12}
_PAY_FREQUENCY = {
    "weekly": "weekly",
    "biweekly": "biweekly",
    "everytwoweeks": "biweekly",
    "semimonthly": "semimonthly",
    "twiceamonth": "semimonthly",
    "monthly": "monthly",
}
_TAX_LINES = ("Federal Income Tax", "Social Security Tax", "Medicare Tax", "State Income Tax")
_MONEY = re.compile(r"\$[0-9,.-]+")
# irs_transcripts is omitted: that slot holds both an account transcript and a wage transcript.
_TYPE_HINTS = {
    "bank_statements": "bank",
    "personal_bank_statements": "bank",
    "pay_stubs": "pay_stub",
    "lease_statement": "lease",
    "rent": "lease",
    "mortgage_statement": "mortgage",
    "real_property": "mortgage",
    "auto_loan_statement": "auto",
    "vehicle": "auto",
    "health_insurance_statement": "health",
}


def parse_packet(directory: Path | str) -> dict:
    """Read every PDF in a client packet and return one case-column dict."""
    parts = [parse_pdf(path) for path in sorted(Path(directory).glob("*.pdf"))]
    return merge_documents(parts)


def merge_documents(parts: list[dict]) -> dict:
    """Combine parsed documents. A second auto statement adds to the first."""
    row: dict = {}
    banks = []
    autos = []
    employer = None
    wage_gross = None
    stub = None
    for part in parts:
        kind = part.pop("_kind")
        if kind == "bank":
            banks.append(part)
        elif kind == "auto":
            autos.append(part)
        elif kind == "pay_stub":
            employer = part.pop("_employer")
            stub = part
        elif kind == "wage":
            employer = employer or part.pop("_employer")
            wage_gross = part.get("gross_wages_taxpayer")
        else:
            row.update(part)
    if wage_gross is not None:
        row["gross_wages_taxpayer"] = wage_gross
    if stub:
        row.update(stub)
    if banks:
        row.update(_combine_banks(banks, employer))
    if autos:
        row.update(_combine_autos(autos))
    return row


def parse_pdf(path: Path | str, document_type: str | None = None) -> dict:
    """Parse one PDF. `_kind` says which template matched."""
    texts, rows = _page_text(Path(path).read_bytes())
    kind = _classify(texts, document_type)
    if not kind:
        raise ValueError(f"No template matched {path}")
    return _from_kind(kind, texts, rows)


def parse_texts(texts: list[str], rows: dict | None = None, document_type: str | None = None) -> dict:
    """Parse document text already pulled out of a PDF."""
    kind = _classify(texts, document_type)
    if not kind:
        raise ValueError("No template matched")
    return _from_kind(kind, texts, rows or {})


def _has(head: str, phrase: str) -> bool:
    return re.search(rf"\b{re.escape(phrase)}\b", head) is not None


def _classify(texts: list[str], document_type: str | None) -> str | None:
    head = " ".join(text.strip().lower() for text in texts[:12])
    if (_has(head, "wage") and _has(head, "income")) or _has(head, "wage and tax statement"):
        return "wage"
    if _has(head, "account transcript") or _has(head, "balance notice"):
        return "account"
    if _has(head, "checking") or _has(head, "bank statement") or _has(head, "account statement"):
        return "bank"
    if _has(head, "earnings statement") or _has(head, "pay stub") or _has(head, "paystub"):
        return "pay_stub"
    if _has(head, "rent") or _has(head, "lease"):
        return "lease"
    if _has(head, "mortgage"):
        return "mortgage"
    if _has(head, "auto loan") or _has(head, "vehicle loan"):
        return "auto"
    if _has(head, "premium") or _has(head, "health insurance"):
        return "health"
    return _TYPE_HINTS.get(document_type or "")


def _from_kind(kind: str, texts: list[str], rows: dict) -> dict:
    if kind == "account":
        return {"_kind": "account", **_account_transcript(texts)}
    if kind == "wage":
        return {"_kind": "wage", **_wage_transcript(texts)}
    if kind == "bank":
        return {"_kind": "bank", **_bank_statement(texts, rows)}
    if kind == "pay_stub":
        return {"_kind": "pay_stub", **_pay_stub(texts)}
    if kind == "lease":
        return _lease(texts)
    if kind == "mortgage":
        return _mortgage(texts)
    if kind == "auto":
        return _auto(texts)
    if kind == "health":
        return _health(texts)
    raise ValueError("No template matched")


def _account_transcript(texts: list[str]) -> dict:
    found = _require(_pairs(texts), "Filing Status", "Address", "(CSED)", "Request Date")
    balance_line = next(text for text in texts if text.startswith("ACCOUNT BALANCE"))
    tax_only = Decimal(0)
    for index, text in enumerate(texts):
        if text.strip() == "150":
            tax_only += Decimal(str(_next_money(texts, index)))
    return {
        "filing_status_married": found["Filing Status"].lower().startswith("married"),
        "state_of_residence": _state_code(found["Address"]),
        "total_tax_owed": _money(balance_line.split(":")[-1]),
        "tax_only_balance": float(tax_only.quantize(Decimal("0.01"))),
        "csed_months_remaining": _months_between(_date(found["Request Date"]), _date(found["(CSED)"])),
    }


def _wage_transcript(texts: list[str]) -> dict:
    box_one = None
    for index, text in enumerate(texts):
        if text.startswith("Box 1"):
            box_one = Decimal(str(_next_money(texts, index)))
            break
    if box_one is None:
        raise ValueError("Wage transcript has no Box 1 wages")
    employer = next(text.split("filed by:", 1)[1].strip() for text in texts if "filed by:" in text)
    monthly = (box_one / Decimal(12)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {"_employer": employer, "gross_wages_taxpayer": float(monthly)}


def _pay_stub(texts: list[str]) -> dict:
    found = _require(_pairs(texts), "Pay Frequency")
    raw_frequency = found["Pay Frequency"]
    frequency = _PAY_FREQUENCY.get(raw_frequency.lower().replace("-", "").replace(" ", ""))
    if frequency is None:
        raise ValueError(f"Unknown pay frequency {raw_frequency}")
    gross = Decimal(str(_first_labeled(texts, "Regular Gross Pay", "Gross Pay")))
    taxes = sum(_labeled_amount(texts, label) for label in _TAX_LINES)
    return {
        "_employer": texts[0].strip(),
        "pay_frequency": frequency,
        "gross_wages_taxpayer": _to_monthly(gross, frequency),
        "actual_current_taxes": _to_monthly(abs(taxes), frequency),
    }


def _lease(texts: list[str]) -> dict:
    found = _pairs(texts)
    return {
        "_kind": "lease",
        "actual_housing_utilities": _money(_pick(found, "Monthly Rent", "Rent")),
        "state_of_residence": _state_code(_pick(found, "Property Address")),
        "rents_home": True,
        "owns_home": False,
    }


def _mortgage(texts: list[str]) -> dict:
    found = _pairs(texts)
    return {
        "_kind": "mortgage",
        "actual_housing_utilities": _money(_pick(found, "Monthly Payment (PITI)", "PITI")),
        "real_property_loan_balance": _money(_pick(found, "Current Principal Balance", "Principal Balance")),
        "real_property_market_value": _money(_pick(found, "Estimated Market Value")),
        "state_of_residence": _state_code(_pick(found, "Property Address")),
        "owns_home": True,
        "rents_home": False,
        "has_real_property": True,
    }


def _auto(texts: list[str]) -> dict:
    found = _pairs(texts)
    balance = _money(_pick(found, "Remaining Balance", "Payoff Balance", "Loan Balance"))
    row = {
        "_kind": "auto",
        "actual_vehicle_loan_lease": _money(_pick(found, "Monthly Payment")),
        "vehicle_loan_balances": [balance],
        "vehicle_loan_balance_total": balance,
        "vehicle_count": 1,
    }
    if "Est. Market Value" in found:
        value = _money(found["Est. Market Value"])
        row["vehicle_market_values"] = [value]
        row["vehicle_market_value_total"] = value
    return row


def _health(texts: list[str]) -> dict:
    found = _pairs(texts)
    return {
        "_kind": "health",
        "actual_health_insurance_premiums": _money(_pick(found, "Monthly Premium", "Premium")),
    }


def _combine_autos(statements: list[dict]) -> dict:
    balances: list[float] = []
    values: list[float] = []
    payment = Decimal(0)
    for item in statements:
        payment += Decimal(str(item["actual_vehicle_loan_lease"]))
        balances.extend(item["vehicle_loan_balances"])
        values.extend(item.get("vehicle_market_values") or [])
    row = {
        "actual_vehicle_loan_lease": float(payment),
        "vehicle_loan_balances": balances,
        "vehicle_loan_balance_total": float(sum((Decimal(str(value)) for value in balances), Decimal(0))),
        "vehicle_count": len(statements),
    }
    if values:
        row["vehicle_market_values"] = values
        row["vehicle_market_value_total"] = float(sum((Decimal(str(value)) for value in values), Decimal(0)))
    return row


def _bank_statement(texts: list[str], rows: dict) -> dict:
    header_y, header = next(
        (y, cells) for y, cells in rows.items() if {text for _, text in cells} >= {"Withdrawals", "Deposits"}
    )
    columns = {text: x for x, text in header if text in {"Date", "Description", "Withdrawals", "Deposits", "Balance"}}
    deposits = []
    for y, cells in rows.items():
        if y >= header_y:
            continue
        buckets: dict[str, list[str]] = {name: [] for name in columns}
        for x, text in cells:
            nearest = min(columns, key=lambda name: abs(columns[name] - x))
            buckets[nearest].append(text)
        description = " ".join(buckets["Description"]).strip()
        if description:
            for amount in buckets["Deposits"]:
                if "$" in amount:
                    deposits.append((description, _money(amount)))
    ending = next(text for text in texts if text.startswith("Ending Balance:"))
    period = next(text for text in texts if re.fullmatch(r"\d{2}/\d{2}/\d{4} - \d{2}/\d{2}/\d{4}", text.strip()))
    account = _pairs(texts)["Account Number"]
    return {
        "_account": account,
        "_period_end": _date(period.split(" - ")[1]),
        "_deposits": deposits,
        "ending_balance": _money(ending.split(":")[-1]),
    }


def _combine_banks(statements: list[dict], employer: str | None) -> dict:
    latest: dict[str, dict] = {}
    for statement in statements:
        current = latest.get(statement["_account"])
        if current is None or statement["_period_end"] > current["_period_end"]:
            latest[statement["_account"]] = statement
    row = {
        "cash_and_bank_balances": float(sum(Decimal(str(item["ending_balance"])) for item in latest.values())),
    }
    # No employer name means we cannot tell payroll from a stranger. Leave the
    # flag unknown instead of storing a false zero.
    if not employer:
        return row
    unexplained = Decimal(0)
    months = {statement["_period_end"].strftime("%Y-%m") for statement in statements}
    for statement in statements:
        for description, amount in statement["_deposits"]:
            if not _same_payer(description, employer):
                unexplained += Decimal(str(amount))
    monthly = (unexplained / Decimal(len(months))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    row["has_unexplained_deposits"] = unexplained > 0
    row["unexplained_deposits_monthly"] = float(monthly)
    return row


def _same_payer(description: str, employer: str) -> bool:
    desc = " ".join(description.lower().split())
    emp = " ".join(employer.lower().split())
    named = desc.split(" - ", 1)[1] if " - " in desc else desc
    return emp in desc or desc in emp or emp.startswith(named) or named.startswith(emp)


def _page_text(data: bytes) -> tuple[list[str], dict]:
    texts: list[str] = []
    rows: dict[float, list[tuple[float, str]]] = {}
    for match in re.finditer(rb"stream\r?\n", data):
        body = data[match.end():data.find(b"endstream", match.end())].strip(b"\r\n")
        try:
            if body.endswith(b"~>"):
                body = base64.a85decode(body, adobe=True)
            if body.startswith(b"\x78"):
                body = zlib.decompress(body)
        except (zlib.error, ValueError):
            continue
        for found in re.finditer(rb"\(((?:\\.|[^)])*)\)\s*Tj", body):
            text = _unescape(found.group(1).decode("latin1")).strip()
            if text:
                texts.append(text)
        # Bank columns are the draws that put x y straight on Tm. Other lines
        # move the cursor with Td first; their order in `texts` is enough.
        for found in re.finditer(rb"([\d.]+) ([\d.]+) Tm \(((?:\\.|[^)])*)\) Tj", body):
            text = _unescape(found.group(3).decode("latin1")).strip()
            if text:
                rows.setdefault(float(found.group(2)), []).append((float(found.group(1)), text))
    return texts, rows


def _unescape(raw: str) -> str:
    def replace(match: re.Match) -> str:
        token = match.group(1)
        if token[0] in "01234567":
            return chr(int(token, 8))
        return {"n": "\n", "r": "\r", "t": "\t", "(": "(", ")": ")", "\\": "\\"}.get(token, token)

    return re.sub(r"\\([0-7]{1,3}|.)", replace, raw)


def _pairs(texts: list[str]) -> dict[str, str]:
    found = {}
    for index, text in enumerate(texts[:-1]):
        if text.endswith(":"):
            found[text[:-1].strip()] = texts[index + 1].strip()
    return found


def _require(found: dict[str, str], *labels: str) -> dict[str, str]:
    missing = [label for label in labels if label not in found]
    if missing:
        raise ValueError(f"Missing {', '.join(missing)}")
    return found


def _pick(found: dict[str, str], *labels: str) -> str:
    for label in labels:
        if label in found:
            return found[label]
    raise ValueError(f"Missing {labels[0]}")


def _next_money(texts: list[str], start: int) -> float:
    for text in texts[start + 1:start + 6]:
        if "$" in text:
            return _money(text)
    raise ValueError(f"No amount after {texts[start]!r}")


def _first_labeled(texts: list[str], *labels: str) -> float:
    for label in labels:
        for index, text in enumerate(texts):
            if text == label:
                return _next_money(texts, index)
    raise ValueError(f"Missing {labels[0]}")


def _labeled_amount(texts: list[str], label: str) -> Decimal:
    """Missing withholding lines are zero. A present line with no amount still fails."""
    for index, text in enumerate(texts):
        if text == label:
            return Decimal(str(_next_money(texts, index)))
    return Decimal(0)


def _money(value: str) -> float:
    match = _MONEY.search(value)
    if not match:
        raise ValueError(f"No dollar amount in {value!r}")
    return float(Decimal(match.group(0).replace("$", "").replace(",", "")))


def _to_monthly(amount: Decimal, frequency: str) -> float:
    monthly = (amount * Decimal(_PAY_PERIODS[frequency])) / Decimal(12)
    return float(monthly.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _date(value: str):
    for fmt in ("%m/%d/%Y", "%m-%d-%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Bad date {value!r}")


def _months_between(start, end) -> int:
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return months


def _state_code(address: str) -> str:
    match = re.search(r"\b([A-Z]{2})\s+\d{5}\b", address)
    if not match:
        raise ValueError(f"No state in {address!r}")
    return match.group(1)
