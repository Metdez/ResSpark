"""
Hard-coded IRS resolution-path logic. No LLM judgment here — every number
traces back to Form 433-A (OIC) line-item formulas (asset haircuts, the
$1,000 bank reserve, the $3,450 vehicle equity exemption, the $11,980
personal-effects deduction) and to published IRS collection policy
(Guaranteed IA / Streamlined IA / PPIA / CNC thresholds).

Pipeline:  FinancialData --> calculate_income() --> calculate_allowable_expenses()
           --> calculate_net_disposable_income() --> calculate_net_realizable_equity()
           --> determine_resolution_path()  ==>  Determination
"""

from dataclasses import dataclass, field
from financial_data import FinancialData
import standards


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
def calculate_allowable_expenses(fd: FinancialData) -> dict:
    """Input: FinancialData. Output: dict of each allowed category + 'total'."""
    county_key = f"{fd.county_of_residence}, {fd.state_of_residence}"
    persons_65_or_older = sum(1 for age in (fd.age_taxpayer, fd.age_spouse) if age >= 65)
    persons_under_65 = fd.household_size - persons_65_or_older

    allowed = {
        "food_clothing_misc": standards.national_standard(fd.household_size),               # always standard
        "housing_utilities": min(fd.actual_housing_utilities,
                                  standards.housing_standard(county_key, fd.household_size)),
        "vehicle_ownership": min(fd.actual_vehicle_loan_lease,
                                  standards.transportation_ownership_standard(fd.vehicle_count)),
        "vehicle_operating": min(fd.actual_vehicle_operating,
                                  standards.transportation_operating_standard("South", fd.vehicle_count)),
        "public_transportation": fd.actual_public_transportation if fd.vehicle_count == 0 else 0,
        "health_insurance_premiums": fd.actual_health_insurance_premiums,                    # actual, always allowed
        "out_of_pocket_health_care": (
            persons_under_65 * standards.health_care_standard(30)
            + persons_65_or_older * standards.health_care_standard(65)
        ),                                                                                    # always standard
        "court_ordered_payments": fd.actual_court_ordered_payments,                          # actual, always allowed
        "child_dependent_care": fd.actual_child_dependent_care,                              # actual, always allowed
        "life_insurance_premiums": fd.actual_life_insurance_premiums,                        # actual, always allowed
        "current_taxes": fd.actual_current_taxes,                                            # actual, always allowed
        "delinquent_state_local_tax": fd.actual_delinquent_state_local_tax,                  # actual, always allowed
        "secured_debts_other": fd.actual_secured_debts_other,                                # actual, always allowed
    }
    allowed["total"] = sum(v for k, v in allowed.items() if k != "total")
    return allowed


# ---------------------------------------------------------------------------
# STEP 3 — Net Disposable (Remaining) Monthly Income  (Box F)
# ---------------------------------------------------------------------------
def calculate_net_disposable_income(fd: FinancialData) -> float:
    """Input: FinancialData. Output: gross income minus allowable expenses (Box F)."""
    return calculate_gross_monthly_income(fd) - calculate_allowable_expenses(fd)["total"]


# ---------------------------------------------------------------------------
# STEP 4 — Net Realizable Equity in assets (Box A + Box B on 433-A(OIC))
# Formulas transcribed exactly from Form 433-A (OIC), Section 3.
# ---------------------------------------------------------------------------
def calculate_net_realizable_equity(fd: FinancialData) -> float:
    """Input: FinancialData. Output: total quick-sale equity in assets (Box A)."""
    cash = max(fd.cash_and_bank_balances - 1000, 0)                                    # line (1): minus $1,000 reserve
    investments = max(fd.investment_accounts_net, 0)                                    # line (2)
    retirement = max(fd.retirement_accounts_market_value * 0.8
                      - fd.retirement_accounts_loan_balance, 0)                         # line (3): x.8 minus loan
    life_insurance = max(fd.life_insurance_cash_value - fd.life_insurance_loan_balance, 0)  # line (4)
    real_property = max(fd.real_property_market_value * 0.8
                         - fd.real_property_loan_balance, 0)                            # line (5): x.8 minus loan
    vehicles_raw = max(fd.vehicle_market_value_total * 0.8
                        - fd.vehicle_loan_balance_total, 0)
    vehicle_exemption = 3450 * (2 if fd.filing_joint_offer else 1)                       # line (6): $3,450/vehicle exemption
    vehicles = max(vehicles_raw - vehicle_exemption, 0)
    other_assets = max(fd.other_valuable_assets_value * 0.8
                        - fd.other_valuable_assets_loan - 11980, 0)                      # line (7): x.8 minus $11,980 deduction

    return cash + investments + retirement + life_insurance + real_property + vehicles + other_assets


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
    if fd.has_unexplained_deposits and fd.unexplained_deposits_monthly >= 200:
        reasons.append(f"Unexplained deposits averaging ${fd.unexplained_deposits_monthly:,.0f}/mo need a source before filing.")
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


def determine_resolution_path(fd: FinancialData) -> Determination:
    """Input: FinancialData. Output: Determination (the resolution path + the math behind it).
    This is the one function the CPA/EA reviews before anything is filed."""

    gross_income = calculate_gross_monthly_income(fd)
    expenses = calculate_allowable_expenses(fd)["total"]
    ndi = gross_income - expenses          # Net Disposable Income (monthly)
    nre = calculate_net_realizable_equity(fd)   # Net Realizable Equity (assets)

    ok, gate_reasons = passes_compliance_gate(fd)
    if not ok:
        return Determination(
            path="BLOCKED — Compliance gate failed",
            reason="; ".join(gate_reasons),
            monthly_income=gross_income, monthly_expenses=expenses,
            net_disposable_income=ndi, net_realizable_equity=nre,
            suggested_offer_or_payment=0.0, needs_manual_review=True,
            review_notes=gate_reasons,
        )

    ndi = max(ndi, 0)  # never let a negative disposable income turn into a negative payment

    # --- Currently Not Collectible: no income left over, no meaningful assets ---
    if ndi <= 0 and nre <= 500:
        return Determination(
            path="Currently Not Collectible (CNC / Status 53)",
            reason="Allowable expenses consume all income and there is no meaningful equity to liquidate.",
            monthly_income=gross_income, monthly_expenses=expenses,
            net_disposable_income=ndi, net_realizable_equity=nre,
            suggested_offer_or_payment=0.0,
        )

    # --- Negative income but real equity exists: judgment call, don't auto-decide ---
    if ndi <= 0 and nre > 500:
        return Determination(
            path="MANUAL REVIEW — negative income, meaningful equity present",
            reason="No monthly disposable income, but realizable equity exceeds $500. "
                   "Decide whether to pursue a lump-sum OIC funded by that equity or hardship CNC.",
            monthly_income=gross_income, monthly_expenses=expenses,
            net_disposable_income=ndi, net_realizable_equity=nre,
            suggested_offer_or_payment=nre, needs_manual_review=True,
            review_notes=["Equity-funded OIC vs. CNC judgment call — see IRM 5.8.5."],
        )

    # --- Positive disposable income: figure out how fast the balance pays off ---
    months_to_pay_at_ndi = fd.total_tax_owed / ndi if ndi > 0 else float("inf")

    # Guaranteed Installment Agreement: small balance, pays off fast, clean history
    if (fd.total_tax_owed <= 10_000 and months_to_pay_at_ndi <= 36
            and not fd.prior_ia_or_oic_default):
        payment = fd.total_tax_owed / 36
        return Determination(
            path="Guaranteed Installment Agreement",
            reason="Balance is $10,000 or less and pays in full within 36 months (IRC §6159(c)).",
            monthly_income=gross_income, monthly_expenses=expenses,
            net_disposable_income=ndi, net_realizable_equity=nre,
            suggested_offer_or_payment=round(payment, 2),
        )

    # Streamlined Installment Agreement: bigger balance but still pays off reasonably
    if (fd.total_tax_owed <= 50_000 and months_to_pay_at_ndi <= 72
            and fd.csed_months_remaining >= 72):
        payment = fd.total_tax_owed / 72
        return Determination(
            path="Streamlined Installment Agreement",
            reason="Balance is $50,000 or less and pays in full within 72 months, before the collection statute expires.",
            monthly_income=gross_income, monthly_expenses=expenses,
            net_disposable_income=ndi, net_realizable_equity=nre,
            suggested_offer_or_payment=round(payment, 2),
        )

    # Offer in Compromise: compare Reasonable Collection Potential (RCP) to the balance owed
    rcp_lump_sum = nre + (ndi * 12)          # paid within 5 months
    rcp_periodic = nre + (ndi * 24)          # paid over 6-24 months
    best_rcp = min(rcp_lump_sum, rcp_periodic)
    if best_rcp < fd.total_tax_owed:
        return Determination(
            path="Offer in Compromise (Doubt as to Collectibility)",
            reason=f"Reasonable Collection Potential (${best_rcp:,.0f}) is less than the balance owed "
                   f"(${fd.total_tax_owed:,.0f}) — full payment isn't realistic within the collection window.",
            monthly_income=gross_income, monthly_expenses=expenses,
            net_disposable_income=ndi, net_realizable_equity=nre,
            suggested_offer_or_payment=round(best_rcp, 2),
        )

    # Fallback: positive income, doesn't fit Guaranteed/Streamlined terms, RCP >= balance
    # -> Partial Payment Installment Agreement at full disposable income.
    return Determination(
        path="Partial Payment Installment Agreement (PPIA)",
        reason="Positive disposable income, but the balance can't be paid in full within "
               "Guaranteed/Streamlined terms. Payment set at full disposable income; "
               "subject to periodic financial re-review (IRM 5.14.2).",
        monthly_income=gross_income, monthly_expenses=expenses,
        net_disposable_income=ndi, net_realizable_equity=nre,
        suggested_offer_or_payment=round(ndi, 2),
    )
