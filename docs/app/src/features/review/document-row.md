# `app/src/features/review/document-row.tsx`

One uploaded file in the review panel's table (Plan 03-03; D-05, UPL-03): a 40 px dense row.

| Part | What it does |
|------|--------------|
| `MIME_LABEL` | Short labels for the three accepted types: `PDF`, `JPEG`, `PNG`. Any other value shows as stored. |
| `formatSize(bytes)` | `null` → `—`; under 1 MiB → whole `KB` (at least `1 KB`); otherwise `MB` with one decimal. |
| `openFile(d, disposition)` | Asks the Worker for a fresh 5-minute signed URL (`documentUrl`) and opens it with `window.open(url, '_blank', 'noopener')`. The file never renders inside the admin origin, so there is no `<iframe>` or `<img>` of a client file (T-03-16). `noopener` stops the new tab from reaching back into the SPA. With `attachment`, Storage answers with `Content-Disposition: attachment` and the original file name, so the new tab downloads it. A failure shows `toast.error("Couldn't open this file", …)` with the error code in the description. |
| `IconAction` | A ghost icon button with an `aria-label` and a `Tooltip` of the same text. |
| `DocumentRow` | Cells: the file name (link-styled, truncated, full name in `title`), the type label, the size (right-aligned, `tabular-nums`), `ago(uploaded_at)` with the ISO time in `title`, the document badge `<StatusBadge {...documentStatusBadge(d.status)} />`, and the `Preview` and `Download` actions. `data-document-row` carries the id for tests. |

## Shortcut

`window.open` runs after the URL fetch resolves, outside the click's user gesture. Strict popup blockers (Safari) may block it. The `shortcut:` comment names the upgrade: open a blank tab synchronously on click, then set its location.
