# `app/src/components/ui/button.tsx`

Vendored shadcn/ui `Button` (via shadcn-admin). `buttonVariants` is a `cva` map of `variant` (default, destructive, outline, secondary, ghost, link) and `size`. `Button` renders a `<button>` or, with `asChild`, the Radix `Slot` so the styles land on its child. `data-slot='button'` marks it for styling hooks.

## The one local edit (Phase 2, Plan 02-08)

UI-SPEC permits exactly one change to this file in Phase 2: a client-page size.

| Size | Classes | Used for |
|------|---------|----------|
| `xl` | `h-11 px-6 text-base has-[>svg]:px-4` | Every button under `/c/*`: 44 px tall (the S5 touch-target minimum) and 16 px text. `text-base` overrides the base `text-sm` through `tailwind-merge`. |

The other sizes (`default` 36 px, `sm`, `lg`, `icon`) and every variant are unchanged from upstream. Do not edit anything else here; wrap the button instead.
