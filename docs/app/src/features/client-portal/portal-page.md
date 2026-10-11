# `app/src/features/client-portal/portal-page.tsx`

`PortalPage`: the whole `/c/` screen a client sees after following their link (D-10, D-13, PORT-01..06). The Worker has already swapped the token for the `rs_client` cookie and redirected to `/c/`, so the page never sees the token.

## Data

- `useQuery(['portal', 'state'], getState)` with `retry: false` (a 401 must show at once) and `refetchOnWindowFocus: true`. TanStack Query's focus manager also listens to `visibilitychange`, so a staff-side change or a revoke shows the next time the client returns to the tab.
- `useMutation(start)`: on success it writes `opened_at` into the cached state with `setQueryData`, so the step list appears without a reload or a second state fetch. On a 401 the page swaps to the invalid-link copy; any other failure shows the toast "Couldn't start. Try again." (no code). Defining `onError` here replaces the app-wide mutation handler.

## Heartbeat

`useHeartbeat` runs once the state has loaded and the session is valid. `last_step` is `intro` before Start, then `list`, then the kind of the last step whose `View` was tapped. `last_error` is `state_failed` while a state refetch is failing (data still cached) or `start_failed` after a failed Start; otherwise it is the latest upload error code (`uploadError` state, set by `StepList`'s `onUploadError` from the upload sheet), so staff see what the client hit while uploading. `useHeartbeat` re-sends when `last_error` changes. A 401 renders the invalid-link page and turns `enabled` off, so a revoke stops the heartbeat at the next refetch.

## Render order

1. **No session** (`PortalError` 401 from the state query or from Start): `<InvalidLinkPage />`, the Phase 1 component with the same words as the Worker's 404 page. This also covers `/c/` opened with no cookie at all.
2. **No data yet:** the `ClientShell` with the app name and either
   - an error: "Something went wrong" / "Close this page and open your link again." (no code shown), or
   - loading: three 16 px `Skeleton` bars (`aria-busy`).
   A refetch error while data is cached keeps showing the data.
3. **Unopened** (`opened_at === null`): heading "{agent} at {firm} needs a few things from you" (or "{firm} needs ..." without an agent), "It takes a few minutes. You can stop and come back any time from the same link.", and one full-width `Button size='xl'` "Start" (the only accent element). While pending it reads "Starting…" with a spinning `Loader2` and is disabled.
4. **Opened:** heading "Your steps" and `StepList` (given `firmName={data.firm_name}` for the connect steps' consent sheets, and `onCloseStep` that clears the viewed kind so `last_step` returns to `list` when a sheet closes), whose `onView` records the viewed step kind for the heartbeat. Reopening the link later lands here directly, because `opened_at` is saved on the server (PORT-04).

`ClientShell` owns the firm heading (`truncate` + `title`), the "Your agent: {name}" line, `document.title`, and the robots `noindex` meta. Names render as React text, so they are escaped.

## Saved progress (PORT-04 assumption)

In Phase 2 "progress saved per step" means the server-side `request_items.status` and `client_links.opened_at`. There is no client-side draft state; Phases 3-6 persist their own step progress on the server.

## Tests

`portal-page.test.tsx` uses the `query-render` harness with a stubbed `fetch`: the 401 page, the generic error, the intro with and without an agent, the tab title, Start's header and pending label, the step list after Start with one state fetch, a Start 401, a Start failure toast, the opened shortcut, the empty list, row sizing and chips, same-kind rows, the heartbeat step values (`intro`, `list`, the viewed kind), the latest upload error code (`unsupported_type` after picking a `.txt` in the upload sheet) as `last_error`, and no heartbeat without a session.

## Connect steps (Plan 04-05)

The payroll and bank sheets open from `StepList`; `last_step` is the step kind (`payroll_connect` / `bank_connect`) while one is open and `list` again after it closes. The sheets read a rejected step's `rejection_note` from the item's document list; nothing in this page changes for that.

## Signing deep link and the "Signed" message (Plan 06-06)

- `useSearch({ from: '/c/' })` reads the two UUID-only search params validated in `routes/c/index.tsx`: `step` (a copied signing link, D-17) and `signed` (set by the signing page after completion).
- `step` is passed to `StepList` as `autoOpenId` only once the step list renders, which is right after `Start` succeeds for a new client and immediately for a returning one. So a copied link costs `Start` plus `I agree` = 2 taps. `onAutoOpened` clears `step` with `navigate({ to: '/c', search: { signed }, replace: true })`; a signature step clears it itself by replacing the history entry with the signing route.
- `signed`: an effect shows `toast.success('Signed. Your agent has it.')` (the root Toaster is top-center on `/c/*`) and clears `signed` with a `replace` navigation, so a reload does not show it again.
- Tests (router and `sonner` mocked): `signed` toasts once and clears; a deep-linked signature does not navigate before `Start` and navigates to `/c/sign/$itemId` with `replace: true` right after it; a deep-linked upload opens its sheet for a returning client and clears `step`. The row-size test now expects `Sign` on the signature row.
