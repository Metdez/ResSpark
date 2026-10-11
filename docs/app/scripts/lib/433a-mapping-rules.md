# `app/scripts/lib/433a-mapping-rules.mjs`

The reviewed, hand-maintained rules that `app/scripts/build-433a-seed.mjs` turns into
`supabase/migrations/0009_433a_seed.sql`. Nothing at runtime imports this module: the Worker reads the
generated SQL rows (D-08). **USER ACTION:** a CPA/EA reviews these assignments before any real case.

## County rules (ADDR-02, D-12)

| Export | What it is |
|--------|------------|
| `COUNTY_OVERRIDES` | Six Census FIPS codes whose 2025 Gazetteer name does not normalize to the IRS housing row's name. The value is the IRS row's exact county text, checked against the live `housing_utilities_standards` on 2026-10-11. The generator fails if an override text is not a housing county of that state. |
| `USPS_EXTRA` | `PR → Puerto Rico`. `state_aliases` has `puerto rico` but no `pr`, and the IRS publishes Puerto Rico housing standards, so the map keeps its 78 municipios. The alias exists only in the generator; `state_aliases` is unchanged. |
| `CT_OLD_COUNTIES` | The eight Connecticut county FIPS from the Census 2020 county list (`codes2020/national_county2020.txt`). Connecticut replaced counties with nine planning regions in 2022 and the IRS standards use the regions. An old county does not map 1:1 to a region, so these rows have `county` NULL and the lookup shows "Needs data" instead of guessing. |
| `CT_OLD_NOTE` | The note stored on those eight rows. |

| FIPS | Census name | IRS text |
|------|-------------|----------|
| 02063 | Chugach Census Area | `Chugach Census Area, Alaska` |
| 02066 | Copper River Census Area | `Copper River Census Area, Alaska` |
| 17099 | LaSalle County | `La Salle County` |
| 22059 | LaSalle Parish | `La Salle Parish` |
| 35011 | De Baca County | `DeBaca County` |
| 35013 | Doña Ana County | `Dona Ana County` |

## How to change a rule

Edit this file, re-run the generator, and re-apply the seed (see the generator doc). Never edit the
generated SQL. Matching stays exact: add an override for a renamed county rather than loosening the
match.
