# E-sign and address real-device check

The "senior on the phone" test (SIGN-04, ADDR-01) on real hardware. The Playwright run (`pnpm -C app test:e2e`) proves the tap budget at 390×844 against a stubbed embed; it cannot reproduce real WebKit/Blink zoom, the on-screen keyboard, the live DocuSeal embed inside our CSP, or DocuSeal's webhook timing. A person runs this once before the demo and after any change to the signing page, the CSP, or the DocuSeal account.

## Before you start

- DocuSeal Test Mode is set up and `Engagement letter (demo)` is mapped ([docuseal-test-mode.md](docuseal-test-mode.md)).
- For the address part, the Smarty secret pair is set (`pnpm -C app secrets:provider smarty`). Without it, check the manual form instead.
- Logics is in fake mode (`/api/config` reports `logics_mode=fake`).
- Phones: one iPhone with **Safari** and one Android phone with **Chrome**. Use a private tab on each.
- On a desktop, open Chrome DevTools → Console for the CSP part.

## Setup

1. Sign in at https://resspark.zh-a16.workers.dev/admin.
2. Look up `(555) 010-0003` (fixture case 900003, `example.com` contact) and create a `Standard resolution packet` request. Send it to the fixture email.
3. On the request page, use the signature card's `Copy signing link` and also `Copy link` for the base link. Send each to the phones (for example with a note-to-self).

## Checks

Count a tap as any touch that changes the screen. Typing is not a tap.

| # | Check | iPhone Safari | Android Chrome |
|---|-------|---------------|----------------|
| 1 | Open the **copied signing link**. The signature field is reached in at most **2 taps** (`Start`, `I agree`). | | |
| 2 | Open a **fresh copy of the base link** (new private tab). The signature field is reached in at most **3 taps** (`Start`, `Sign`, `I agree`). | | |
| 3 | Tap the typed-signature input. The page does **not zoom in**. | | |
| 4 | At every screen in 1-3, nothing scrolls **sideways** (drag left and right). | | |
| 5 | The DocuSeal "Developer Sandbox" banner shows; do not tap it. | | |
| 6 | Type a name, finish. Within seconds the phone returns to the step list with `Signed`. | | |
| 7 | In admin, the signature card shows `Signed` and `Test`, and the item lists the signed PDF and the audit PDF, each with a sha256. Note how many seconds it took. | | |
| 8 | Desktop Chrome: open the signing link and watch the Console while `/c/sign/…` loads the embed. **No** `Content-Security-Policy` violation appears. | (desktop) | (desktop) |

## Address part (with Smarty keys)

| # | Check | iPhone Safari | Android Chrome |
|---|-------|---------------|----------------|
| 9 | On a new request, open `Confirm your address`. Typing a real home-style address shows suggestions after 3 characters, and focusing the box does not zoom. | | |
| 10 | Picking a suggestion shows the USPS-standardized address on the confirm card; `Yes, that's my address` saves it. | | |
| 11 | No county question appears anywhere for the client. | | |
| 12 | In admin, the address card shows the county name, a 5-digit FIPS, `Residential` or `Commercial`, and `USPS verified`. | | |

Without Smarty keys, check instead that the manual form opens at once, saves, and the staff card shows `Unverified — county unknown`.

## Record

Write the device models, OS and browser versions, the tap counts, the seconds from finish to `Signed` (item 7), and any failure into the Phase 6 UAT notes. A failure on items 1-4 or 8 blocks the e-sign demo; fall back to presenting the step as "coming next" (D-21).
