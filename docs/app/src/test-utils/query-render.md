# `app/src/test-utils/query-render.tsx`

Shared harness for SPA component tests that use TanStack Query (Plan 02-05). It follows the Phase 1 pattern (`createRoot` + `act` inside a `QueryClientProvider`, `fetch` stubbed, no testing-library) so the builder and lookup tests do not each repeat it.

| Part | What it does |
|------|--------------|
| `Reply` | A stubbed answer: `{ status, body }`, or `'pending'` for a request that never settles (to test loading and in-flight states). |
| `tick()` | One macrotask inside `act`, so resolved promises flush into React state. |
| `waitFor(check, ms)` | Polls inside `act` every 10 ms until `check()` is true, or throws after `ms` (default 2 s). Needed because the first `api()` call lazily imports `@/lib/supabase`, which can take longer than one tick. |
| `renderWithQuery(ui, replies)` | Stubs `fetch` to answer from the `'METHOD /path'` table (an unknown path throws so a stray call fails the test), stubs `ResizeObserver`, adds no-op `scrollIntoView` / `hasPointerCapture` / `releasePointerCapture` (Radix needs them in jsdom), renders `ui` in a fresh `QueryClient` with query retries off, and returns `{ el, fetchMock }`. |
| `cleanup()` | Unmounts, removes the container, restores globals, and clears mocks. Use as `afterEach(cleanup)`. |
| `button(text, scope)` | The button whose trimmed text equals `text`. |
| `inputByLabel(text)` | The input a `<label>` with that exact text points at. |
| `type(input, value)` | Sets a controlled input's value through the native setter and fires `input`, which React reads as a change. |
| `click(el)` | Clicks inside `act`, then ticks. |
| `keyDown(el, key)` | Dispatches a bubbling `keydown` (used to open a Radix `Select`). |
| `postedBody(fetchMock, path)` | The parsed JSON body of the first `POST` to `path`, or `undefined`. |

## Notes

- `vi.mock('@/lib/supabase', ...)` stays in each test file: Vitest hoists mocks per file.
- `request-page.test.tsx` (Task 1) predates this file and keeps its own copy of the same harness.
