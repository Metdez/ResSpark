# `app/src/features/client-portal/step-list.tsx`

`StepList({ steps, onView })`: the client's checklist (D-11, PORT-03).

- **Empty:** a centered block with the Lucide `Inbox` icon (48 px), heading "Nothing to do yet", and "Your agent hasn't added any steps yet. You can close this page."
- **Order:** a sorted copy by `position`. The Worker already sorts; this is defensive and never mutates the prop.
- **Row:** an `<li data-step-row>` with `min-h-11` (44 px), `flex-wrap` so the chip and button drop below the text on a 320 px screen at 200 % zoom, and a bottom border except on the last row.
  - Left: the label (`data-step-label`, `text-base`, `break-words`) and its description from `STEP_DESCRIPTIONS[kind]` (`text-base`, muted).
  - Right: a `StatusBadge size='lg'` (16 px) from `itemStatusBadge(status, 'client')`: Not started, In progress (also for `submitted`; clients never see "review"), Done, Needs attention. The label text is always present, so the chip never relies on color alone.
  - A `Button size='xl' variant='outline'` "View" (44 px) with `aria-label` "View {label}" so screen readers can tell rows apart. It calls `onView(step)` (a no-op by default).
- Two steps of the same kind are two rows, each with its own label; `key` is the item id.
- Imports only `@/lib/status`, `ui/button`, `status-badge`, the portal types, and the copy file. Nothing from the admin shell, `@/lib/api`, or supabase.

## Tests

Covered in `portal-page.test.tsx`: row height, label size, chips, View size, order, same-kind rows, empty state, and no text below 16 px.
