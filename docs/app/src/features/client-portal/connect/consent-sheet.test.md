# `app/src/features/client-portal/connect/consent-sheet.test.tsx`

Renders `ConsentSheet` for `payroll_data` and firm `ValorTax` with `renderWithQuery` (the shared jsdom harness) and reads the `role="dialog"` element.

1. Title, body, and the detail with "ValorTax receives this information"; no literal `{firm}` remains.
2. Exactly one `I agree` button, with the 44 px `h-11` class, and a `Not now` button.
3. `busy` renders a disabled `Saving…` button; re-rendered not busy, clicking `I agree` calls `onAgree` once.
