"""Turn the example-packet PDFs into case_financial_data columns.

ponytail: reads ReportLab text-show operators. Bank columns use the x y on `Tm`;
every other field is read in draw order. A scanned PDF or another generator
needs poppler (`pdftotext -layout`) instead.
Pay stubs and unmatched W-2s sum into taxpayer wages. Auto loan statements sum.
ponytail: a second earner is included in gross_wages_taxpayer. gross_wages_spouse
stays unset; a spouse marker on the upload would split that line.
Housing is the labeled rent or PITI. A utility upload is added on top; a PITI
figure that already includes utilities is not detected.
ponytail: a second P&L replaces net business income. The same business on a
Schedule C and a profit-and-loss is not added twice.
Gross pay is Regular Gross Pay, or Gross Pay when that is the line on the stub.
ponytail: a failed parse can ask Sciforium for the columns that document type
owns. Empty extracted text is not recovered (no OCR). A scan still fails.
"""

from __future__ import annotations

import base64
import json
import os
import re
import urllib.request
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
    "lease": "lease",
    "lease_statement": "lease",
    "rent": "lease",
    "mortgage_statement": "mortgage",
    "auto_loan_statement": "auto",
    "vehicle": "auto",
    "health_insurance_statement": "health",
    "housing_utilities": "utility",
    "self_employment": "business",
    "retirement": "retirement",
    "insurance": "life",
    "investments": "investment",
    "bankruptcy": "bankruptcy",
}
_ACCOUNT_FIELDS = (
    "filing_status_married", "state_of_residence", "total_tax_owed",
    "tax_only_balance", "csed_months_remaining",
)
_KIND_FIELDS = {
    "account": _ACCOUNT_FIELDS,
    "wage": ("gross_wages_taxpayer",),
    "pay_stub": ("pay_frequency", "gross_wages_taxpayer", "actual_current_taxes", "is_wage_earner"),
    "bank": ("cash_and_bank_balances",),
    "lease": ("actual_housing_utilities", "state_of_residence", "rents_home", "owns_home"),
    "mortgage": (
        "actual_housing_utilities", "real_property_loan_balance", "real_property_market_value",
        "state_of_residence", "owns_home", "rents_home", "has_real_property",
    ),
    "auto": (
        "actual_vehicle_loan_lease", "vehicle_loan_balances", "vehicle_loan_balance_total",
        "vehicle_market_values", "vehicle_market_value_total", "vehicle_count",
    ),
    "health": ("actual_health_insurance_premiums",),
    "utility": ("actual_housing_utilities",),
    "business": ("net_business_income",),
    "retirement": ("retirement_accounts_market_value", "retirement_accounts_loan_balance"),
    "life": ("life_insurance_cash_value", "life_insurance_loan_balance"),
    "investment": ("investment_accounts_net",),
    "valuation": ("real_property_market_value", "has_real_property"),
}
# A statement can be handled without a value estimate. Both keys are required if either is present.
# A loan balance on retirement or life insurance may be omitted when the statement has none.
_OPTIONAL_TOGETHER = {
    "auto": ("vehicle_market_values", "vehicle_market_value_total"),
    "retirement": ("retirement_accounts_loan_balance",),
    "life": ("life_insurance_loan_balance",),
}
# That upload slot holds an account transcript, a wage transcript, or both.
_IRS_FIELDS = _ACCOUNT_FIELDS + _KIND_FIELDS["wage"]
_FIELD_TYPES = {
    "filing_status_married": "bool", "owns_home": "bool", "rents_home": "bool",
    "is_wage_earner": "bool", "has_real_property": "bool",
    "csed_months_remaining": "int", "vehicle_count": "int",
    "state_of_residence": "str", "pay_frequency": "str",
    "vehicle_loan_balances": "float_list", "vehicle_market_values": "float_list",
}
_CHAT_URL = "https://api.sciforium.com/v1/chat/completions"
_TEXT_LIMIT = 12_000


def parse_packet(directory: Path | str) -> dict:
    """Read every PDF in a client packet and return one case-column dict."""
    parts = [parse_pdf(path) for path in sorted(Path(directory).glob("*.pdf"))]
    return merge_documents(parts)


def merge_documents(parts: list[dict]) -> dict:
    """Combine parsed documents. Repeating stubs, W-2s, health, and auto files add up."""
    row: dict = {}
    banks, autos, stubs, wages, healths = [], [], [], [], []
    utilities, retirements, lives, investments = [], [], [], []
    for part in parts:
        kind = part.pop("_kind")
        if kind == "bank":
            banks.append(part)
        elif kind == "auto":
            autos.append(part)
        elif kind == "pay_stub":
            stubs.append(part)
        elif kind == "wage":
            wages.append(part)
        elif kind == "health":
            healths.append(part)
        elif kind == "utility":
            utilities.append(part)
        elif kind == "retirement":
            retirements.append(part)
        elif kind == "life":
            lives.append(part)
        elif kind == "investment":
            investments.append(part)
        elif kind == "bankruptcy":
            row.setdefault("ai_flags", []).append(
                "Bankruptcy documents were uploaded and need professional review."
            )
        else:
            row.update(part)
    employers = _apply_income(row, stubs, wages)
    if healths:
        row["actual_health_insurance_premiums"] = _sum_amounts(healths, "actual_health_insurance_premiums")
    if utilities:
        base = Decimal(str(row.get("actual_housing_utilities") or 0))
        row["actual_housing_utilities"] = float(base + Decimal(str(_sum_amounts(utilities, "actual_housing_utilities"))))
    if retirements:
        row["retirement_accounts_market_value"] = _sum_amounts(retirements, "retirement_accounts_market_value")
        _sum_present(row, retirements, "retirement_accounts_loan_balance")
    if lives:
        row["life_insurance_cash_value"] = _sum_amounts(lives, "life_insurance_cash_value")
        _sum_present(row, lives, "life_insurance_loan_balance")
    if investments:
        row["investment_accounts_net"] = _sum_amounts(investments, "investment_accounts_net")
    if banks:
        row.update(_combine_banks(banks, employers))
    if autos:
        row.update(_combine_autos(autos))
    return row


def _sum_amounts(items: list[dict], key: str) -> float:
    return float(sum((Decimal(str(item[key])) for item in items if key in item), Decimal(0)))


def _sum_present(row: dict, items: list[dict], key: str) -> None:
    if any(key in item for item in items):
        row[key] = _sum_amounts(items, key)


def _apply_income(row: dict, stubs: list[dict], wages: list[dict]) -> list[str]:
    employers = [stub["_employer"] for stub in stubs if stub.get("_employer")]
    if not stubs and not wages:
        return employers
    gross = sum((Decimal(str(stub["gross_wages_taxpayer"])) for stub in stubs), Decimal(0))
    taxes = sum((Decimal(str(stub.get("actual_current_taxes") or 0)) for stub in stubs), Decimal(0))
    for wage in wages:
        employer = wage.get("_employer")
        if _covered_by_stub(employer, employers):
            continue
        gross += Decimal(str(wage["gross_wages_taxpayer"]))
        if employer:
            employers.append(employer)
    row["gross_wages_taxpayer"] = float(gross)
    if stubs:
        row["actual_current_taxes"] = float(taxes)
        frequencies = {stub["pay_frequency"] for stub in stubs if stub.get("pay_frequency")}
        if len(frequencies) == 1:
            row["pay_frequency"] = next(iter(frequencies))
        if any(stub.get("is_wage_earner") is True for stub in stubs):
            row["is_wage_earner"] = True
    return employers


def _covered_by_stub(employer: str | None, employers: list[str]) -> bool:
    if not employers:
        return False
    if not employer:
        return True
    return any(_same_payer(employer, known) or _same_payer(known, employer) for known in employers)


def parse_pdf(path: Path | str, document_type: str | None = None) -> dict:
    """Parse one PDF. `_kind` says which template matched."""
    texts, rows = _page_text(Path(path).read_bytes())
    return _parse_document(texts, rows, document_type, str(path))


def parse_texts(texts: list[str], rows: dict | None = None, document_type: str | None = None) -> dict:
    """Parse document text already pulled out of a PDF."""
    return _parse_document(texts, rows or {}, document_type, "document")


def _parse_document(texts: list[str], rows: dict, document_type: str | None, label: str) -> dict:
    kind = _classify(texts, document_type)
    try:
        if not kind:
            raise ValueError(f"No template matched {label}")
        return _from_kind(kind, texts, rows)
    except ValueError as error:
        fields = _fields_for(kind, document_type)
        blob = "\n".join(texts).strip()
        if not fields or not blob:
            raise
        try:
            filled = _llm_fill(blob, fields)
        except Exception as api_error:
            raise error from api_error
        complete = _complete_document(kind, document_type, filled)
        if complete is None:
            raise error
        return complete


def _fields_for(kind: str | None, document_type: str | None) -> tuple[str, ...] | None:
    if kind:
        return _KIND_FIELDS[kind]
    if document_type == "irs_transcripts":
        return _IRS_FIELDS
    hinted = _TYPE_HINTS.get(document_type or "")
    return _KIND_FIELDS[hinted] if hinted else None


def _complete_document(kind: str | None, document_type: str | None, filled: dict) -> dict | None:
    """Accept a fallback only when every required column for that document is present."""
    if document_type == "irs_transcripts" and not kind:
        account_ok = all(key in filled for key in _ACCOUNT_FIELDS)
        wage_ok = "gross_wages_taxpayer" in filled
        if not account_ok and not wage_ok:
            return None
        kept = {}
        if account_ok:
            kept.update({key: filled[key] for key in _ACCOUNT_FIELDS})
        if wage_ok:
            kept["gross_wages_taxpayer"] = filled["gross_wages_taxpayer"]
        return {"_kind": "account" if account_ok else "wage", **kept}
    if not kind:
        return None
    allowed = _KIND_FIELDS[kind]
    optional = _OPTIONAL_TOGETHER.get(kind, ())
    if any(key not in filled for key in allowed if key not in optional):
        return None
    if any(key in filled for key in optional) and any(key not in filled for key in optional):
        return None
    return {"_kind": kind, **{key: filled[key] for key in allowed if key in filled}}


def _llm_fill(text: str, fields: tuple[str, ...]) -> dict:
    _load_env()
    key = os.environ.get("SCIFORIUM_API_KEY")
    model = os.environ.get("SCIFORIUM_API_ENDPOINT")
    if not key or not model:
        raise RuntimeError("SCIFORIUM_API_KEY and SCIFORIUM_API_ENDPOINT are required")
    listed = ", ".join(fields)
    prompt = (
        "Return one JSON object and nothing else. Use only these case_financial_data keys: "
        f"{listed}. Every key is required, except vehicle_market_values and "
        "vehicle_market_value_total, which must both be present or both omitted. "
        "gross_wages_taxpayer is monthly dollars. cash_and_bank_balances is this "
        "statement's ending balance. pay_frequency is weekly, biweekly, semimonthly, or monthly. "
        "If the document does not state every required value, return {}. Do not add keys."
    )
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": text[:_TEXT_LIMIT]},
        ],
    }).encode()
    request = urllib.request.Request(
        _CHAT_URL,
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    content = payload["choices"][0]["message"]["content"]
    return _accept_fields(_json_object(content), fields)


def _load_env() -> None:
    if os.environ.get("SCIFORIUM_API_KEY") and os.environ.get("SCIFORIUM_API_ENDPOINT"):
        return
    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def _json_object(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Model did not return a JSON object")
    found = json.loads(text[start:end + 1])
    if not isinstance(found, dict):
        raise ValueError("Model did not return a JSON object")
    return found


def _accept_fields(payload: dict, allowed: tuple[str, ...]) -> dict:
    accepted = {}
    for key in allowed:
        if key not in payload or payload[key] is None:
            continue
        value = _coerce_field(key, payload[key])
        if value is not None:
            accepted[key] = value
    return accepted


def _coerce_field(key: str, value: object):
    kind = _FIELD_TYPES.get(key, "float")
    if kind == "bool":
        return value if isinstance(value, bool) else None
    if kind == "int":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        if isinstance(value, float) and not value.is_integer():
            return None
        return int(value)
    if kind == "str":
        if not isinstance(value, str) or not value.strip():
            return None
        if key == "pay_frequency":
            return _PAY_FREQUENCY.get(value.lower().replace("-", "").replace(" ", ""))
        return value.strip()
    if kind == "float_list":
        if not isinstance(value, list):
            return None
        numbers = []
        for item in value:
            if isinstance(item, bool) or not isinstance(item, (int, float)):
                return None
            numbers.append(float(item))
        return numbers
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _has(head: str, phrase: str) -> bool:
    return re.search(rf"\b{re.escape(phrase)}\b", head) is not None


def _classify(texts: list[str], document_type: str | None) -> str | None:
    head = " ".join(text.strip().lower() for text in texts[:12])
    if (_has(head, "wage") and _has(head, "income")) or _has(head, "wage and tax statement"):
        return "wage"
    if _has(head, "account transcript") or _has(head, "balance notice"):
        return "account"
    if _has(head, "life insurance"):
        return "life"
    if _has(head, "retirement"):
        return "retirement"
    if _has(head, "profit and loss") or _has(head, "schedule c"):
        return "business"
    if _has(head, "brokerage") or _has(head, "investment account"):
        return "investment"
    if _has(head, "bankruptcy"):
        return "bankruptcy"
    if _has(head, "checking") or _has(head, "bank statement") or _has(head, "account statement"):
        return "bank"
    if _has(head, "earnings statement") or _has(head, "pay stub") or _has(head, "paystub"):
        return "pay_stub"
    if _has(head, "rent") or _has(head, "lease"):
        return "lease"
    if _has(head, "mortgage") or _has(head, "heloc"):
        return "mortgage"
    if _has(head, "auto loan") or _has(head, "vehicle loan"):
        return "auto"
    if _has(head, "premium") or _has(head, "health insurance"):
        return "health"
    if document_type == "real_property":
        return "valuation"
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
    if kind == "utility":
        return _utility(texts)
    if kind == "business":
        return _business(texts)
    if kind == "retirement":
        return _retirement(texts)
    if kind == "life":
        return _life(texts)
    if kind == "investment":
        return _investment(texts)
    if kind == "valuation":
        return _valuation(texts)
    if kind == "bankruptcy":
        if not any(text.strip() for text in texts):
            raise ValueError("No template matched")
        return {"_kind": "bankruptcy"}
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
    if not any(label in found for label in ("Monthly Payment", "Remaining Balance", "Payoff Balance", "Loan Balance")):
        value = _money(_pick(found, "Est. Market Value", "Estimated Market Value", "Market Value"))
        return {
            "_kind": "auto",
            "vehicle_market_values": [value],
            "vehicle_market_value_total": value,
            "vehicle_count": 1,
        }
    balance = _money(_pick(found, "Remaining Balance", "Payoff Balance", "Loan Balance"))
    row = {
        "_kind": "auto",
        "actual_vehicle_loan_lease": _money(_pick(found, "Monthly Payment")),
        "vehicle_loan_balances": [balance],
        "vehicle_loan_balance_total": balance,
        "vehicle_count": 1,
    }
    value_label = next((label for label in ("Est. Market Value", "Estimated Market Value", "Market Value") if label in found), None)
    if value_label:
        value = _money(found[value_label])
        row["vehicle_market_values"] = [value]
        row["vehicle_market_value_total"] = value
    return row


def _health(texts: list[str]) -> dict:
    found = _pairs(texts)
    return {
        "_kind": "health",
        "actual_health_insurance_premiums": _money(_pick(found, "Monthly Premium", "Premium")),
    }


def _utility(texts: list[str]) -> dict:
    found = _pairs(texts)
    return {
        "_kind": "utility",
        "actual_housing_utilities": _money(_pick(found, "Amount Due", "Current Charges", "Total Due")),
    }


def _business(texts: list[str]) -> dict:
    found = _pairs(texts)
    return {
        "_kind": "business",
        "net_business_income": _money(_pick(found, "Net Income", "Net Profit")),
    }


def _retirement(texts: list[str]) -> dict:
    found = _pairs(texts)
    row = {
        "_kind": "retirement",
        "retirement_accounts_market_value": _money(_pick(found, "Market Value", "Account Value")),
    }
    if "Loan Balance" in found:
        row["retirement_accounts_loan_balance"] = _money(found["Loan Balance"])
    return row


def _life(texts: list[str]) -> dict:
    found = _pairs(texts)
    row = {
        "_kind": "life",
        "life_insurance_cash_value": _money(_pick(found, "Cash Value")),
    }
    if "Policy Loan" in found or "Loan Balance" in found:
        row["life_insurance_loan_balance"] = _money(_pick(found, "Policy Loan", "Loan Balance"))
    return row


def _investment(texts: list[str]) -> dict:
    found = _pairs(texts)
    return {
        "_kind": "investment",
        "investment_accounts_net": _money(_pick(found, "Net Value", "Account Value")),
    }


def _valuation(texts: list[str]) -> dict:
    found = _pairs(texts)
    return {
        "_kind": "valuation",
        "real_property_market_value": _money(_pick(found, "Assessed Value", "Estimated Market Value", "Market Value")),
        "has_real_property": True,
    }


def _combine_autos(statements: list[dict]) -> dict:
    # ponytail: a registration plus a valuation plus a loan is not three cars.
    # Value-only files fill vehicles that have no value yet, in order.
    loans = [item for item in statements if "vehicle_loan_balances" in item]
    extras = [item for item in statements if "vehicle_loan_balances" not in item]
    if not loans:
        values = _collected_values(extras)
        row = {
            "actual_vehicle_loan_lease": 0.0,
            "vehicle_loan_balances": [0.0] * len(extras),
            "vehicle_loan_balance_total": 0.0,
            "vehicle_count": len(extras),
        }
        if values:
            row["vehicle_market_values"] = values
            row["vehicle_market_value_total"] = float(sum((Decimal(str(value)) for value in values), Decimal(0)))
        return row
    balances: list[float] = []
    values: list[float] = []
    payment = Decimal(0)
    for item in loans:
        payment += Decimal(str(item["actual_vehicle_loan_lease"]))
        balances.extend(item["vehicle_loan_balances"])
        values.extend(item.get("vehicle_market_values") or [])
    row = {
        "actual_vehicle_loan_lease": float(payment),
        "vehicle_loan_balances": balances,
        "vehicle_loan_balance_total": float(sum((Decimal(str(value)) for value in balances), Decimal(0))),
        "vehicle_count": len(loans),
    }
    if not values:
        values = _collected_values(extras)[: len(loans)]
    if values:
        row["vehicle_market_values"] = values
        row["vehicle_market_value_total"] = float(sum((Decimal(str(value)) for value in values), Decimal(0)))
    return row


def _collected_values(items: list[dict]) -> list[float]:
    values: list[float] = []
    for item in items:
        values.extend(item.get("vehicle_market_values") or [])
    return values


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


def _statement_balance(item: dict) -> Decimal:
    if "ending_balance" in item:
        return Decimal(str(item["ending_balance"]))
    return Decimal(str(item["cash_and_bank_balances"]))


def _combine_banks(statements: list[dict], employers: list[str]) -> dict:
    latest: dict[str, dict] = {}
    loose = []
    for statement in statements:
        account = statement.get("_account")
        period = statement.get("_period_end")
        if account is None or period is None:
            loose.append(statement)
            continue
        current = latest.get(account)
        if current is None or period > current["_period_end"]:
            latest[account] = statement
    totals = [_statement_balance(item) for item in latest.values()]
    totals.extend(_statement_balance(item) for item in loose)
    row = {"cash_and_bank_balances": float(sum(totals, Decimal(0)))}
    # No employer name means we cannot tell payroll from a stranger. Leave the
    # flag unknown instead of storing a false zero.
    months = {statement["_period_end"].strftime("%Y-%m") for statement in statements if "_period_end" in statement}
    if not employers or not months:
        return row
    unexplained = Decimal(0)
    for statement in statements:
        for description, amount in statement.get("_deposits") or []:
            if not any(_same_payer(description, employer) for employer in employers):
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
