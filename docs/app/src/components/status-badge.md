# `app/src/components/status-badge.tsx`

`StatusBadge({ tone, label, size, icon })` renders one status as the vendored shadcn `Badge` with `variant="outline"` plus the tone classes from `lib/status.ts`.

| Part | What it does |
|------|--------------|
| Props | `tone` (a `Tone`), `label` (the text), `size` (`'sm'` default for admin, `'lg'` for client pages), `icon` (optional node rendered before the label). |
| Classes | `rounded-full px-3 py-1 text-sm font-normal` is the UI-SPEC badge geometry (14 px, weight 400, 12/4 padding). `TONE_CLASSES[tone]` adds the color. `size === 'lg'` switches to `text-base` because client pages never go below 16 px. |
| Children | The label is always rendered as text: color is never the only signal (WCAG). |

| `PushState` | The five Logics push ledger states (Phase 5 D-09): `'queued' \| 'sending' \| 'sent' \| 'failed' \| 'unknown'`. `features/logics-push/api.ts` re-exports it. |
| `PUSH` map | State to badge: `queued` muted `Queued`, `sending` info `Sending`, `sent` success `Sent`, `failed` destructive `Failed`, `unknown` warning `Unknown` (UI-SPEC inherited palette). |
| `PushStatusBadge({ state, label? })` | Renders the mapped badge; `label` overrides the text (the push card shows `unknown` as `Needs your decision`). `sending` adds a 12 px `Loader2` with `animate-spin`; the global `prefers-reduced-motion` rule in `styles/index.css` stops the spin for users who ask. The icon is `aria-hidden`; the label carries the meaning. |

## Notes

- Imports only `@/components/ui/badge`, `@/lib/status`, and `@/lib/utils`, never `components/layout`, so the client portal (`/c/*`, Plan 08) can use it without pulling in the admin shell.
- `status-badge.test.tsx` covers `PushStatusBadge`: each state's tone class and label, and the spinner only on `sending`.
- Covered through `request-page.test.tsx` (badges render with their labels) and `status.test.ts` (the tone and label maps).
