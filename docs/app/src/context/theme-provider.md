# `app/src/context/theme-provider.tsx`

Theme context: light by default, dark on request, persisted in a cookie. Forked; the `system` option and
the `matchMedia` detection were removed (UI-SPEC A-4).

| Lines | What it does |
|-------|--------------|
| 1-2 | React context hooks and the cookie helpers. |
| 4-9 | `Theme` is `'dark' | 'light'`; default `light`; cookie name `vite-ui-theme`, one-year max age. |
| 11-23 | Props (`defaultTheme`, `storageKey`) and the context shape (`theme`, `resolvedTheme`, setters). `resolvedTheme` is kept equal to `theme` so consumers written for the fork's API (`theme-switch`, `sonner`) still type-check. |
| 25-33 | Initial context value and the context object. |
| 35-36 | `isTheme` guard: only `light`/`dark` cookie values are trusted; anything else (including an old `system` cookie) falls back to the default. |
| 38-47 | Provider state initialised from the cookie or `defaultTheme`. |
| 49-53 | Applies the theme class to `<html>` whenever it changes. |
| 55-63 | `setTheme` writes the cookie and state; `resetTheme` clears the cookie and returns to the default. |
| 65-78 | Context value and provider element. |
| 80-87 | `useTheme` hook. |

## Notes

- Client routes (`/c/*`, Plan 07) never mount a toggle, so they always render light unless a staff cookie is present on the same device.
