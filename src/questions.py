"""Taxpayer-facing intake question declarations.

Each declaration has an id that maps to canonical case data, a plain-English
prompt, and its Python answer type. Answers are merged with information from
uploaded documents; documents provide financial values, while the taxpayer
provides facts that documents cannot reliably establish.
"""

QUESTIONS = [
    # --- Household (Form 433-A Section 1) ---
    {"id": "filing_status_married",        "prompt": "Are you married?",                                   "type": bool},
    {"id": "filing_joint_offer",           "prompt": "Are you filing jointly with your spouse?", "type": bool},
    {"id": "state_of_residence",           "prompt": "What state do you live in?",                          "type": str},
    {"id": "county_of_residence",          "prompt": "What county do you live in?",                         "type": str},
    {"id": "household_size",               "prompt": "How many people live in your household (incl. you)?", "type": int},
    {"id": "dependents_count",             "prompt": "How many dependents do you claim on your tax return?","type": int},
    {"id": "age_taxpayer",                 "prompt": "What is your age?",                                   "type": int},
    {"id": "age_spouse",                   "prompt": "What is your spouse's age (if married)?",              "type": int},

    # --- Housing ---
    {"id": "owns_home",                    "prompt": "Do you own your home?",                               "type": bool},
    {"id": "rents_home",                   "prompt": "Do you rent your home?",                               "type": bool},

    # --- Employment (Section 2) ---
    {"id": "is_wage_earner",               "prompt": "Do you receive a W-2 paycheck from an employer?",      "type": bool},
    {"id": "is_self_employed",             "prompt": "Are you self-employed (Schedule C/E/F)?",              "type": bool},
    {"id": "pay_frequency",                "prompt": "How often are you paid? (weekly/biweekly/semimonthly/monthly)", "type": str},

    # --- Vehicles / Assets context ---
    {"id": "vehicle_count",                "prompt": "How many vehicles do you own or lease?",               "type": int},
    {"id": "has_real_property",            "prompt": "Do you own any real estate (home, rental, land)?",     "type": bool},
    {"id": "has_retirement_accounts",      "prompt": "Do you have a 401(k), IRA, or other retirement account?", "type": bool},
    {"id": "has_life_insurance_cash_value","prompt": "Do you have life insurance with cash value?",          "type": bool},
    {"id": "has_investment_accounts",      "prompt": "Do you own stocks, bonds, or other investments?",      "type": bool},

    # --- Compliance / eligibility gates (Section 9) ---
    {"id": "all_returns_filed",            "prompt": "Have you filed all required tax returns?",             "type": bool},
    {"id": "in_open_bankruptcy",           "prompt": "Are you currently in an open bankruptcy proceeding?",  "type": bool},
    {"id": "filed_bankruptcy_past_7yrs",   "prompt": "Have you filed bankruptcy in the past 7 years?",       "type": bool},
    {"id": "in_litigation",                "prompt": "Are you currently a party to a lawsuit?",               "type": bool},
    {"id": "prior_ia_or_oic_default",      "prompt": "Have you defaulted on a prior IRS payment plan or offer?", "type": bool},
    {"id": "filed_and_paid_timely_last_5_years", "prompt": "For the last 5 tax years, did you file and pay the tax shown on time?", "type": bool},
    {"id": "installment_agreement_last_5_years", "prompt": "Have you had an income-tax installment agreement in the last 5 tax years?", "type": bool},
    # --- Liability facts (from IRS transcripts, confirmable) ---
    {"id": "total_tax_owed",               "prompt": "Total amount owed to the IRS (all years, incl. penalties/interest)?", "type": float},
    {"id": "tax_only_balance",              "prompt": "Income tax owed before penalties and interest?",                    "type": float},
    {"id": "csed_months_remaining",        "prompt": "Months remaining until the IRS collection statute expires (from transcript)?", "type": int},
]
