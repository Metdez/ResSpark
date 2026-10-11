# `app/src/features/client-portal/connect/consent-sheet.tsx`

`ConsentSheet({ kind, firmName, open, busy, notice?, onAgree, onClose })`: the "Use of data" statement (D-12, BANK-05) shown before the first connect of a kind.

- A bottom `Sheet` (max 30 rem wide; the vendored 16 px icon close is hidden, as in `ComingNextSheet`). Swiping down or tapping outside calls `onClose`.
- Title: `CONSENT_TEXT[kind].title` at 20 px (`text-xl`).
- `notice` (optional): one 16 px line in the foreground color above the body, used for "Please read and agree again." after a stale consent.
- Description: the body at 16 px in the foreground color, then the detail at 16 px muted with `{firm}` replaced by `firmName`.
- `Button size='xl'` (44 px) with `CONSENT_TEXT[kind].agree` ("I agree"). While `busy` it reads "Saving…" with a spinning `Loader2` (still under reduced motion) and is disabled, so the consent is sent once.
- `Button size='xl' variant='outline'` "Not now" calls `onClose`.

The text and its version come from `@/lib/consent-text`, the same module the Worker checks against, so the version the client sends is the version it read.

## Tests

See `consent-sheet.test.md`.

## Points and the pinned footer (Plan 06-06)

- When `CONSENT_TEXT[kind].points` exists (only `esign`, the five 15 U.S.C. 7001(c)(1) disclosures) they render as a bulleted list (`list-disc`, 16 px) between the body and the detail.
- `SheetContent` is capped at `max-h-[90dvh]` with no gap; the header (title and text) is `min-h-0 overflow-y-auto`, and the footer has a top border. The text scrolls while `I agree` and `Not now` stay pinned, so `I agree` is tappable without scrolling on a 390×844 phone.
