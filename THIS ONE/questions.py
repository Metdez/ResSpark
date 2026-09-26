"""
v2 — expanded per your request: every question needed to fill the 433-A,
its data type, feeding straight into FinancialData (financial_data.py).

INTAKE QUESTIONS — everything needed to populate Form 433-A / 433-A(OIC).
Each question: id (maps to a FinancialData field), the plain-English prompt
(Herberth's "make it simple" questionnaire), and the Python data type returned.

This is the client-facing questionnaire. Answers get merged with whatever the
AI extracts from uploaded documents (transcripts, bank statements, pay stubs,
mortgage/auto statements) — documents win on numbers, the questionnaire wins
on facts a document can't state (marital status, dependents, litigation).
"""

QUESTIONS = [
    # --- Household (Form 433-A Section 1) ---
    {"id": "filing_status_married",        "prompt": "Are you married?",                                   "type": bool},
    {"id": "filing_joint_offer",           "prompt": "If married, are you filing jointly with your spouse?", "type": bool},
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
    {"id": "transferred_asset_10k_10yrs",  "prompt": "In the last 10 years, did you transfer any asset worth over $10,000 for less than its value?", "type": bool},

    # --- Bank reconciliation flag (AI-detected, but confirmable by client) ---
    {"id": "has_unexplained_deposits",     "prompt": "Are there recurring deposits in your bank account not from your stated employer/income source?", "type": bool},

    # --- Liability facts (from IRS transcripts, confirmable) ---
    {"id": "total_tax_owed",               "prompt": "Total amount owed to the IRS (all years, incl. penalties/interest)?", "type": float},
    {"id": "csed_months_remaining",        "prompt": "Months remaining until the IRS collection statute expires (from transcript)?", "type": int},
]
