# `app/src/styles/theme.css`

Design tokens (UI-SPEC "Design System", "Color"). Every oklch value the fork shipped is unchanged; Plan 01-02
Task 2 added the semantic tokens, the `--brand` alias, and the font stack, and removed the Manrope/Inter
`@theme` font variables.

| Lines | What it does |
|-------|--------------|
| 1-26 | `:root` light palette as shipped by shadcn-admin (slate): radius, background/foreground, card, popover, primary, secondary, muted, accent, destructive, border/input/ring, five chart colours. |
| 27-33 | New light semantic tokens: `--success` (emerald-600), `--warning` (amber-400, same value as `--chart-4`), `--warning-foreground` (amber-950), `--info` (sky-600), `--brand` and `--brand-foreground` aliasing primary (white-labeling later overrides only these two). |
| 35-43 | Sidebar tokens aliasing the base palette (unchanged). |
| 45-69 | `.dark` palette as shipped. |
| 70-77 | Dark semantic tokens: `--success` emerald-500, `--warning` unchanged (amber-400 reads on dark), `--info` sky-500, brand aliases. |
| 79-81 | `@theme inline` starts; `--font-sans` is `Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif` — Inter when installed, the system stack otherwise, no webfont request (A-3). |
| 83-86 | Radius scale derived from `--radius`. |
| 87-109 | `--color-*` registrations for the fork's tokens so Tailwind emits `bg-primary`, `text-muted-foreground`, etc. |
| 110-115 | Registrations for the new tokens: `bg-success`, `bg-warning`/`text-warning-foreground`, `bg-info`, `bg-brand`/`text-brand-foreground`. |
| 116-124 | Sidebar colour registrations (unchanged). |

## Notes

- `--font-inter` and `--font-manrope` were removed together with the font switcher (`config/fonts.ts`, `context/font-provider.tsx`); `font-sans` is the only family.
- Status badges do not use these tokens directly; the Inherited badge palette in the UI-SPEC uses Tailwind named colours (`bg-sky-50` ...).
