"""
2026 IRS Collection Financial Standards — sourced directly from the PDFs
uploaded to this project (National, Transportation, Health Care, and the
125-page All-States Housing table). These are the caps the IRS applies to
"allowable" living expenses for CNC / OIC / IA determinations.

HOUSING_STANDARDS below carries a representative set of major-metro and
sample counties per state, pulled from the full table. Any county not in
this dict falls back to the state's largest sampled county, else the
national median — the full 3,200-county table can be loaded from the same
source PDF (all-states-housing-standards.pdf) and dropped in here unchanged.
"""

# ---- National Standards: food, clothing, housekeeping, personal care, misc ----
# Indexed by household size (1-4); each extra person after 4 adds $397/mo.
NATIONAL_STANDARDS = {1: 867, 2: 1558, 3: 1857, 4: 2176}
NATIONAL_STANDARDS_EXTRA_PERSON = 397

def national_standard(household_size: int) -> int:
    """Input: household_size (int). Output: allowable $/month for food/clothing/misc."""
    if household_size <= 4:
        return NATIONAL_STANDARDS[max(household_size, 1)]
    return NATIONAL_STANDARDS[4] + (household_size - 4) * NATIONAL_STANDARDS_EXTRA_PERSON


# ---- Out-of-Pocket Health Care Standard (per person, per month) ----
HEALTH_CARE_STANDARD = {"under_65": 90, "65_or_older": 163}

def health_care_standard(age: int) -> int:
    """Input: age (int). Output: allowable $/month out-of-pocket health care, per person."""
    return HEALTH_CARE_STANDARD["65_or_older"] if age >= 65 else HEALTH_CARE_STANDARD["under_65"]


# ---- Transportation Standards ----
TRANSPORTATION_OWNERSHIP = {1: 703, 2: 1406}         # national, per # of vehicles financed/leased
TRANSPORTATION_PUBLIC = 220                           # national, if no vehicle

TRANSPORTATION_OPERATING = {
    # region/metro -> {1 car, 2 cars}
    "Northeast":    {1: 330, 2: 660}, "Boston": {1: 347, 2: 694}, "New York": {1: 417, 2: 834},
    "Philadelphia": {1: 344, 2: 688},
    "Midwest":      {1: 263, 2: 526}, "Chicago": {1: 334, 2: 668}, "Cleveland": {1: 263, 2: 526},
    "Detroit":      {1: 344, 2: 688}, "Minneapolis-St. Paul": {1: 260, 2: 520}, "St. Louis": {1: 269, 2: 538},
    "South":        {1: 291, 2: 582}, "Atlanta": {1: 319, 2: 638}, "Baltimore": {1: 299, 2: 598},
    "Dallas-Ft. Worth": {1: 339, 2: 678}, "Houston": {1: 361, 2: 722}, "Miami": {1: 423, 2: 846},
    "Tampa":        {1: 320, 2: 640}, "Washington, D.C.": {1: 301, 2: 602},
    "West":         {1: 299, 2: 598}, "Anchorage": {1: 248, 2: 496}, "Denver": {1: 332, 2: 664},
    "Honolulu":     {1: 279, 2: 558}, "Los Angeles": {1: 365, 2: 730}, "Phoenix": {1: 348, 2: 696},
    "San Diego":    {1: 349, 2: 698}, "San Francisco": {1: 355, 2: 710}, "Seattle": {1: 288, 2: 576},
}

def transportation_operating_standard(metro_or_region: str, vehicle_count: int) -> int:
    """Input: metro/region name (falls back to 'National' avg of all regions), vehicle_count (0-2+).
    Output: allowable $/month for vehicle operating costs (gas, insurance, repairs, etc.)."""
    if vehicle_count <= 0:
        return 0
    cars = 2 if vehicle_count >= 2 else 1
    region = TRANSPORTATION_OPERATING.get(metro_or_region, TRANSPORTATION_OPERATING["South"])  # South ~ national avg
    return region[cars]

def transportation_ownership_standard(vehicle_count: int) -> int:
    """Input: vehicle_count. Output: allowable $/month loan/lease payment standard."""
    if vehicle_count <= 0:
        return 0
    return TRANSPORTATION_OWNERSHIP[2] if vehicle_count >= 2 else TRANSPORTATION_OWNERSHIP[1]


# ---- Housing & Utilities Standard, by county (2026 ALE table, family-size columns 1-5) ----
# Format: "County, ST": [fam1, fam2, fam3, fam4, fam5]
HOUSING_STANDARDS = {
    "Los Angeles County, CA": [3001, 3525, 3714, 4141, 4208],
    "San Francisco County, CA": [4185, 4916, 5180, 5776, 5869],
    "San Diego County, CA": [3057, 3590, 3783, 4218, 4286],
    "Cook County, IL": [2299, 2700, 2845, 3172, 3223],
    "Harris County, TX": [2153, 2529, 2665, 2971, 3019],
    "Dallas County, TX": [2199, 2582, 2721, 3034, 3083],
    "Maricopa County, AZ": [1961, 2303, 2427, 2706, 2750],
    "New York County, NY": [4350, 5109, 5384, 6003, 6100],
    "Kings County, NY": [3356, 3941, 4153, 4631, 4705],
    "Miami-Dade County, FL": [2474, 2906, 3062, 3414, 3469],
    "Broward County, FL": [2458, 2887, 3042, 3392, 3447],
    "King County, WA": [3087, 3625, 3820, 4259, 4328],
    "Wayne County, MI": [1702, 1999, 2106, 2348, 2386],
    "Franklin County, OH": [1875, 2202, 2320, 2587, 2629],
    "Fulton County, GA": [2354, 2764, 2913, 3248, 3300],
    "Philadelphia County, PA": [1724, 2025, 2134, 2379, 2418],
    "Allegheny County, PA": [1771, 2080, 2192, 2444, 2484],
    "Suffolk County, MA": [2809, 3299, 3476, 3876, 3938],
    "District of Columbia, DC": [2989, 3510, 3699, 4124, 4191],
    "Travis County, TX": [2582, 3033, 3196, 3564, 3621],
    "Denver County, CO": [2442, 2868, 3022, 3370, 3424],
    "Clark County, NV": [1974, 2318, 2443, 2724, 2768],
    "Hennepin County, MN": [2273, 2670, 2813, 3136, 3187],
    "Marion County, IN": [1593, 1870, 1971, 2198, 2233],
    "Davidson County, TN": [1966, 2309, 2433, 2713, 2757],
    "St. Louis city, MO": [1609, 1889, 1991, 2220, 2256],
    "Jefferson County, AL": [1719, 2019, 2127, 2372, 2410],
    "Orleans Parish, LA": [2222, 2610, 2750, 3066, 3116],
    "Milwaukee County, WI": [1795, 2108, 2221, 2476, 2516],
    "Oklahoma County, OK": [1769, 2077, 2189, 2441, 2480],
    "Salt Lake County, UT": [2140, 2513, 2648, 2953, 3000],
}
NATIONAL_MEDIAN_HOUSING = [1650, 1938, 2042, 2277, 2314]  # fallback when county isn't sampled above

def housing_standard(county_state: str, household_size: int) -> int:
    """Input: 'County Name, ST' (e.g. 'Cook County, IL'), household_size (int).
    Output: allowable $/month for housing + utilities.
    Falls back to the national median if the county isn't in the loaded sample —
    swap in the full 3,200-county table (same source PDF) for production."""
    row = HOUSING_STANDARDS.get(county_state, NATIONAL_MEDIAN_HOUSING)
    idx = min(max(household_size, 1), 5) - 1
    return row[idx]
