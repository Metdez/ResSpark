# `app/src/features/review/address-card.tsx`

The staff address card shown inside the `address` item of the review panel (D-07). It only displays; there is no input, select, combobox, or listbox (ADDR-01: no county dropdown anywhere).

## Props

`address: CaseAddressView | null` — from `review.address` (see `api.md`).

## Rendering

- `null` → one muted line, `The client hasn't confirmed an address yet.`
- Line one: `line1`, `line2` if any, and the status chip (`StatusBadge`).
- Line two: `city, STATE ZIP`, where ZIP is `zip5-zip4` when ZIP+4 exists, else `zip5`.
- County line, only for Smarty addresses with a FIPS: `{county_name} County ({county_fips})`. Plain text.
- RDI line (`Residential` / `Commercial`) when present.
- `Unit missing or not recognized` (muted) for an unverified Smarty address with DPV `D` or `S`.
- Footer: `Source: Smarty` or `Source: entered by client`, then `Confirmed {ago(confirmed_at)}` with the ISO time in the `title` attribute.

## Chip table

| Condition | Tone | Label |
|---|---|---|
| `source === 'manual'` | warning | `Unverified — county unknown` (D-06) |
| `source === 'smarty'` and `verified` | success | `USPS verified` |
| `source === 'smarty'` and not `verified` | warning | `Unverified` |

## Tests (`address-card.test.tsx`)

Verified Smarty card text and the `title` time; the null copy; no select/combobox/listbox; the manual chip and source with no county line; the unverified DPV `D` chip and unit line.
