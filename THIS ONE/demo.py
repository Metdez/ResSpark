"""
Worked mock scenarios — the "upload documents -> AI populates 433-A -> hard
logic picks the resolution path" flow from the Herberth call, using fake
transcript/bank-statement data instead of real client documents.

Run:  python demo.py
"""

from financial_data import FinancialData
from determination import determine_resolution_path, calculate_allowable_expenses


def print_result(name, fd):
    result = determine_resolution_path(fd)
    expenses = calculate_allowable_expenses(fd)
    print(f"\n{'=' * 70}\nSCENARIO: {name}\n{'=' * 70}")
    print(f"Owed: ${fd.total_tax_owed:,.0f}  |  County: {fd.county_of_residence}, {fd.state_of_residence}")
    print(f"Gross monthly income:      ${result.monthly_income:,.2f}")
    print(f"Allowable monthly expenses: ${result.monthly_expenses:,.2f}")
    for k, v in expenses.items():
        if k != "total":
            print(f"    - {k:30s} ${v:,.2f}")
    print(f"Net Disposable Income:     ${result.net_disposable_income:,.2f}")
    print(f"Net Realizable Equity:     ${result.net_realizable_equity:,.2f}")
    print(f"\n>>> RESOLUTION PATH: {result.path}")
    print(f">>> WHY: {result.reason}")
    print(f">>> SUGGESTED OFFER / PAYMENT: ${result.suggested_offer_or_payment:,.2f}")
    if result.needs_manual_review:
        print(f">>> FLAGGED FOR MANUAL CPA/EA REVIEW: {result.review_notes}")


# --- Scenario 1: the exact example from the Herberth call — owes $60k, no assets ---
cnc_case = FinancialData(
    filing_status_married=False, household_size=1, age_taxpayer=34,
    state_of_residence="TX", county_of_residence="Harris County",
    is_wage_earner=True, gross_wages_taxpayer=2600,
    rents_home=True, actual_housing_utilities=1400,
    vehicle_count=1, actual_vehicle_loan_lease=350, actual_vehicle_operating=300,
    actual_health_insurance_premiums=180, actual_current_taxes=310,
    cash_and_bank_balances=600,
    all_returns_filed=True, total_tax_owed=60000, csed_months_remaining=96,
)

# --- Scenario 2: positive but modest income, big balance, no assets -> OIC ---
oic_case = FinancialData(
    filing_status_married=True, filing_joint_offer=True, household_size=3,
    age_taxpayer=41, age_spouse=39,
    state_of_residence="OH", county_of_residence="Franklin County",
    is_wage_earner=True, gross_wages_taxpayer=3400, gross_wages_spouse=1200,
    owns_home=True, actual_housing_utilities=1900,
    vehicle_count=2, actual_vehicle_loan_lease=520, actual_vehicle_operating=450,
    actual_health_insurance_premiums=310, actual_current_taxes=520,
    actual_child_dependent_care=400,
    cash_and_bank_balances=2200,
    real_property_market_value=180000, real_property_loan_balance=172000,
    vehicle_market_value_total=24000, vehicle_loan_balance_total=19000,
    all_returns_filed=True, total_tax_owed=42000, csed_months_remaining=84,
)

# --- Scenario 3: smaller balance, good income -> Streamlined IA ---
ia_case = FinancialData(
    filing_status_married=False, household_size=2, age_taxpayer=52,
    state_of_residence="FL", county_of_residence="Miami-Dade County",
    is_wage_earner=True, gross_wages_taxpayer=6800,
    owns_home=True, actual_housing_utilities=2200,
    vehicle_count=1, actual_vehicle_loan_lease=0, actual_vehicle_operating=350,
    actual_health_insurance_premiums=260, actual_current_taxes=980,
    cash_and_bank_balances=4000,
    all_returns_filed=True, total_tax_owed=28000, csed_months_remaining=90,
)

if __name__ == "__main__":
    print_result("Wage earner, no assets, owes $60,000 (from the Herberth call)", cnc_case)
    print_result("Married, modest income, big balance, some home equity", oic_case)
    print_result("Single, strong income, moderate balance", ia_case)
