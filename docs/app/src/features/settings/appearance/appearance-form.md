# `app/src/features/settings/appearance/appearance-form.tsx`

Appearance settings form: a light/dark radio group. Forked; the font selector (Inter/Manrope/system) and
its `@radix-ui/react-icons` chevron were removed with the font switcher.

| Lines | What it does |
|-------|--------------|
| 1-16 | Zod, react-hook-form + resolver, `showSubmittedData` (toast echo of the submitted values), `useTheme`, shadcn `Button`, `Form` parts, `RadioGroup`. |
| 18-22 | Schema: `theme` is `light` or `dark`; inferred form type. |
| 24-30 | Reads the current theme and seeds the form with it. |
| 32-36 | On submit: applies the theme if it changed, then echoes the values in a toast. |
| 38-57 | The `theme` field header: label, description, message slot, radio group. |
| 58-83 | Light option: hidden radio plus a miniature light-UI preview; selected state draws the primary border. |
| 84-109 | Dark option, same structure with the dark preview. |
| 113 | Submit button `Update preferences`. |

## Notes

- `showSubmittedData` is the fork's demo toast; harmless, but it will be replaced when Phase 2 adds real settings.
