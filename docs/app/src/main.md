# `app/src/main.tsx`

SPA entry point. Builds the TanStack Query client and the file-based router, then mounts the provider
tree. Forked from shadcn-admin with the axios/Clerk/mock-auth branches removed.

| Lines | What it does |
|-------|--------------|
| 1-4 | React root, `QueryClient`/`QueryClientProvider`, `createRouter`/`RouterProvider`. |
| 5 | `handleServerError` — the single mutation error handler (toast). |
| 6-8 | The three app-wide providers: text direction, font, theme. |
| 10 | Generated route tree from `@tanstack/router-plugin` (`routeTree.gen.ts`). |
| 12 | Global stylesheet (Tailwind entry, `styles/index.css`). |
| 14-25 | Query defaults: no retries in dev, up to 3 in prod; refetch on focus only in prod; 10 s stale time; every mutation error goes to `handleServerError`. The fork's axios status branches (401 redirect, 500 page) are gone — Plan 03 reintroduces status handling through the `ApiError` envelope. |
| 28-33 | Router with the query client in context, preload on intent, preloaded data never considered fresh. |
| 36-40 | Registers the router type so `Link`/`navigate` paths are type-checked against the generated tree. |
| 43-59 | Mounts once (guarded by `rootElement.innerHTML`) inside `StrictMode`; `ThemeProvider defaultTheme='light'` is the UI-SPEC A-4 light default. |

## Notes

- `FontProvider` and `DirectionProvider` are still the fork's; Task 2 of Plan 02 removes the font switcher.
- No `AxiosError`, no `useAuthStore` here; the only remaining fork store (`stores/auth-store.ts`) is deleted in Plan 06.
