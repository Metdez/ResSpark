# `app/src/features/review/connections/open-signed.ts`

`openSigned(signed)` opens one client file from a connection card. The caller passes the pending `documentUrl(id, 'inline')` call (the Phase 3 signed-URL route in `features/review/api.ts`). When it resolves, the 5-minute signed URL opens with `window.open(url, '_blank', 'noopener')`. The file never renders inside the admin origin, and the SPA keeps no copy of the bytes or the URL (Phase 3 D-05, T-04-31). `noopener` stops the new tab from reaching back into the SPA.

On failure it shows `toast.error("Couldn't open this file")`, with the error code in the description when the failure is an `ApiError`. The copy matches Phase 3's `document-row.tsx`.

It lives in its own module, not in `statement-grid.tsx`, because a `.tsx` file that exports a non-component breaks React fast refresh (`react-refresh/only-export-components`). The statement grid and the payroll panel both import it.

Shortcut: `window.open` runs after the fetch resolves, outside the click's user gesture, so a strict popup blocker (Safari) may block it. The upgrade is to open a blank tab synchronously on click and set its location afterwards.
