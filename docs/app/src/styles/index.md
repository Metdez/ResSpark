# `app/src/styles/index.css`

Tailwind 4 entry stylesheet (the `tailwind.css` path in `components.json`). Fork content plus the
reduced-motion block from the UI-SPEC accessibility floor.

| Lines | What it does |
|-------|--------------|
| 1-3 | Imports Tailwind, `tw-animate-css`, and the tokens in `theme.css`. |
| 5 | `dark` variant keyed on the `.dark` class on `<html>` (set by `ThemeProvider`). |
| 7-12 | Base layer: every element gets `border-border` and the global focus ring `outline-ring/50` (never remove), thin scrollbars. |
| 13-19 | `html` hides horizontal overflow; `body` fills the viewport with the background/foreground tokens (sidebar tone when an inset layout is present). |
| 21-24 | Keeps `body` scrollable while Radix locks scroll, so sticky headers keep working. |
| 26-30 | Pointer cursor on enabled buttons. |
| 32-38 | Below 768 px, inputs/selects/textareas are forced to 16 px so iOS does not zoom on focus (UI-SPEC: keep this rule). |
| 41-58 | Utilities: `container` (centered, 2 rem inline padding), `no-scrollbar`, `faded-bottom` gradient for scroll areas. |
| 60-87 | Radix `Collapsible` open/close height animations (sidebar nav groups). |
| 89-95 | `prefers-reduced-motion: reduce` collapses every animation and transition to 0.01 ms (WCAG 2.2 AA floor). |
| 97-104 | Plan 03 SANDBOX offset. When a `[data-slot='sandbox-banner']` is on the page, the fixed sidebar container moves down 2.25 rem (36 px) and shrinks by the same amount, and the sticky `.header-fixed` header sticks at 2.25 rem. The rules are unlayered so they beat Tailwind's utility layer without editing the vendored `sidebar.tsx`/`header.tsx`. |
