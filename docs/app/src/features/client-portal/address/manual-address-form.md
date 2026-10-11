# `app/src/features/client-portal/address/manual-address-form.tsx`

`ManualAddressForm({ itemId, notice, onSaved })`: the D-06 manual fallback inside the address sheet.

- Fields: `Street address`, `Apartment or unit (optional)`, `City`, `State`, `ZIP code`, each with a `<label>`, 44 px tall (`h-11`), 16 px text, and an `autoComplete` hint (`address-line1`, `address-line2`, `address-level2`, `address-level1`, `postal-code`). ZIP has `inputMode="numeric"` and `maxLength={5}`.
- State: a native `<select>` over `US_STATES` (label is the name, value is the code; 50 states and DC) with a blank `Choose a state` option. Native rather than the shadcn/Radix `Select` so the phone shows its own picker and no portal or pointer-capture code is needed in the `/c/*` bundle.
- No county field (ADDR-01).
- `validate`: street and city must be non-blank, a state must be chosen, and ZIP must be 5 digits. Errors render inline under each field (`aria-invalid`, `aria-describedby`) and block the POST.
- Submit: `confirmAddress(itemId, { source: 'manual', street, unit?, city, state, zip5 })`; a blank unit is omitted. While pending the button reads `Saving…` with a spinner and is disabled. Success calls `onSaved(result)`; any error shows `Something went wrong. Try again.`
- `notice` (why the form opened) shows under the title when present.

Tests (`manual-address-form.test.tsx`): the 51 options and no county; the four field errors; a 4-digit ZIP; the POST body with and without `unit`; the pending state; a 409.
