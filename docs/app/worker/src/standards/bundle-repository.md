# `app/worker/src/standards/bundle-repository.ts`

A synchronous `StandardsRepository` (the engine interface in `app/worker/src/engine/standards.ts`) built over the single JSON object that the `standards_bundle()` RPC returns (migration 0008, D-11). The Worker fetches the bundle once per evaluation. The engine's six lookups are then answered from memory, so the pure engine never performs I/O.

It is strict on purpose (T-07-18). A lookup throws `StandardsLookupError` when it asks for inputs other than the ones the bundle was fetched for, or when the bundle's value is `null` (no IRS row). It never falls back to a default amount, so the engine cannot use a standard meant for a different household, vehicle count, county or age.

| Part | What it does |
|------|--------------|
| `StandardsBundle` | The shape `standards_bundle()` returns. It carries the four inputs (`state`, `county`, `household_size`, `vehicle_count`) and seven values: `national`, `health_under_65`, `health_65_plus`, `transportation_area`, `ownership`, `operating`, `housing`. Any value is `null` when the database has no row for it. |
| `AMOUNTS` | The six numeric value keys checked by the guard. |
| `isStandardsBundle` | Boundary guard for the untyped RPC result. It accepts only an object with string `state` and `county`, integer `household_size` and `vehicle_count`, a string or null `transportation_area`, and finite numbers or null for every amount. |
| `BundleStandardsRepository` | The repository. The constructor keeps the bundle. |
| `pick` | Returns the value when the arguments match and the value is not null. Otherwise it throws `StandardsLookupError("No <description> found for supplied values.")`, which is the same wording as Python's `PostgresStandardsRepository._one`. |
| `place` | Exact match of the state and county strings, as the engine passes them from the row. |
| `nationalAmount(householdSize)` | `national`. Household size must match. |
| `healthCareAmount(age)` | Age 30 returns `health_under_65` and age 65 returns `health_65_plus`. These are the only two ages the engine asks for (`determination.ts` step 2). Any other age throws. |
| `transportationArea(state, county)` | `transportation_area`. State and county must match. With 0 vehicles the engine never asks, and the bundle holds `''`. |
| `transportationOwnershipAmount(vehicleCount)` | `ownership`. Vehicle count must match. |
| `transportationOperatingAmount(area, vehicleCount)` | `operating`. The area must equal `transportation_area` and the vehicle count must match. A 0-vehicle bundle therefore answers `('', 0)`. |
| `housingAmount(state, county, householdSize)` | `housing`. State, county and household size must all match. |

## Tests

- `app/worker/src/standards/bundle-repository.test.ts` (unit): each mismatch, a null value, and the matching calls.
- `app/worker/test/financials-api.test.ts` (live): the evaluation route uses it against the real bundle.
