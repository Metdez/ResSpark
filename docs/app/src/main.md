# `app/src/main.tsx`

SPA entry point. Builds the TanStack Query client and the file-based router, then mounts the provider
tree. Forked from shadcn-admin with the axios/Clerk/mock-auth branches and the font switcher removed.

| Lines | What it does |
|-------|--------------|
| 1-8 | React root, `QueryCache`/`QueryClient`/`QueryClientProvider`, `createRouter`/`RouterProvider`. |
| 9-11 | `ApiError` (to tell 4xx from other errors), `handleServerError` (the single error handler), and `signOutEverywhere`. |
| 12-13 | The two app-wide providers: text direction and theme. |
| 15 | Generated route tree from `@tanstack/router-plugin` (`routeTree.gen.ts`). |
| 17 | Global stylesheet (Tailwind entry, `styles/index.css`). |
| 19-29 | `endSession()`, run when the Worker answers 401 (PLAT-07: a rejected token means signed out): `signOutEverywhere('expired')` (no event post, the token is already refused), navigate to `/admin/sign-in?redirect=<current path>` with `replace`, then clear the query cache. Clearing comes last so no still-mounted query refetches without a token. `router` and `queryClient` are declared below; the function only runs after both exist. |
| 31-32 | `onApiError`: `handleServerError` with `endSession` as its 401 callback. |
| 34-50 | Query client: a `QueryCache` whose `onError` is `onApiError`, so every failed query gets the UI-SPEC copy (401 session ended, 403 no access, otherwise generic + code). Queries never retry in dev and up to 3 times in prod, but never on a 4xx `ApiError`, so a 401 reaches the handler at once. Refetch on focus only in prod; 10 s stale time; every mutation error also goes to `onApiError`. |
| 52-58 | Router with the query client in context, preload on intent, preloaded data never considered fresh. |
| 60-65 | Registers the router type so `Link`/`navigate` paths are type-checked against the generated tree. |
| 67-82 | Mounts once (guarded by `rootElement.innerHTML`) inside `StrictMode`; `ThemeProvider defaultTheme='light'` is the UI-SPEC A-4 light default. |

## Notes

- No `AxiosError`, no `useAuthStore`: the fork's `stores/auth-store.ts` was deleted in Plan 06. The staff session lives in supabase-js (localStorage, auto-refresh).
- `FontProvider` was removed in Task 2 of Plan 02 (one font stack, no webfont — UI-SPEC A-3).
