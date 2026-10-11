// Reviewed rules that build-433a-seed.mjs turns into supabase/migrations/0009_433a_seed.sql.
// USER ACTION: a CPA/EA reviews these assignments before any real case.

// Census 2025 Gazetteer names that differ from the IRS housing table's own text (07-RESEARCH § County Map).
// Each value is the exact county text of the live housing_utilities_standards row (checked 2026-10-11).
export const COUNTY_OVERRIDES = {
  "02063": "Chugach Census Area, Alaska", // IRS row carries the state name in the county text
  "02066": "Copper River Census Area, Alaska", // same
  "17099": "La Salle County", // Census "LaSalle County"
  "22059": "La Salle Parish", // Census "LaSalle Parish"
  "35011": "DeBaca County", // Census "De Baca County"
  "35013": "Dona Ana County", // Census "Doña Ana County"
};

// USPS codes with no two-letter row in public.state_aliases; the IRS publishes housing standards for them.
export const USPS_EXTRA = { PR: "Puerto Rico" };

// Old Connecticut counties from the Census 2020 county list (codes2020/national_county2020.txt).
// Census replaced them with planning regions 09110-09190 in 2022; they do not map 1:1, so they block.
export const CT_OLD_COUNTIES = {
  "09001": "Fairfield County",
  "09003": "Hartford County",
  "09005": "Litchfield County",
  "09007": "Middlesex County",
  "09009": "New Haven County",
  "09011": "New London County",
  "09013": "Tolland County",
  "09015": "Windham County",
};

export const CT_OLD_NOTE =
  "Connecticut replaced counties with planning regions in 2022; IRS standards use planning regions. Re-verify the address.";
