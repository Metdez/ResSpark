# `app/src/features/client-link/client-shell.tsx`

`ClientShell`: the S5 layout every client page (`/c/*`) uses, in Phase 1 and later (UI-SPEC S5, D-04). Clients open these pages on phones, so the layout is one narrow column with no admin chrome.

## Props

| Prop | Meaning |
|------|---------|
| `firmName` | Shown as the page heading and used as the browser tab title. |
| `agentName` | Optional. When present, a muted line "Your agent: {name}" under the firm name. Phase 1 never passes it. |
| `children` | The single task or message of the screen, rendered inside the card. |

## Effect

- Sets `document.title` to the firm name only, with no product branding (white-label hygiene).
- Adds `<meta name="robots" content="noindex">` to `<head>` if none exists, and removes the tag it added on unmount. This backs up the Worker's `X-Robots-Tag: noindex` header.

## Layout

- Backdrop `min-h-svh bg-muted/40`.
- `<main id="main">`: `mx-auto w-full max-w-[30rem] px-4 pt-16 pb-8`, a 480 px column with 16 px side padding and 64 px top offset.
- Header: the firm name as a 20 px heading with `truncate` and the full text in `title`, so a long name stays on one line; the agent line uses `line-clamp-2` and `text-base`.
- One `Card` with `rounded-lg p-6` holds `children`.

## Rules

- Imports only `react` and `@/components/ui/card`. Never import `@/components/layout` (sidebar, header) here or in `routes/c/**`, so the client chunks stay free of the admin bundle.
- No text below 16 px on client pages: use `text-base` or larger, never `text-sm` or `text-xs`.
- No theme toggle, analytics, third-party scripts or web fonts.
