# `app/worker/src/standards/bundle-repository.test.ts`

Unit tests for the strict standards repository (D-11, T-07-18). The suite has no database access. The amounts in `BUNDLE` are arbitrary test data, not IRS figures. The tests check which inputs the repository accepts, not what the standards are.

| Part | What it checks |
|------|----------------|
| `BUNDLE` / `repo(over)` | A CA / Los Angeles County bundle for a household of 2 with 1 vehicle, with optional overrides. |
| `returns the bundle values…` | Each of the six lookups returns its bundle value when called with the bundle's own inputs, at ages 30 and 65. |
| `throws StandardsLookupError on …` | The lookup throws in each of these cases: a household mismatch (national and housing), a vehicle mismatch (ownership and operating), age 40, an area mismatch, a county mismatch, a null `housing`, and a null area. |
| `uses the Python wording` | The message is `No housing standard found for supplied values.` |
| `a 0-vehicle bundle…` | With `vehicle_count 0` and area `''`, `transportationOperatingAmount('', 0)` and `transportationOwnershipAmount(0)` return the bundle values. Those are the calls the engine makes with no vehicles. |
| `isStandardsBundle` | Accepts null amounts and a null area. Rejects `null`, an array, a string amount, a fractional household size, a missing state, and a numeric area. |
