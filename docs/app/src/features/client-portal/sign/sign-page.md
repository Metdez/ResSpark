# `app/src/features/client-portal/sign/sign-page.tsx`

`SignPage({ itemId })`: the full-bleed signing page at `/c/sign/$itemId` (D-13, D-14, D-16, SIGN-03, SIGN-04).

## Layout

- Root `min-h-dvh`, no `ClientShell` card, so DocuSeal's form gets the full phone width.
- Sticky header (`sticky top-0`, `min-h-11` = 44 px) with a `Link` to `/c` reading "Back to your steps" (16 px, `ArrowLeft` icon). The link itself is `min-h-11`, so the tap target is 44 px.
- `main` is centered and capped at `max-w-3xl` for desktops.

## Flow

1. `useQuery(['portal','state'])` gives the firm name for the consent sheet (from the cache when coming from the step list) and detects a lost session.
2. `useHeartbeat({ enabled: !lost, lastStep: 'signature' })`: the staff mirror shows the client is on the signing step (SIGN-04).
3. A `useMutation` runs `startSigning(itemId)` on mount. When its argument `agree` is true it first calls `recordConsent('esign')`, which sends `{ kind: 'esign', text_version: 'esign-v1' }`.
4. The consent sheet (`ConsentSheet kind="esign"`) is open while the last start failed with `consent_required` or `consent_text_stale`, and while an agree-and-start call is pending (so it shows "Saving…" instead of closing early). `I agree` reruns with `agree = true`. `Not now` navigates to `/c`. A stale text shows "Please read and agree again." inside the sheet.
5. On completion (`onComplete` from the embed) it calls `reconcileConnection(connectionId)` (best effort, never rejects), invalidates `['portal','state']`, and navigates to `/c` with `search: { signed: itemId }`. `PortalPage` then shows the `signed` toast.

## Result to screen

| Start result | Screen |
|---|---|
| pending or not started | "Getting your form ready…" with skeletons |
| `{ kind: 'embed' }` and `embedSrc` starts with `https://docuseal.com/s/` | `DocusealEmbed` (D-16: only after the server returned an `embed_src` for this session after consent) |
| `{ kind: 'signed' }` or 409 `item_approved` | "You already signed this. Your agent has it." and a Back button |
| 503 `provider_not_configured`, `template_not_mapped`, `template_invalid`, or 409 `bad_template` | "Your agent will send this form another way." and a Back button (D-10) |
| 409 `consent_required` or `consent_text_stale` | the consent sheet over the loading view |
| 401 (start or state) | `InvalidLinkPage` |
| anything else (502, 429, network) | "Something went wrong. Try again." with a `Try again` button that starts again |

## Tap budget (SIGN-04)

- Fresh link: `Start` (portal intro), `Sign` (signature row), `I agree` (consent sheet) = 3 taps to the signature field.
- Copied signing link `/c/<token>?step=<itemId>`: `Start`, `I agree` = 2 taps; `PortalPage` auto-opens the step after Start.
- Proven at 390×844 by `app/e2e/sign-taps.spec.ts`.

## Notes

- In development React StrictMode runs the mount effect twice, so two start calls go out; the Worker reuses the submission, and production does not double-invoke.
- It never links to DocuSeal's `/s/` page directly; the client always enters through the ResSpark link (D-17).
- Imports nothing from `@/lib/api`, `@/lib/supabase`, or `@/components/layout`, and no text is below 16 px.

## Tests

See `sign-page.test.md`.
