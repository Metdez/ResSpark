# `app/worker/src/engine/standards.ts`

Port of the standards contract: the `StandardsRepository` Protocol and `StandardsLookupError` from `src/standards_repository.py`, and the six facade functions from `src/standards.py`. No IRS amount lives in this file or anywhere in `engine/`; every value comes from the repository the caller injects.

## Parts

| Export | Python source | Notes |
|--------|---------------|-------|
| `StandardsRepository` | `StandardsRepository(Protocol)` | Six **synchronous** methods, camelCase names of the Python ones: `nationalAmount`, `healthCareAmount`, `transportationArea`, `transportationOwnershipAmount`, `transportationOperatingAmount`, `housingAmount`. Sync on purpose: a later plan fetches one `standards_bundle` per evaluation and wraps it, so the engine stays pure and never awaits. |
| `StandardsLookupError` | `StandardsLookupError(LookupError)` | Thrown by a repository that has no value for the supplied inputs. `name` is set so callers can tell it from other errors. |
| `nationalStandard(repo, householdSize)` | `national_standard` | Delegates to `nationalAmount`. |
| `healthCareStandard(repo, age)` | `health_care_standard` | Delegates to `healthCareAmount`. |
| `transportationArea(repo, state, county)` | `transportation_area` | Delegates to `transportationArea`. |
| `transportationOwnershipStandard(repo, vehicleCount)` | `transportation_ownership_standard` | Delegates. |
| `transportationOperatingStandard(repo, area, vehicleCount)` | `transportation_operating_standard` | Delegates. |
| `housingStandard(repo, state, county, householdSize)` | `housing_standard` | Delegates. |

The facade looks redundant, but `determination.ts` calls it exactly where Python calls `standards.*`, which keeps the port line-for-line and the recorded call order identical.

## Tests

`parity.test.ts` implements this interface with a replay fake that maps each method to its Python name (`nationalAmount` ↔ `national_amount`, …) and throws on any call that is not next in the recorded sequence.
