# `app/src/components/status-badge.tsx`

`StatusBadge({ tone, label, size })` renders one status as the vendored shadcn `Badge` with `variant="outline"` plus the tone classes from `lib/status.ts`.

| Part | What it does |
|------|--------------|
| Props | `tone` (a `Tone`), `label` (the text), `size` (`'sm'` default for admin, `'lg'` for client pages). |
| Classes | `rounded-full px-3 py-1 text-sm font-normal` is the UI-SPEC badge geometry (14 px, weight 400, 12/4 padding). `TONE_CLASSES[tone]` adds the color. `size === 'lg'` switches to `text-base` because client pages never go below 16 px. |
| Children | The label is always rendered as text: color is never the only signal (WCAG). |

## Notes

- Imports only `@/components/ui/badge`, `@/lib/status`, and `@/lib/utils`, never `components/layout`, so the client portal (`/c/*`, Plan 08) can use it without pulling in the admin shell.
- Covered through `request-page.test.tsx` (badges render with their labels) and `status.test.ts` (the tone and label maps).
