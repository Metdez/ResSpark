# `app/src/main.tsx`

SPA entry point. Builds the TanStack Query client and the file-based router, then mounts the provider
tree. Forked from shadcn-admin with the axios/Clerk/mock-auth branches and the font switcher removed.

| Lines | What it does |
|-------|--------------|
| 1-8 | React root, `QueryCache`/`QueryClient`/`QueryClientProvider`, `createRouter`/`RouterProvider`. |
| 9-11 | `ApiError` (to tell 4xx from other errors), `handleServerError` (the single error handler) with `adminErrorHandler` (its route and `meta` filter), and `signOutEverywhere`. |
| 12-13 | The two app-wide providers: text direction and theme. |
| 15 | Generated route tree from `@tanstack/router-plugin` (`routeTree.gen.ts`). |
| 17 | Global stylesheet (Tailwind entry, `styles/index.css`). |
| 19-29 | `endSession()`, run when the Worker answers 401 (PLAT-07: a rejected token means signed out): `signOutEverywhere('expired')` (no event post, the token is already refused), navigate to `/admin/sign-in?redirect=<current path>` with `replace`, then clear the query cache. Clearing comes last so no still-mounted query refetches without a token. `router` and `queryClient` are declared below; the function only runs after both exist. |
| 31-33 | `onApiError`: `handleServerError` with `endSession` as its 401 callback. `onAppError` wraps it with `adminErrorHandler`: only `/admin` routes toast or sign out (client pages under `/c/*` handle their own errors), and a query with `meta.errorShown` only passes a 401 on. |
| 34-52 | Query client: a `QueryCache` whose `onError` is `onAppError(error, query.meta)`, so every failed admin query gets the UI-SPEC copy (401 session ended, 403 no access, otherwise generic + code) unless its screen already shows the error. Queries never retry in dev and up to 3 times in prod, but never on a 4xx `ApiError`, so a 401 reaches the handler at once. Refetch on focus only in prod; 10 s stale time; every mutation error without its own `onError` also goes to `onAppError` (`unlessHandled` forwards the unhandled ones). |
| 55-61 | Router with the query client in context, preload on intent, preloaded data never considered fresh. |
| 63-68 | Registers the router type so `Link`/`navigate` paths are type-checked against the generated tree. |
| 70-85 | Mounts once (guarded by `rootElement.innerHTML`) inside `StrictMode`; `ThemeProvider defaultTheme='light'` is the UI-SPEC A-4 light default. |

## Notes

- No `AxiosError`, no `useAuthStore`: the fork's `stores/auth-store.ts` was deleted in Plan 06. The staff session lives in supabase-js (localStorage, auto-refresh).
- `FontProvider` was removed in Task 2 of Plan 02 (one font stack, no webfont — UI-SPEC A-3).
