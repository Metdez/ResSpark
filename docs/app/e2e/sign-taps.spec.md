# `app/e2e/sign-taps.spec.ts`

The automated "senior on the phone" gate (SIGN-04, D-13, D-14), run at 390 × 844 on Chromium by `playwright.config.ts`.

## Helpers

- `noSideScroll(page)`: `document.documentElement.scrollWidth <= window.innerWidth`.
- `counter(page)`: `tap(locator)` adds one to the count, taps, then asserts there is no sideways scroll. `count()` reads the total.
- `field(page)`: `docuseal-form [data-testid="signature-field"]`; Playwright's CSS locators pierce the open shadow root.
- `signRow(page)`: the row button by its accessible name "Sign Sign your engagement letter"; `agree(page)`: the "I agree" button.

No `waitForTimeout`: every wait is a locator assertion.

## Tests (7)

1. **Fresh link, at most 3 taps:** `/c/` → `Start` → `Sign` → (start 409, consent sheet) `I agree` → the signature field is visible. Observed: 3 taps; no sideways scroll after any tap.
2. **Copied signing link, at most 2 taps:** `/c/?step=<SIG_ID>` → `Start` (the portal auto-opens the signing route) → `I agree` → field visible. Observed: 2 taps.
3. **Consent sheet:** on `/c/sign/<SIG_ID>` the `I agree` button is fully in the viewport without scrolling, and the sheet lists five points.
4. **Embed attributes:** `data-src` is `EMBED_SRC`, `data-allow-to-resubmit`, `data-with-send-copy-button`, and `data-send-copy-email` are `false`, and `data-custom-css` contains `font-size:16px`.
5. **16 px inputs:** every `input`, `select`, and `textarea` in the page and in the embed's shadow root computes at least 16 px (and at least one exists).
6. **Not configured:** the start mock answers 503 `provider_not_configured`; "Your agent will send this form another way." is visible and no `docuseal-form` exists.
7. **Completion:** tapping the fake's Sign button dispatches `completed`; the mock records `POST /api/c/connections/C1/reconcile`, the URL returns to `/c`, and "Signed. Your agent has it." is visible.

## Held out

Real devices are not covered here: the iPhone Safari and Android Chrome checks (pinch-zoom, keyboard, the real DocuSeal form, the deployed CSP) are the human check in Plan 06-08.
