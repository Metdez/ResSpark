# `app/src/lib/us-states.ts`

Shared by the SPA (the manual address form's state picker, Plan 06-03) and the Worker (the manual-address body guard in `routes/c-address.ts`). Like `contact.ts`, it is pure TypeScript with no DOM and no `@/` imports, so both builds can import it.

- `US_STATES`: 51 `{ code, name }` entries, the 50 states plus `DC` "District of Columbia", sorted by name. Territories (PR, GU, and so on) are left out on purpose: the address step feeds the IRS county standards, which cover the states and DC.
- `CODES`: a private `Set` of the codes for constant-time lookup.
- `isUsStateCode(v)`: type guard. True only for an exact uppercase code in the list, so `'ca'` is false.
