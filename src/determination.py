"""
Hard-coded IRS resolution-path logic. No LLM judgment here — every number
traces back to Form 433-A (OIC) line-item formulas (asset haircuts, the
$1,000 bank reserve, the $3,450 vehicle equity exemption, the $11,980
personal-effects deduction) and to published IRS collection policy
(Simple Payment Plan / CNC thresholds).

Pipeline:  FinancialData --> calculate_income() --> calculate_allowable_expenses()
           --> calculate_net_disposable_income() --> calculate_net_realizable_equity()
           --> determine_resolution_path()  ==>  Determination
"""

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
import math
from financial_data import FinancialData
import standards
from standards_repository import StandardsRepository


# ---------------------------------------------------------------------------
# STEP 1 — Gross monthly income (Form 433-A(OIC) Section 7, Box D)
# ---------------------------------------------------------------------------
def calculate_gross_monthly_income(fd: FinancialData) -> float:
    """Input: FinancialData. Output: total monthly household income (Box D)."""
    return (
        fd.gross_wages_taxpayer + fd.gross_wages_spouse + fd.social_security_income
        + fd.pension_income + fd.other_income + fd.interest_dividends_royalties
        + fd.distributions_income + fd.net_rental_income + fd.net_business_income
        + fd.child_support_received + fd.alimony_received
    )


# ---------------------------------------------------------------------------
# STEP 2 — Allowable expenses = lesser of (actual, IRS standard) per category,
# except food/clothing/misc and health care, which are ALWAYS the standard.
# ---------------------------------------------------------------------------
def calculate_allowable_expenses(
    fd: FinancialData, standards_repository: StandardsRepository, trace: list | None = None
) -> dict:
    """Input: FinancialData. Output: dict of each allowed category + 'total'."""
    persons_65_or_older = sum(1 for age in (fd.age_taxpayer, fd.age_spouse) if age >= 65)
    persons_under_65 = fd.household_size - persons_65_or_older
    transportation_area = (
        standards.transportation_area(standards_repository, fd.state_of_residence, fd.county_of_residence)
        if fd.vehicle_count else ""
    )
    food_standard = standards.national_standard(standards_repository, fd.household_size)
    housing_standard = standards.housing_standard(
        standards_repository, fd.state_of_residence, fd.county_of_residence, fd.household_size
    )
    ownership_standard = standards.transportation_ownership_standard(
        standards_repository, fd.vehicle_count
    )
    operating_standard = standards.transportation_operating_standard(
        standards_repository, transportation_area, fd.vehicle_count
    )
    health_standard = (
        persons_under_65 * standards.health_care_standard(standards_repository, 30)
        + persons_65_or_older * standards.health_care_standard(standards_repository, 65)
    )

    allowed = {
        "food_clothing_misc": food_standard,  # always standard
        "housing_utilities": min(fd.actual_housing_utilities, housing_standard),
        "vehicle_ownership": min(fd.actual_vehicle_loan_lease, ownership_standard),
        "vehicle_operating": min(fd.actual_vehicle_operating, operating_standard),
        "public_transportation": fd.actual_public_transportation if fd.vehicle_count == 0 else 0,
        "health_insurance_premiums": fd.actual_health_insurance_premiums,                    # actual, always allowed
        "out_of_pocket_health_care": health_standard,                                       # always standard
        "court_ordered_payments": fd.actual_court_ordered_payments,                          # actual, always allowed
        "child_dependent_care": fd.actual_child_dependent_care,                              # actual, always allowed
        "life_insurance_premiums": fd.actual_life_insurance_premiums,                        # actual, always allowed
        "current_taxes": fd.actual_current_taxes,                                            # actual, always allowed
        "delinquent_state_local_tax": fd.actual_delinquent_state_local_tax,                  # actual, always allowed
        "secured_debts_other": fd.actual_secured_debts_other,                                # actual, always allowed
    }
    allowed["total"] = sum(v for k, v in allowed.items() if k != "total")
    if trace is not None:
        capped = (
            ("Housing and utilities", "actual_housing_utilities", fd.actual_housing_utilities, housing_standard, "Lesser of actual cost and the IRS local standard", "housing_utilities"),
            ("Vehicle ownership", "actual_vehicle_loan_lease", fd.actual_vehicle_loan_lease, ownership_standard, "Lesser of actual payment and the IRS ownership standard", "vehicle_ownership"),
            ("Vehicle operating", "actual_vehicle_operating", fd.actual_vehicle_operating, operating_standard, "Lesser of actual cost and the IRS operating standard", "vehicle_operating"),
        )
        trace.append(_step(
            "Food, clothing, and miscellaneous", "IRS national standard", allowed["food_clothing_misc"],
            [("IRS standard", food_standard)], ["household_size"],
        ))
        for label, key, actual, standard, formula, allowed_key in capped:
            trace.append(_step(
                label, formula, allowed[allowed_key],
                [("Actual", actual), ("IRS standard", standard)], [key],
            ))
        actual_only = (
            ("Public transportation", "actual_public_transportation", "public_transportation"),
            ("Health insurance premiums", "actual_health_insurance_premiums", "health_insurance_premiums"),
            ("Court-ordered payments", "actual_court_ordered_payments", "court_ordered_payments"),
            ("Child and dependent care", "actual_child_dependent_care", "child_dependent_care"),
            ("Life insurance premiums", "actual_life_insurance_premiums", "life_insurance_premiums"),
            ("Current taxes", "actual_current_taxes", "current_taxes"),
            ("Delinquent state or local tax", "actual_delinquent_state_local_tax", "delinquent_state_local_tax"),
            ("Other secured debts", "actual_secured_debts_other", "secured_debts_other"),
        )
        for label, key, allowed_key in actual_only:
            trace.append(_step(
                label,
                "Actual allowed amount" if key != "actual_public_transportation" else "Actual amount when no vehicle is owned",
                allowed[allowed_key], [("Actual", getattr(fd, key))], [key],
            ))
        trace.insert(5, _step(
            "Out-of-pocket health care", "IRS health-care standard by household age", health_standard,
            [("People under 65", persons_under_65), ("People 65 or older", persons_65_or_older)],
            ["household_size", "age_taxpayer", "age_spouse"], "currency",
        ))
    return allowed


# ---------------------------------------------------------------------------
# STEP 3 — Net Disposable (Remaining) Monthly Income  (Box F)
# ---------------------------------------------------------------------------
def calculate_net_disposable_income(
    fd: FinancialData, standards_repository: StandardsRepository
) -> float:
    """Input: FinancialData. Output: gross income minus allowable expenses (Box F)."""
    return calculate_gross_monthly_income(fd) - calculate_allowable_expenses(fd, standards_repository)["total"]


# ---------------------------------------------------------------------------
# STEP 4 — Net Realizable Equity in assets (Box A + Box B on 433-A(OIC))
# Formulas transcribed exactly from Form 433-A (OIC), Section 3.
# ---------------------------------------------------------------------------
def calculate_net_realizable_equity(fd: FinancialData, trace: list | None = None) -> float:
    """Input: FinancialData. Output: total quick-sale equity in assets (Box A)."""
    cash = max(fd.cash_and_bank_balances - 1000, 0)                                    # line (1): minus $1,000 reserve
    investments = max(fd.investment_accounts_net, 0)                                    # line (2)
    retirement = max(fd.retirement_accounts_market_value * 0.8
                      - fd.retirement_accounts_loan_balance, 0)                         # line (3): x.8 minus loan
    life_insurance = max(fd.life_insurance_cash_value - fd.life_insurance_loan_balance, 0)  # line (4)
    real_property = max(fd.real_property_market_value * 0.8
                         - fd.real_property_loan_balance, 0)                            # line (5): x.8 minus loan
    vehicle_steps = []
    if fd.vehicle_market_values:
        vehicles = 0
        for index, market_value in enumerate(fd.vehicle_market_values):
            loan = fd.vehicle_loan_balances[index] if index < len(fd.vehicle_loan_balances) else 0
            equity = max(market_value * 0.8 - loan, 0)
            exemption = 0
            if index == 0 or (index == 1 and fd.filing_joint_offer):
                exemption = 3450
                equity = max(equity - 3450, 0)                                            # lines 6a and 6c
            vehicles += equity
            vehicle_steps.append(_step(
                f"Vehicle {index + 1}", "max(80% market value - loan - exemption, $0)", equity,
                [("Market value", market_value), ("Loan", loan), ("Exemption", exemption)],
                ["vehicle_market_values", "vehicle_loan_balances", "filing_joint_offer"],
            ))
    else:
        vehicles_raw = max(fd.vehicle_market_value_total * 0.8
                            - fd.vehicle_loan_balance_total, 0)
        exempt_vehicles = min(fd.vehicle_count, 2 if fd.filing_joint_offer else 1)
        vehicles = max(vehicles_raw - 3450 * exempt_vehicles, 0)                           # legacy totals
        vehicle_steps.append(_step(
            "Vehicles", "max(80% total market value - loans - vehicle exemptions, $0)", vehicles,
            [("Market value", fd.vehicle_market_value_total), ("Loans", fd.vehicle_loan_balance_total),
             ("Exemptions", 3450 * exempt_vehicles)],
            ["vehicle_market_value_total", "vehicle_loan_balance_total", "vehicle_count", "filing_joint_offer"],
        ))
    other_assets = max(fd.other_valuable_assets_value * 0.8
                        - fd.other_valuable_assets_loan - 11980, 0)                      # line (7): x.8 minus $11,980 deduction

    total = cash + investments + retirement + life_insurance + real_property + vehicles + other_assets
    if trace is not None:
        trace.extend([
            _step("Cash and bank accounts", "max(balance - $1,000 reserve, $0)", cash,
                  [("Balance", fd.cash_and_bank_balances), ("Reserve", 1000)], ["cash_and_bank_balances"]),
            _step("Investments", "max(net account value, $0)", investments,
                  [("Net value", fd.investment_accounts_net)], ["investment_accounts_net"]),
            _step("Retirement accounts", "max(80% market value - loans, $0)", retirement,
                  [("Market value", fd.retirement_accounts_market_value),
                   ("Loans", fd.retirement_accounts_loan_balance)],
                  ["retirement_accounts_market_value", "retirement_accounts_loan_balance"]),
            _step("Life insurance", "max(cash value - policy loans, $0)", life_insurance,
                  [("Cash value", fd.life_insurance_cash_value), ("Loans", fd.life_insurance_loan_balance)],
                  ["life_insurance_cash_value", "life_insurance_loan_balance"]),
            _step("Real property", "max(80% market value - loans, $0)", real_property,
                  [("Market value", fd.real_property_market_value), ("Loans", fd.real_property_loan_balance)],
                  ["real_property_market_value", "real_property_loan_balance"]),
            *vehicle_steps,
            _step("Other valuable assets", "max(80% value - loans - $11,980 deduction, $0)", other_assets,
                  [("Value", fd.other_valuable_assets_value), ("Loans", fd.other_valuable_assets_loan),
                   ("Deduction", 11980)], ["other_valuable_assets_value", "other_valuable_assets_loan"]),
        ])
    return total


# ---------------------------------------------------------------------------
# STEP 5 — Compliance gate: must pass before any resolution path is offered.
# ---------------------------------------------------------------------------
def passes_compliance_gate(fd: FinancialData) -> tuple:
    """Input: FinancialData. Output: (passes: bool, reasons: list[str])."""
    reasons = []
    if not fd.all_returns_filed:
        reasons.append("Not all required tax returns are filed.")
    if fd.in_open_bankruptcy:
        reasons.append("Currently in an open bankruptcy proceeding.")
    return (len(reasons) == 0, reasons)


# ---------------------------------------------------------------------------
# STEP 6 — Decision tree.
# ---------------------------------------------------------------------------
@dataclass
class Determination:
    path: str
    reason: str
    monthly_income: float
    monthly_expenses: float
    net_disposable_income: float
    net_realizable_equity: float
    suggested_offer_or_payment: float
    needs_manual_review: bool = False
    review_notes: list = field(default_factory=list)
    calculation_trace: list = field(default_factory=list)


_INCOME_LINES = (
    ("Taxpayer wages", "gross_wages_taxpayer"),
    ("Spouse wages", "gross_wages_spouse"),
    ("Social Security", "social_security_income"),
    ("Pension income", "pension_income"),
    ("Other income", "other_income"),
    ("Interest, dividends, and royalties", "interest_dividends_royalties"),
    ("Distributions", "distributions_income"),
    ("Net rental income", "net_rental_income"),
    ("Net business income", "net_business_income"),
    ("Child support received", "child_support_received"),
    ("Alimony received", "alimony_received"),
)


def _step(label, formula, result, inputs, input_keys=None, result_format="currency", status=None):
    step = {
        "label": label,
        "formula": formula,
        "inputs": [{"label": name, "value": value} for name, value in inputs],
        "inputKeys": input_keys or [],
        "result": result,
        "format": result_format,
    }
    if status:
        step["status"] = status
    return step


def _check(label: str, detail: str, status: str) -> dict:
    return {
        "label": label,
        "formula": detail,
        "inputs": [],
        "inputKeys": [],
        "result": status.replace("_", " ").title(),
        "format": "text",
        "status": status,
    }


def _trace(fd, gross_income, expenses, raw_ndi, displayed_ndi, nre, expense_steps, equity_steps, checks):
    income_steps = [
        _step(label, "Monthly Form 433-A income line", getattr(fd, key), [("Amount", getattr(fd, key))], [key])
        for label, key in _INCOME_LINES
    ]
    income_steps.append(_step(
        "Total monthly household income", "Sum of all monthly income lines", gross_income,
        [("Income total", gross_income)], [key for _label, key in _INCOME_LINES],
    ))
    expense_steps.append(_step(
        "Total allowable monthly expenses", "Sum of all allowed expense categories", expenses,
        [("Expense total", expenses)],
    ))
    equity_steps.append(_step(
        "Net realizable equity", "Sum of realizable equity across assets", nre,
        [("Equity total", nre)],
    ))
    disposable_formula = "Monthly income - allowable expenses"
    if displayed_ndi != raw_ndi:
        disposable_formula += "; negative amounts are treated as $0 for path selection"
    return [
        {"id": "income", "title": "Monthly household income", "description": "Form 433-A (OIC), Section 7, Box D.", "steps": income_steps},
        {"id": "expenses", "title": "Allowable monthly expenses", "description": "Actual costs, IRS standards, and the allowed amount used.", "steps": expense_steps},
        {"id": "disposable", "title": "Net disposable income", "description": "Monthly amount remaining after allowable expenses.", "steps": [
            _step("Net disposable income", disposable_formula, displayed_ndi,
                  [("Income", gross_income), ("Expenses", expenses)], [], "currency")
        ]},
        {"id": "equity", "title": "Net realizable equity", "description": "Quick-sale values, loans, reserves, and exemptions.", "steps": equity_steps},
        {"id": "decision", "title": "Resolution decision checks", "description": "The deterministic gates evaluated in order.", "steps": checks},
    ]


def determine_resolution_path(
    fd: FinancialData, standards_repository: StandardsRepository
) -> Determination:
    """Input: FinancialData. Output: Determination (the resolution path + the math behind it).
    This is the one function the CPA/EA reviews before anything is filed."""

    expense_steps: list[dict] = []
    equity_steps: list[dict] = []
    gross_income = calculate_gross_monthly_income(fd)
    expenses = calculate_allowable_expenses(fd, standards_repository, expense_steps)["total"]
    raw_ndi = gross_income - expenses
    nre = calculate_net_realizable_equity(fd, equity_steps)
    ok, gate_reasons = passes_compliance_gate(fd)
    ndi = raw_ndi if not ok else max(raw_ndi, 0)

    csed_months = max(fd.csed_months_remaining, 1)
    csed_payment = math.ceil((fd.total_tax_owed / csed_months) * 100) / 100
    lump_sum = _whole_dollars(nre + max(raw_ndi, 0) * 12)
    periodic = _whole_dollars(nre + max(raw_ndi, 0) * 24)

    simple_match = (
        fd.csed_months_remaining > 0
        and fd.total_tax_owed <= 50_000
        and ndi >= csed_payment
    )
    full_pay_match = fd.csed_months_remaining > 0 and ndi >= csed_payment
    if not ok:
        selected = 0
    elif ndi <= 0 and nre <= 500:
        selected = 1
    elif ndi <= 0 and nre > 500:
        selected = 2
    elif simple_match:
        selected = 3
    elif full_pay_match:
        selected = 4
    elif 0 < lump_sum < fd.total_tax_owed:
        selected = 5
    else:
        selected = 6

    check_details = (
        ("Compliance gate", "All required returns are filed and no open bankruptcy blocks collection resolution."),
        ("Currently Not Collectible", f"Disposable income is $0 or less and realizable equity is $500 or less (income ${ndi:,.2f}; equity ${nre:,.2f})."),
        ("Equity review", f"Disposable income is $0 or less while realizable equity exceeds $500 (equity ${nre:,.2f})."),
        ("Simple Payment Plan", f"Balance is $50,000 or less and ${csed_payment:,.2f} per month full-pays it by the CSED."),
        ("Non-Simple Installment Agreement", f"${csed_payment:,.2f} per month full-pays the balance by the CSED."),
        ("Offer in Compromise", f"Equity plus 12 months of remaining income is ${lump_sum:,.0f}, below the ${fd.total_tax_owed:,.2f} balance."),
        ("Manual payment review", "No automatic path matched the available facts."),
    )
    checks = []
    for index, (label, detail) in enumerate(check_details):
        if index > selected:
            status = "not_evaluated"
        elif index == selected:
            status = "matched"
        elif index == 0:
            status = "pass"
        else:
            status = "fail"
        checks.append(_check(label, detail, status))

    def result(path, reason, suggested, manual=False, notes=None):
        calculation_trace = _trace(
            fd, gross_income, expenses, raw_ndi, ndi, nre,
            list(expense_steps), list(equity_steps), checks,
        )
        calculation_trace.insert(4, {
            "id": "resolution_amounts",
            "title": "Resolution amount calculations",
            "description": "Full-pay and Form 656-B offer amounts used by the decision tree.",
            "steps": [
                _step(
                    "Full-pay monthly requirement", "Round total balance / CSED months up to the next cent",
                    csed_payment, [("Total balance", fd.total_tax_owed), ("CSED months", csed_months)],
                    ["total_tax_owed", "csed_months_remaining"],
                ),
                _step(
                    "Lump-sum OIC minimum", "Whole dollars: equity + 12 months of remaining income",
                    float(lump_sum), [("Equity", nre), ("Monthly remaining income", max(raw_ndi, 0)),
                                      ("Months", 12)],
                    ["total_tax_owed"],
                ),
                _step(
                    "Periodic-payment OIC minimum", "Whole dollars: equity + 24 months of remaining income",
                    float(periodic), [("Equity", nre), ("Monthly remaining income", max(raw_ndi, 0)),
                                     ("Months", 24)],
                    ["total_tax_owed"],
                ),
                _step(
                    "Selected offer or payment", "Amount returned by the matched resolution path",
                    suggested, [("Selected amount", suggested)], [], "currency",
                ),
            ],
        })
        return Determination(
            path=path,
            reason=reason,
            monthly_income=gross_income,
            monthly_expenses=expenses,
            net_disposable_income=ndi,
            net_realizable_equity=nre,
            suggested_offer_or_payment=suggested,
            needs_manual_review=manual,
            review_notes=notes or [],
            calculation_trace=calculation_trace,
        )

    if selected == 0:
        return result(
            "BLOCKED — Compliance gate failed", "; ".join(gate_reasons), 0.0, True, gate_reasons,
        )
    if selected == 1:
        return result(
            "Currently Not Collectible (CNC / Status 53)",
            "Allowable expenses consume all income and there is no meaningful equity to liquidate.",
            0.0,
        )
    if selected == 2:
        return result(
            "MANUAL REVIEW — negative income, meaningful equity present",
            "No monthly disposable income, but realizable equity exceeds $500. "
            "Decide whether to pursue a lump-sum OIC funded by that equity or hardship CNC.",
            nre, True, ["Equity-funded OIC vs. CNC judgment call — see IRM 5.8.5."],
        )
    if selected == 3:
        return result(
            "Simple Payment Plan",
            "Full balance is $50,000 or less and the proposed payment pays it by the CSED.",
            csed_payment,
        )
    if selected == 4:
        return result(
            "Non-Simple Installment Agreement",
            "The full balance can be paid by the CSED, but the case does not meet the simpler plan rules.",
            csed_payment,
        )
    if selected == 5:
        return result(
            "Offer in Compromise",
            "The balance cannot be full-paid by the collection deadline. "
            "The IRS lump-sum minimum offer is equity plus 12 months of remaining income.",
            float(lump_sum), False, [f"The 6-to-24-month minimum offer is ${periodic:,.0f}."],
        )
    return result(
        "MANUAL REVIEW — payment resolution needs review",
        "The available data does not support an automatic payment-resolution selection.",
        0.0, True,
    )


def _whole_dollars(amount: float) -> int:
    return int(Decimal(str(amount)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
