"""2026 IRS Collection Financial Standards, effective June 29, 2026."""

import csv
from functools import lru_cache
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent / "data"

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}


@lru_cache
def _read_csv(name: str) -> list:
    with open(DATA_DIR / name, encoding="utf-8") as file:
        return list(csv.DictReader(file))


def _state_name(state: str) -> str:
    state = state.strip()
    return STATE_NAMES.get(state.upper(), state)


def _clean_county(county: str) -> str:
    county = county.lower().strip()
    for suffix in (" county", " parish", " borough", " municipio", " census area", " city and borough"):
        if county.endswith(suffix):
            return county[:-len(suffix)]
    return county


# National Standards: food, clothing, housekeeping, personal care, misc.
NATIONAL_STANDARDS = {1: 867, 2: 1558, 3: 1857, 4: 2176}
NATIONAL_STANDARDS_EXTRA_PERSON = 397


def national_standard(household_size: int) -> int:
    if household_size <= 4:
        return NATIONAL_STANDARDS[max(household_size, 1)]
    return NATIONAL_STANDARDS[4] + (household_size - 4) * NATIONAL_STANDARDS_EXTRA_PERSON


# Out-of-pocket health care standard, per person per month.
HEALTH_CARE_STANDARD = {"under_65": 90, "65_or_older": 163}


def health_care_standard(age: int) -> int:
    return HEALTH_CARE_STANDARD["65_or_older"] if age >= 65 else HEALTH_CARE_STANDARD["under_65"]


# Transportation standards.
TRANSPORTATION_OWNERSHIP = {1: 703, 2: 1406}
TRANSPORTATION_PUBLIC = 220

TRANSPORTATION_OPERATING = {
    "Northeast": {1: 330, 2: 660}, "Boston": {1: 347, 2: 694},
    "New York": {1: 417, 2: 834}, "Philadelphia": {1: 344, 2: 688},
    "Midwest": {1: 263, 2: 526}, "Chicago": {1: 334, 2: 668},
    "Cleveland": {1: 263, 2: 526}, "Detroit": {1: 344, 2: 688},
    "Minneapolis-St. Paul": {1: 260, 2: 520}, "St. Louis": {1: 269, 2: 538},
    "South": {1: 291, 2: 582}, "Atlanta": {1: 319, 2: 638},
    "Baltimore": {1: 299, 2: 598}, "Dallas-Ft. Worth": {1: 339, 2: 678},
    "Houston": {1: 361, 2: 722}, "Miami": {1: 423, 2: 846},
    "Tampa": {1: 320, 2: 640}, "Washington, D.C.": {1: 301, 2: 602},
    "West": {1: 299, 2: 598}, "Anchorage": {1: 248, 2: 496},
    "Denver": {1: 332, 2: 664}, "Honolulu": {1: 279, 2: 558},
    "Los Angeles": {1: 365, 2: 730}, "Phoenix": {1: 348, 2: 696},
    "San Diego": {1: 349, 2: 698}, "San Francisco": {1: 355, 2: 710},
    "Seattle": {1: 288, 2: 576},
}


def transportation_area(state: str, county: str) -> str:
    """Return the listed metro area, or the taxpayer's Census region."""
    state = _state_name(state)
    county = _clean_county(county)
    for row in _read_csv("msa_counties.csv"):
        if row["state"].lower() == state.lower() and _clean_county(row["county"]) == county:
            return row["msa"]
    for row in _read_csv("state_regions.csv"):
        if row["state"].lower() == state.lower():
            return row["region"]
    raise ValueError(f"No transportation region found for {state}")


def transportation_operating_standard(area: str, vehicle_count: int) -> int:
    if vehicle_count <= 0:
        return 0
    cars = 2 if vehicle_count >= 2 else 1
    return TRANSPORTATION_OPERATING[area][cars]


def transportation_ownership_standard(vehicle_count: int) -> int:
    if vehicle_count <= 0:
        return 0
    return TRANSPORTATION_OWNERSHIP[2] if vehicle_count >= 2 else TRANSPORTATION_OWNERSHIP[1]


# Housing and utilities standard, by county.
def housing_standard(state: str, county: str, household_size: int) -> int:
    """Return the actual county standard; family sizes above five use the 5+ amount."""
    state = _state_name(state)
    county = _clean_county(county)
    column = f"family_{min(max(household_size, 1), 5)}"
    if column == "family_5":
        column = "family_5_plus"
    for row in _read_csv("housing_utilities_by_county.csv"):
        if row["state"].lower() == state.lower() and _clean_county(row["county"]) == county:
            return int(row[column])
    raise ValueError(f"No housing standard found for {county}, {state}")
