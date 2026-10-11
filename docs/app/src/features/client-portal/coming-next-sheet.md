# `app/src/features/client-portal/coming-next-sheet.tsx`

`ComingNextSheet({ step, onClose })`: the placeholder every step's `View` opens in Phase 2 (D-11). The real step screens (bank and payroll connects, address, uploads, signing, intake) arrive in Phases 3-6.

- **Open state:** `Sheet open={!!step}`. `onOpenChange(false)` (Escape, overlay tap, or Close) calls `onClose`, which clears the step in `StepList`.
- **Placement:** `SheetContent side='bottom'`, the phone-friendly position. `mx-auto max-w-[30rem] rounded-t-lg` keeps it the width of the S5 column on wider screens.
- **Icon close hidden:** the vendored `SheetContent` always appends a 16 px icon-only close button as its last child. `[&>button:last-child]:hidden` hides it, because every interactive element under `/c/*` must be at least 44 px, and the sheet already has a 44 px Close. `sheet.tsx` itself stays untouched (vendored).
- **Content:** `SheetTitle` is the step label (20 px). `SheetDescription` (rendered as a `div` via `asChild`, 16 px) holds `COMING_NEXT.title` ("Coming next") and `COMING_NEXT.body` ("This step isn't ready yet. Your agent will tell you when it is. You can close this page."). Radix wires the title and description to the dialog's `aria-labelledby` and `aria-describedby`.
- **Close:** `SheetClose asChild` around a full-width `Button size='xl' variant='outline'` (44 px).
- Nothing else: no vendor names, no hints about how the step will work.

## Tests

`step-list.test.tsx` opens the sheet from `View`, checks the label, the copy, the 44 px Close, that the hidden icon close is the last child, and that Close hides the sheet.
