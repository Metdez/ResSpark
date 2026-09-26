"""Turn the example-packet PDFs into case_financial_data columns.

ponytail: reads ReportLab text-show operators. Bank columns use the x y on `Tm`;
every other field is read in draw order. A scanned PDF or another generator
needs poppler (`pdftotext -layout`) instead.
One earnings statement maps to the taxpayer. A second vehicle statement overwrites
the first. Housing is the labeled rent or PITI; bank utility lines are not added.
Only the Regular Gross Pay line is counted.
"""

from __future__ import annotations

import base64
import re
import zlib
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


_PAY_PERIODS = {"weekly": 52, "biweekly": 26, "semimonthly": 24, "monthly": 12}
_TAX_LINES = ("Federal Income Tax", "Social Security Tax", "Medicare Tax", "State Income Tax")
_MONEY = re.compile(r"\$[0-9,.-]+")


def parse_packet(directory: Path | str) -> dict:
    """Read every PDF in a client packet and return one case-column dict."""
    row: dict = {}
    banks = []
    employer = None
    wage_gross = None
    stub = None
    for path in sorted(Path(directory).glob("*.pdf")):
        part = parse_pdf(path)
        kind = part.pop("_kind")
        if kind == "bank":
            banks.append(part)
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
    return row


def parse_pdf(path: Path | str) -> dict:
    """Parse one example PDF. `_kind` says which template matched."""
    texts, rows = _page_text(Path(path).read_bytes())
    titles = {text.strip() for text in texts}
    if "Account Transcript" in titles:
        return {"_kind": "account", **_account_transcript(texts)}
    if "Wage & Income Transcript" in titles:
        return {"_kind": "wage", **_wage_transcript(texts)}
    if "Personal Checking Account Statement" in titles:
        return {"_kind": "bank", **_bank_statement(texts, rows)}
    if "Earnings Statement" in titles:
        return {"_kind": "pay_stub", **_pay_stub(texts)}
    if "Monthly Rent Statement" in titles:
        found = _require(_pairs(texts), "Monthly Rent", "Property Address")
        return {
            "_kind": "lease",
            "actual_housing_utilities": _money(found["Monthly Rent"]),
            "state_of_residence": _state_code(found["Property Address"]),
            "rents_home": True,
            "owns_home": False,
        }
    if "Monthly Mortgage Statement" in titles:
        found = _require(
            _pairs(texts),
            "Monthly Payment (PITI)",
            "Current Principal Balance",
            "Estimated Market Value",
            "Property Address",
        )
        return {
            "_kind": "mortgage",
            "actual_housing_utilities": _money(found["Monthly Payment (PITI)"]),
            "real_property_loan_balance": _money(found["Current Principal Balance"]),
            "real_property_market_value": _money(found["Estimated Market Value"]),
            "state_of_residence": _state_code(found["Property Address"]),
            "owns_home": True,
            "rents_home": False,
            "has_real_property": True,
        }
    if "Auto Loan Statement" in titles:
        found = _require(_pairs(texts), "Monthly Payment", "Remaining Balance")
        balance = _money(found["Remaining Balance"])
        row = {
            "_kind": "auto",
            "actual_vehicle_loan_lease": _money(found["Monthly Payment"]),
            "vehicle_loan_balances": [balance],
            "vehicle_loan_balance_total": balance,
            "vehicle_count": 1,
        }
        if "Est. Market Value" in found:
            value = _money(found["Est. Market Value"])
            row["vehicle_market_values"] = [value]
            row["vehicle_market_value_total"] = value
        return row
    if "Premium Billing Statement" in titles:
        found = _require(_pairs(texts), "Monthly Premium")
        return {
            "_kind": "health",
            "actual_health_insurance_premiums": _money(found["Monthly Premium"]),
        }
    raise ValueError(f"No template matched {path}")


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
    frequency = found["Pay Frequency"].lower().replace("-", "").replace(" ", "")
    if frequency not in _PAY_PERIODS:
        raise ValueError(f"Unknown pay frequency {found['Pay Frequency']}")
    gross = Decimal(str(_labeled_current(texts, "Regular Gross Pay")))
    taxes = sum(Decimal(str(_labeled_current(texts, label))) for label in _TAX_LINES)
    return {
        "_employer": texts[0].strip(),
        "pay_frequency": frequency,
        "gross_wages_taxpayer": _to_monthly(gross, frequency),
        "actual_current_taxes": _to_monthly(abs(taxes), frequency),
    }


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


def _next_money(texts: list[str], start: int) -> float:
    for text in texts[start + 1:start + 6]:
        if "$" in text:
            return _money(text)
    raise ValueError(f"No amount after {texts[start]!r}")


def _labeled_current(texts: list[str], label: str) -> float:
    for index, text in enumerate(texts):
        if text == label:
            return _next_money(texts, index)
    raise ValueError(f"Missing {label}")


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
