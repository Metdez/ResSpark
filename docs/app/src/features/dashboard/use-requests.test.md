# `app/src/features/dashboard/use-requests.test.ts`

Unit tests for `useRequests`. They run in the `web` Vitest project. `useQuery` is mocked to record its options, so the hook runs as a plain function with no React tree. `./api` is mocked so that `fetchRequests` is a spy.

- `options()` returns the options from the last `useQuery` call.
- The cases check the poll interval, `keepPreviousData`, that background polling is not enabled, the query key for no filter and for a filter, and that `queryFn` fetches with the same filter. See `use-requests.md` for why each option matters.
