# `app/src/features/client-portal/address/use-address-suggest.ts`

`useAddressSuggest(input, selected, enabled)` returns `{ suggestions, isFetching, error }`.

- Debounce: an effect copies `input.trim()` into `q` 250 ms after the last change (`setTimeout`, cleared on each keystroke).
- Query: `useQuery` with key `['portal','address', q, selected]`, `enabled: enabled && q.length >= 3`, `retry: false`, `staleTime: 60_000`. Together with the Worker's 30-per-minute window these bound keystroke cost (T-06-14).
- `last` state: the last successful list, updated during render when new data arrives (React's "adjust state while rendering" pattern, which the hooks lint rule accepts, unlike a ref read during render). While `q` has 3 or more characters the hook returns the current data, or the last list if the current call failed, so a 429 does not blank the rows. Under 3 characters it returns `[]`.
- `error` is passed through; the sheet decides what each error means.
