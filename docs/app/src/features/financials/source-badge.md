# `app/src/features/financials/source-badge.tsx`

Source badges and status chips for 433-A lines (D-10, D-14), on the UI-SPEC inherited palette (`TONE_CLASSES`).

| Part | What it does |
|------|--------------|
| `SOURCES` | Display names for proposal sources: `truv` Truv, `plaid` Plaid, `intake` Intake, `logics` Logics, `address` Address, `document` Document, `staff` Staff. |
| `sourceName(source)` | The display name, or the raw value for a source the map does not know yet. |
| `SourceBadge({ source })` | shadcn `Badge variant="outline"` in the neutral tone with the display name. |
| `CHIPS` | Line status → tone and label: `needs_data` warning `Needs data`, `proposed` info `Proposed`, `confirmed` success `Confirmed`, `edited` neutral `Edited`, `standard` muted `IRS standard` (expense lines 36 and 42, which have no value to confirm). |
| `StatusChip({ status })` | A rounded outline `Badge` with the chip's tone classes and label. Status is conveyed by text as well as colour (UI-SPEC accessibility floor). |
