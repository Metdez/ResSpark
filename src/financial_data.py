"""
FinancialData — the structured output every uploaded document gets mapped into.
Field names mirror the actual line numbers on Form 433-A (OIC) (Rev. 4-2026)
so a completed FinancialData object can be dumped straight onto the form.

This is the single dataset the whole system runs on:
  documents (bank statements, transcripts, paystubs, mortgage/auto statements)
        --> AI extraction -->  FinancialData
  questionnaire answers ------>  FinancialData
FinancialData --> standards.py (allowable expense caps) --> determination.py (decision)
"""

from dataclasses import dataclass, field


@dataclass
class FinancialData:
    # ---- Household / profile ----
    filing_status_married: bool = False
    filing_joint_offer: bool = False
    state_of_residence: str = ""
    county_of_residence: str = ""
    household_size: int = 1
    dependents_count: int = 0
    age_taxpayer: int = 0
    age_spouse: int = 0
    owns_home: bool = False
    rents_home: bool = False
    is_wage_earner: bool = True
    is_self_employed: bool = False
    vehicle_count: int = 0

    # ---- Section 7, Box D: Monthly Household Income (lines 30-38) ----
    gross_wages_taxpayer: float = 0.0
    gross_wages_spouse: float = 0.0
    social_security_income: float = 0.0
    pension_income: float = 0.0
    other_income: float = 0.0             # unemployment, gig income, etc. (line 30/31 "other")
    interest_dividends_royalties: float = 0.0   # (33)
    distributions_income: float = 0.0            # (34) partnership/S-corp
    net_rental_income: float = 0.0               # (35)
    net_business_income: float = 0.0             # (36) = Box C from Section 6
    child_support_received: float = 0.0          # (37)
    alimony_received: float = 0.0                # (38)

    # ---- Section 7, Box E: Monthly Household Expenses (lines 39-51) ----
    # NOTE: (39) food/clothing/misc and (45) out-of-pocket health care are
    # ALWAYS the IRS standard amount (Section 7 note), never the actual spend.
    # Everything else is the ACTUAL amount, capped at the standard elsewhere
    # for CNC/OIC/IA math (see determination.py).
    actual_housing_utilities: float = 0.0         # (40)
    actual_vehicle_loan_lease: float = 0.0        # (41)
    actual_vehicle_operating: float = 0.0         # (42)
    actual_public_transportation: float = 0.0     # (43)
    actual_health_insurance_premiums: float = 0.0 # (44)
    actual_court_ordered_payments: float = 0.0    # (46)
    actual_child_dependent_care: float = 0.0      # (47)
    actual_life_insurance_premiums: float = 0.0   # (48)
    actual_current_taxes: float = 0.0             # (49) current-year fed/state withholding
    actual_delinquent_state_local_tax: float = 0.0# (51)
    actual_secured_debts_other: float = 0.0       # other secured loan payments

    # ---- Section 3: Personal Asset Information (lines 1-7) ----
    cash_and_bank_balances: float = 0.0           # sum of all accounts, pre-$1,000 reserve
    investment_accounts_net: float = 0.0          # (2) current value minus loans
    retirement_accounts_market_value: float = 0.0 # (3a) before the .8 haircut
    retirement_accounts_loan_balance: float = 0.0
    life_insurance_cash_value: float = 0.0        # (4) before loan
    life_insurance_loan_balance: float = 0.0
    real_property_market_value: float = 0.0       # (5) before .8 haircut, before mortgage
    real_property_loan_balance: float = 0.0
    vehicle_market_value_total: float = 0.0       # (6) sum across vehicles, before .8 haircut
    vehicle_loan_balance_total: float = 0.0
    vehicle_market_values: list = field(default_factory=list)  # preferred: one value per vehicle
    vehicle_loan_balances: list = field(default_factory=list)
    other_valuable_assets_value: float = 0.0      # (7) art/collections/business interest, before .8
    other_valuable_assets_loan: float = 0.0

    # ---- Section 9: Compliance / eligibility gates ----
    all_returns_filed: bool = True
    in_open_bankruptcy: bool = False
    filed_bankruptcy_past_7yrs: bool = False
    in_litigation: bool = False
    prior_ia_or_oic_default: bool = False
    filed_and_paid_timely_last_5_years: bool = False
    installment_agreement_last_5_years: bool = False

    # ---- Liability (from IRS account transcript) ----
    total_tax_owed: float = 0.0
    tax_only_balance: float | None = None        # excludes penalties and interest
    csed_months_remaining: int = 120              # 10-yr collection statute, default max
    oic_payment_months: int | None = None          # backend-only future OIC payment term

    # ---- Free-form notes for anything a human reviewer should see ----
    ai_flags: list = field(default_factory=list)  # e.g. "3 deposits from unknown source, avg $850/mo"
